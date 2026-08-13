import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ImageGenRequest, ImageGenResult, ImageGenerator } from '../types/image-gen.js';
import { GenerationCancelledError, throwIfCancelled } from '@metroforge/shared';
import { conditioningPayload } from '../image-conditioning.js';
export type { ImageGenRequest, ImageGenResult };

export interface DiffusersConfig {
  pythonPath?: string;
  workerPath?: string;
  modelId?: string;
  enabled?: boolean;
}

interface WorkerResponse {
  ok: boolean;
  error?: string;
  provider?: string;
  model_id?: string;
  seed?: number;
  image_base64?: string;
  cuda?: boolean;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKER = join(__dirname, '..', '..', '..', '..', 'workers', 'diffusers_image_worker.py');

/** Spawns local Python diffusers worker for SDXL generation */
export class DiffusersProvider implements ImageGenerator {
  id = 'diffusers';
  private enabled: boolean;
  private pythonPath: string;
  private workerPath: string;
  private modelId: string;

  constructor(config: DiffusersConfig = {}) {
    this.enabled = config.enabled ?? true;
    this.pythonPath = config.pythonPath ?? (process.platform === 'win32' ? 'python' : 'python3');
    this.workerPath = config.workerPath ?? DEFAULT_WORKER;
    this.modelId = config.modelId ?? process.env.DIFFUSERS_MODEL_ID ?? 'stabilityai/sdxl-turbo';
  }

  async checkHealth(): Promise<boolean> {
    if (!this.enabled || !existsSync(this.workerPath)) return false;
    try {
      const res = await this.runWorker({ action: 'health' });
      return res.ok === true;
    } catch {
      return false;
    }
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    throwIfCancelled(request.signal);
    const seed = request.seed ?? Math.floor(Math.random() * 2 ** 31);
    const res = await this.runWorker(
      {
        action: 'generate',
        model_id: this.modelId,
        profile: request.profile,
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        width: request.width,
        height: request.height,
        seed,
        ...(request.conditioning ? conditioningPayload(request.conditioning) : {}),
      },
      { timeoutMs: 120_000, signal: request.signal },
    );

    if (!res.ok || !res.image_base64) {
      throw new Error(res.error ?? 'Diffusers worker failed');
    }

    return {
      image: Buffer.from(res.image_base64, 'base64'),
      provider: this.id,
      modelId: res.model_id ?? this.modelId,
      seed: res.seed ?? seed,
      fallbackGenerated: false,
    };
  }

  private runWorker(
    payload: Record<string, unknown>,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<WorkerResponse> {
    const timeoutMs = options.timeoutMs ?? 4000;
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonPath, [this.workerPath], {
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
        finish(() => reject(new GenerationCancelledError()));
      };

      const timer = setTimeout(() => {
        proc.kill();
        finish(() => reject(new Error('Diffusers worker timed out')));
      }, timeoutMs);

      options.signal?.addEventListener('abort', onAbort, { once: true });

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err) => {
        finish(() => reject(err));
      });
      proc.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) {
          finish(() => reject(new Error(stderr || `Diffusers worker exited with code ${code}`)));
          return;
        }
        try {
          finish(() => resolve(JSON.parse(stdout) as WorkerResponse));
        } catch {
          finish(() => reject(new Error(stderr || 'Invalid diffusers worker response')));
        }
      });

      proc.stdin.write(JSON.stringify(payload));
      proc.stdin.end();
    });
  }
}