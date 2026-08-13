import { execFileSync, spawn } from 'node:child_process';
import type { ModelEntry } from '@metroforge/schemas';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  SpeechModelDownloadAdapter,
  isSpeechModelInstalled,
} from './speech-model-download.js';

/** Hugging Face repo ids are `org/name` or `name`, using only word characters, dots, and
 *  dashes per segment. Rejecting anything outside this shape closes the shell/Python
 *  string-injection risk at the source, before a `repo` value ever reaches a subprocess —
 *  even though every call site below has also been switched to argv-array
 *  spawn/execFile (no shell involved), so injection isn't actually possible either way.
 *  Deliberately permissive within that shape: does not reject valid HF ids with dots/dashes
 *  in either segment (e.g. "stabilityai/stable-diffusion-xl-base-1.0"). */
const SAFE_MODEL_IDENTIFIER = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)?$/;

export class InvalidModelIdentifierError extends Error {
  readonly code = 'MODEL_IDENTIFIER_INVALID';
  constructor(identifier: string) {
    super(`MODEL_IDENTIFIER_INVALID: "${identifier}" is not a valid model/repository identifier`);
    this.name = 'InvalidModelIdentifierError';
  }
}

/** Throws MODEL_IDENTIFIER_INVALID for anything containing shell metacharacters, whitespace,
 *  newlines, path-traversal segments (".."), or a URL scheme (http://, file://, ...) —
 *  reject those unconditionally rather than trying to individually blocklist every dangerous
 *  character. Legitimate Hugging Face org/repo identifiers are unaffected. */
export function assertSafeModelIdentifier(identifier: string): void {
  if (
    !identifier ||
    identifier.includes('..') ||
    identifier.includes('://') ||
    !SAFE_MODEL_IDENTIFIER.test(identifier)
  ) {
    throw new InvalidModelIdentifierError(identifier);
  }
}

export interface DownloadRequest {
  modelId: string;
  quantization?: string;
  targetDir?: string;
  provider?: string;
  approved?: boolean;
}

export interface DownloadProgress {
  modelId: string;
  status: 'pending' | 'downloading' | 'verifying' | 'complete' | 'failed' | 'cancelled';
  bytesDownloaded: number;
  totalBytes: number;
  message: string;
}

export interface DownloadAdapter {
  id: string;
  canDownload(model: ModelEntry): boolean;
  download(model: ModelEntry, onProgress?: (p: DownloadProgress) => void): Promise<void>;
}

/** Ollama pull adapter */
export class OllamaDownloadAdapter implements DownloadAdapter {
  id = 'ollama';

  constructor(_baseUrl = 'http://localhost:11434') {}

  canDownload(model: ModelEntry): boolean {
    return model.provider === 'ollama' || model.runtime === 'ollama';
  }

  async download(model: ModelEntry, onProgress?: (p: DownloadProgress) => void): Promise<void> {
    assertSafeModelIdentifier(model.id);

    const progress: DownloadProgress = {
      modelId: model.id,
      status: 'downloading',
      bytesDownloaded: 0,
      totalBytes: (model.downloadSizeMb ?? 0) * 1024 * 1024,
      message: `Pulling ${model.id} via Ollama...`,
    };
    onProgress?.(progress);

    await new Promise<void>((resolve, reject) => {
      // shell: true was unnecessary here — args are already passed as a discrete array, and
      // Windows resolves `ollama` on PATH via execvpe-style lookup without a shell either way.
      // Removed as defense-in-depth: with shell:true, Windows still re-parses the argv through
      // cmd.exe, which reintroduces metacharacter risk (&, |, etc.) that assertSafeModelIdentifier
      // already rules out for model.id, but is one less thing to rely on.
      const proc = spawn('ollama', ['pull', model.id], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      proc.stdout?.on('data', (chunk: Buffer) => {
        progress.message = chunk.toString().trim().slice(0, 200);
        onProgress?.(progress);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          progress.status = 'complete';
          progress.message = `Installed ${model.id}`;
          onProgress?.(progress);
          resolve();
        } else {
          progress.status = 'failed';
          progress.message = `ollama pull failed with code ${code}`;
          onProgress?.(progress);
          reject(new Error(progress.message));
        }
      });

      proc.on('error', (err) => {
        progress.status = 'failed';
        progress.message = err.message;
        onProgress?.(progress);
        reject(err);
      });
    });
  }
}

/** Hugging Face CLI adapter */
export class HuggingFaceDownloadAdapter implements DownloadAdapter {
  id = 'huggingface';

  constructor(private readonly modelsDir?: string) {}

  canDownload(model: ModelEntry): boolean {
    if (model.provider === 'diffusers' || model.runtime === 'diffusers') return false;
    return !!model.repository?.includes('huggingface.co') || model.provider === 'huggingface';
  }

  async download(model: ModelEntry, onProgress?: (p: DownloadProgress) => void): Promise<void> {
    if (!model.repository) throw new Error('Model has no repository URL');

    const repo = model.repository.replace('https://huggingface.co/', '');
    assertSafeModelIdentifier(repo);
    const targetDir = this.modelsDir
      ? join(this.modelsDir, model.id)
      : model.id;
    const progress: DownloadProgress = {
      modelId: model.id,
      status: 'downloading',
      bytesDownloaded: 0,
      totalBytes: (model.downloadSizeMb ?? 0) * 1024 * 1024,
      message: `Downloading ${repo} via huggingface-cli...`,
    };
    onProgress?.(progress);

    try {
      // execFile with an argv array — no shell, so repo/targetDir can never be interpreted as
      // shell syntax regardless of content (defense-in-depth on top of the identifier check above).
      execFileSync('huggingface-cli', ['download', repo, '--local-dir', targetDir], {
        stdio: 'pipe',
        timeout: 3600000,
        windowsHide: true,
      });
      progress.status = 'complete';
      progress.message = `Downloaded ${repo}`;
      onProgress?.(progress);
    } catch (err) {
      progress.status = 'failed';
      progress.message = err instanceof Error ? err.message : String(err);
      onProgress?.(progress);
      throw new Error(`HF download failed: ${progress.message}. Install: pip install huggingface_hub && huggingface-cli login`);
    }
  }
}

/** Diffusers / HuggingFace image model adapter */
export class DiffusersDownloadAdapter implements DownloadAdapter {
  id = 'diffusers';

  constructor(
    private readonly modelsDir: string,
    private readonly pythonPath = process.platform === 'win32' ? 'python' : 'python3',
  ) {}

  canDownload(model: ModelEntry): boolean {
    return model.provider === 'diffusers' || model.runtime === 'diffusers';
  }

  async download(model: ModelEntry, onProgress?: (p: DownloadProgress) => void): Promise<void> {
    const repo =
      model.repository?.replace('https://huggingface.co/', '') ??
      process.env.DIFFUSERS_MODEL_ID ??
      model.id;
    assertSafeModelIdentifier(repo);

    const targetDir = join(this.modelsDir, 'image', model.id);
    mkdirSync(targetDir, { recursive: true });

    const progress: DownloadProgress = {
      modelId: model.id,
      status: 'downloading',
      bytesDownloaded: 0,
      totalBytes: (model.downloadSizeMb ?? 0) * 1024 * 1024,
      message: `Downloading diffusers model ${repo}...`,
    };
    onProgress?.(progress);

    try {
      // execFile with an argv array — no shell, repo/targetDir passed as discrete arguments.
      execFileSync('huggingface-cli', ['download', repo, '--local-dir', targetDir], {
        stdio: 'pipe',
        timeout: 7200000,
        windowsHide: true,
      });
      progress.status = 'complete';
      progress.message = `Diffusers model ready at ${targetDir}`;
      onProgress?.(progress);
    } catch {
      progress.message = `Trying Python snapshot_download for ${repo}...`;
      onProgress?.(progress);
      try {
        // repo/targetDir are passed as real argv elements (sys.argv[1]/[2]), never interpolated
        // into the Python source string — a repo value containing a quote or other Python/shell
        // metacharacter can no longer break out of a string literal, because there is no
        // string literal built from user data to break out of.
        execFileSync(
          this.pythonPath,
          [
            '-c',
            'import sys\nfrom huggingface_hub import snapshot_download\nsnapshot_download(sys.argv[1], local_dir=sys.argv[2])',
            repo,
            targetDir,
          ],
          { stdio: 'pipe', timeout: 7200000, windowsHide: true },
        );
        progress.status = 'complete';
        progress.message = `Diffusers model ready at ${targetDir}`;
        onProgress?.(progress);
      } catch (err) {
        progress.status = 'failed';
        progress.message = err instanceof Error ? err.message : String(err);
        onProgress?.(progress);
        throw new Error(
          `Diffusers download failed. Install: pip install huggingface_hub && huggingface-cli login`,
        );
      }
    }
  }
}

/** User must approve downloads — never silently fetch multi-GB models */
export class ModelDownloadManager {
  private readonly modelsDir: string;
  private activeDownloads = new Map<string, DownloadProgress>();
  private adapters: DownloadAdapter[];

  constructor(baseDir?: string, adapters?: DownloadAdapter[]) {
    this.modelsDir = baseDir ?? join(process.cwd(), 'models');
    this.adapters = adapters ?? [
      new OllamaDownloadAdapter(),
      new SpeechModelDownloadAdapter(this.modelsDir),
      new DiffusersDownloadAdapter(this.modelsDir),
      new HuggingFaceDownloadAdapter(this.modelsDir),
    ];
  }

  getModelsDir(): string {
    return this.modelsDir;
  }

  getSubdir(modality: ModelEntry['modality']): string {
    const map: Record<string, string> = {
      text: 'llm',
      vision: 'vision',
      image: 'image',
      video: 'video',
      audio: 'audio',
      speech: 'speech',
      embedding: 'embedding',
      upscale: 'upscale',
      segmentation: 'segmentation',
      depth: 'depth',
      '3d': '3d',
      reranker: 'embedding',
      multimodal: 'llm',
    };
    return join(this.modelsDir, map[modality] ?? 'other');
  }

  planDownload(model: ModelEntry, quantization?: string): {
    modelId: string;
    estimatedSizeMb: number;
    targetPath: string;
    license: string;
    commercialUse: string;
    warnings: string[];
    adapter: string | null;
  } {
    const warnings: string[] = [];
    if (model.commercialUse === 'restricted') {
      warnings.push('License may restrict commercial use — review before downloading.');
    }
    if ((model.downloadSizeMb ?? 0) > 5000) {
      warnings.push(`Large download (~${model.downloadSizeMb} MB) — ensure sufficient disk space.`);
    }

    const subdir = this.getSubdir(model.modality);
    const speechTarget = speechModelTargetDirForPlan(model, subdir);
    const filename = quantization ? `${model.id}-${quantization}` : model.id;
    const adapter = this.adapters.find((a) => a.canDownload(model));

    return {
      modelId: model.id,
      estimatedSizeMb: model.downloadSizeMb ?? 0,
      targetPath: speechTarget ?? join(subdir, filename),
      license: model.license,
      commercialUse: model.commercialUse,
      warnings,
      adapter: adapter?.id ?? null,
    };
  }

  async download(
    model: ModelEntry,
    request: DownloadRequest,
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<void> {
    if (!request.approved) {
      throw new Error('Download requires explicit user approval (approved: true)');
    }

    const adapter = this.adapters.find((a) => a.canDownload(model));
    if (!adapter) {
      throw new Error(`No download adapter for model ${model.id} (provider: ${model.provider})`);
    }

    mkdirSync(this.getSubdir(model.modality), { recursive: true });
    await adapter.download(model, (p) => {
      this.activeDownloads.set(model.id, p);
      onProgress?.(p);
    });
    this.activeDownloads.delete(model.id);
  }

  cancel(modelId: string): void {
    const dl = this.activeDownloads.get(modelId);
    if (dl) {
      dl.status = 'cancelled';
      this.activeDownloads.delete(modelId);
    }
  }

  isInstalled(model: ModelEntry): boolean {
    if (model.installed) return true;
    if (model.installPath && existsSync(model.installPath)) return true;
    if (isSpeechModelInstalled(this.modelsDir, model.id)) return true;
    if (model.provider === 'diffusers' || model.runtime === 'diffusers') {
      return existsSync(join(this.modelsDir, 'image', model.id));
    }
    return false;
  }
}

function speechModelTargetDirForPlan(model: ModelEntry, speechSubdir: string): string | null {
  if (model.id === 'piper-en') return join(speechSubdir, 'piper-en');
  if (model.id === 'whisper-base') return join(speechSubdir, 'whisper-base');
  return null;
}
