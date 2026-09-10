import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePngRgba, encodePng, knockoutVfxBackground } from './png.js';

export interface AssetGenWorkerResponse {
  ok: boolean;
  error?: string;
  provider?: string;
  pillow?: boolean;
  comfyui?: boolean;
  saved_to?: string;
  slices?: string[];
  width?: number;
  height?: number;
  image_base64?: string;
  model_id?: string;
  seed?: number;
}

export interface ProcessLocalAssetInput {
  image: Buffer;
  knockout?: boolean;
  rows?: number;
  cols?: number;
  outputPath?: string;
  outputDir?: string;
  pythonPath?: string;
  workerPath?: string;
  signal?: AbortSignal;
}

export interface ProcessLocalAssetResult {
  image: Buffer;
  slices: Buffer[];
  via: 'python' | 'typescript';
  width: number;
  height: number;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ASSET_GEN_WORKER = join(
  __dirname,
  '..',
  '..',
  '..',
  'workers',
  'asset_gen.py',
);

export function resolveAssetGenWorker(override?: string): string {
  return override ?? process.env.ASSET_GEN_WORKER ?? DEFAULT_ASSET_GEN_WORKER;
}

export function runAssetGenWorker(
  payload: Record<string, unknown>,
  options: { timeoutMs?: number; signal?: AbortSignal; pythonPath?: string; workerPath?: string } = {},
): Promise<AssetGenWorkerResponse> {
  const workerPath = resolveAssetGenWorker(options.workerPath);
  const pythonPath = options.pythonPath ?? process.env.DIFFUSERS_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!existsSync(workerPath)) {
    return Promise.reject(new Error(`asset_gen worker not found: ${workerPath}`));
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, [workerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      fn();
    };
    const onAbort = () => {
      proc.kill();
      finish(() => reject(new Error('asset_gen worker cancelled')));
    };
    const timer = setTimeout(() => {
      proc.kill();
      finish(() => reject(new Error('asset_gen worker timed out')));
    }, timeoutMs);
    options.signal?.addEventListener('abort', onAbort, { once: true });
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => finish(() => reject(err)));
    proc.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        finish(() => reject(new Error(stderr || `asset_gen exited ${code}`)));
        return;
      }
      try {
        finish(() => resolve(JSON.parse(stdout) as AssetGenWorkerResponse));
      } catch {
        finish(() => reject(new Error(stderr || 'Invalid asset_gen worker response')));
      }
    });
    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

function sliceSheetTs(png: Buffer, rows: number, cols: number): Buffer[] {
  const { rgba, width, height } = decodePngRgba(png);
  const r = Math.max(1, rows);
  const c = Math.max(1, cols);
  const cellW = Math.floor(width / c);
  const cellH = Math.floor(height / r);
  const out: Buffer[] = [];
  for (let y = 0; y < r; y++) {
    for (let x = 0; x < c; x++) {
      const cell = new Uint8Array(cellW * cellH * 4);
      for (let py = 0; py < cellH; py++) {
        const srcRow = ((y * cellH + py) * width + x * cellW) * 4;
        cell.set(rgba.subarray(srcRow, srcRow + cellW * 4), py * cellW * 4);
      }
      out.push(encodePng(cellW, cellH, cell));
    }
  }
  return out;
}

function processInTypescript(input: ProcessLocalAssetInput): ProcessLocalAssetResult {
  let image = input.knockout === false ? input.image : knockoutVfxBackground(input.image);
  const decoded = decodePngRgba(image);
  const rows = input.rows ?? 0;
  const cols = input.cols ?? 0;
  const slices = rows > 0 && cols > 0 ? sliceSheetTs(image, rows, cols) : [];
  return {
    image,
    slices,
    via: 'typescript',
    width: decoded.width,
    height: decoded.height,
  };
}

/** Knock out studio backdrop and optionally slice a sheet. Prefers the Python worker. */
export async function processLocalAssetImage(input: ProcessLocalAssetInput): Promise<ProcessLocalAssetResult> {
  const workerPath = resolveAssetGenWorker(input.workerPath);
  if (existsSync(workerPath)) {
    try {
      const res = await runAssetGenWorker(
        {
          action: 'process',
          image_base64: input.image.toString('base64'),
          knockout: input.knockout !== false,
          rows: input.rows ?? 0,
          cols: input.cols ?? 0,
          output_path: input.outputPath,
          output_dir: input.outputDir,
        },
        { pythonPath: input.pythonPath, workerPath, signal: input.signal, timeoutMs: 20_000 },
      );
      if (res.ok && res.image_base64) {
        const image = Buffer.from(res.image_base64, 'base64');
        const decoded = decodePngRgba(image);
        const rows = input.rows ?? 0;
        const cols = input.cols ?? 0;
        return {
          image,
          slices: rows > 0 && cols > 0 ? sliceSheetTs(image, rows, cols) : [],
          via: 'python',
          width: decoded.width,
          height: decoded.height,
        };
      }
    } catch {
      // Fall through to the in-process path when Python/Pillow is missing.
    }
  }
  return processInTypescript(input);
}
