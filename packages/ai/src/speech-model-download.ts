import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import type { ModelEntry } from '@metroforge/schemas';
import type { DownloadAdapter, DownloadProgress } from './model-download-manager.js';

export interface SpeechModelFile {
  filename: string;
  url: string;
}

export interface SpeechModelBundle {
  subdir: string;
  files: SpeechModelFile[];
}

/** Curated HF artifacts aligned with resolvePiperModelPath / resolveWhisperModelPath. */
export const SPEECH_MODEL_BUNDLES: Record<string, SpeechModelBundle> = {
  'piper-en': {
    subdir: 'piper-en',
    files: [
      {
        filename: 'en_US-lessac-medium.onnx',
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx',
      },
      {
        filename: 'en_US-lessac-medium.onnx.json',
        url: 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json',
      },
    ],
  },
  'whisper-base': {
    subdir: 'whisper-base',
    files: [
      {
        filename: 'ggml-base.en.bin',
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
      },
    ],
  },
};

const ALLOWED_URL_PREFIX = 'https://huggingface.co/';

export function assertAllowedSpeechModelUrl(url: string): void {
  if (!url.startsWith(ALLOWED_URL_PREFIX)) {
    throw new Error(`Disallowed speech model URL: ${url}`);
  }
}

export function speechModelTargetDir(modelsDir: string, modelId: string): string | null {
  const bundle = SPEECH_MODEL_BUNDLES[modelId];
  if (!bundle) return null;
  return join(modelsDir, 'speech', bundle.subdir);
}

export function isSpeechModelInstalled(modelsDir: string, modelId: string): boolean {
  const bundle = SPEECH_MODEL_BUNDLES[modelId];
  if (!bundle) return false;
  const dir = join(modelsDir, 'speech', bundle.subdir);
  return bundle.files.every((file) => existsSync(join(dir, file.filename)));
}

async function downloadUrlToFile(
  url: string,
  destPath: string,
  fetchFn: typeof fetch,
): Promise<number> {
  assertAllowedSpeechModelUrl(url);
  const response = await fetchFn(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }

  const nodeStream = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
  await pipeline(nodeStream, createWriteStream(destPath));

  const contentLength = Number(response.headers.get('content-length') ?? 0);
  return Number.isFinite(contentLength) ? contentLength : 0;
}

/** Downloads curated Piper / whisper.cpp model files via HTTPS (no shell). */
export class SpeechModelDownloadAdapter implements DownloadAdapter {
  id = 'speech-models';

  constructor(
    private readonly modelsDir: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  canDownload(model: ModelEntry): boolean {
    return (
      model.modality === 'speech' &&
      (model.provider === 'piper' || model.provider === 'whisper.cpp') &&
      model.id in SPEECH_MODEL_BUNDLES
    );
  }

  async download(model: ModelEntry, onProgress?: (p: DownloadProgress) => void): Promise<void> {
    const bundle = SPEECH_MODEL_BUNDLES[model.id];
    if (!bundle) {
      throw new Error(`No curated speech bundle for model ${model.id}`);
    }

    const targetDir = join(this.modelsDir, 'speech', bundle.subdir);
    mkdirSync(targetDir, { recursive: true });

    const progress: DownloadProgress = {
      modelId: model.id,
      status: 'downloading',
      bytesDownloaded: 0,
      totalBytes: (model.downloadSizeMb ?? 0) * 1024 * 1024,
      message: `Downloading ${model.id} speech model...`,
    };
    onProgress?.(progress);

    try {
      for (const [index, file] of bundle.files.entries()) {
        progress.message = `Downloading ${file.filename} (${index + 1}/${bundle.files.length})`;
        onProgress?.(progress);

        const bytes = await downloadUrlToFile(
          file.url,
          join(targetDir, file.filename),
          this.fetchFn,
        );
        progress.bytesDownloaded += bytes;
        onProgress?.(progress);
      }

      progress.status = 'complete';
      progress.message = `Speech model ready at ${targetDir}`;
      onProgress?.(progress);
    } catch (err) {
      progress.status = 'failed';
      progress.message = err instanceof Error ? err.message : String(err);
      onProgress?.(progress);
      throw err;
    }
  }
}
