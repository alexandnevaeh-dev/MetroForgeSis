import { execSync, spawn } from 'node:child_process';
import type { ModelEntry } from '@metroforge/schemas';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
    const progress: DownloadProgress = {
      modelId: model.id,
      status: 'downloading',
      bytesDownloaded: 0,
      totalBytes: (model.downloadSizeMb ?? 0) * 1024 * 1024,
      message: `Pulling ${model.id} via Ollama...`,
    };
    onProgress?.(progress);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ollama', ['pull', model.id], {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
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
      execSync(`huggingface-cli download ${repo} --local-dir "${targetDir}"`, {
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
      execSync(`huggingface-cli download ${repo} --local-dir "${targetDir}"`, {
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
        execSync(
          `${this.pythonPath} -c "from huggingface_hub import snapshot_download; snapshot_download('${repo}', local_dir=r'${targetDir.replace(/\\/g, '/')}')"`,
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
    const filename = quantization ? `${model.id}-${quantization}` : model.id;
    const adapter = this.adapters.find((a) => a.canDownload(model));

    return {
      modelId: model.id,
      estimatedSizeMb: model.downloadSizeMb ?? 0,
      targetPath: join(subdir, filename),
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
    if (model.provider === 'diffusers' || model.runtime === 'diffusers') {
      return existsSync(join(this.modelsDir, 'image', model.id));
    }
    return false;
  }
}
