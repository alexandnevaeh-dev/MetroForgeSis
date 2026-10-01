import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import type { ImageGenRequest, ImageGenResult, ImageProviderHealthReport, ImageGenerator } from '../types/image-gen.js';
import { GenerationCancelledError, resolvePythonExecutable, throwIfCancelled } from '@metroforge/shared';

export interface LocalVisualFleetConfig {
  pythonPath?: string;
  workerPath?: string;
  modelPath?: string;
  modelId: string;
  runtime: string;
  capabilities: string[];
  enabled?: boolean;
}

interface WorkerResponse {
  ok: boolean;
  error?: string;
  image_base64?: string;
  model_id?: string;
  seed?: number;
  runtime?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
}

/** Shared process boundary for heavyweight local visual runtimes. Provider-specific
 * workers remain outside the Node/Electron process and must opt in through configuration. */
export class LocalVisualFleetProvider implements ImageGenerator {
  readonly id: string;
  private readonly config: Required<Pick<LocalVisualFleetConfig, 'modelId' | 'runtime'>> & LocalVisualFleetConfig;
  private readonly pythonPath: string;

  constructor(id: string, config: LocalVisualFleetConfig) {
    this.id = id;
    this.config = config;
    this.pythonPath = resolvePythonExecutable(config.pythonPath);
  }

  async checkHealth(): Promise<boolean> {
    const report = await this.getHealthReport();
    return report.status === 'HEALTHY' || report.status === 'DEGRADED';
  }

  async getHealthReport(): Promise<ImageProviderHealthReport> {
    if (this.config.enabled === false) {
      return { status: 'UNAVAILABLE', reason: `${this.id} is disabled` };
    }
    if (!this.config.workerPath || !existsSync(this.config.workerPath)) {
      return { status: 'UNAVAILABLE', reason: `${this.id} worker is not configured` };
    }
    if (!this.config.modelPath || !existsSync(this.config.modelPath)) {
      return { status: 'UNAVAILABLE', reason: `${this.id} model is not installed at the configured path` };
    }
    try {
      const response = await this.runWorker({ action: 'health', model_id: this.config.modelId, model_path: this.config.modelPath, runtime: this.config.runtime }, { timeoutMs: 10_000 });
      return response.ok
        ? { status: 'HEALTHY', reason: `${this.id} worker and model are ready`, safeDiagnostic: JSON.stringify(response.runtime ?? {}) }
        : { status: 'UNAVAILABLE', reason: response.error ?? `${this.id} worker health failed` };
    } catch (error) {
      return { status: 'UNAVAILABLE', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    throwIfCancelled(request.signal);
    const seed = request.seed ?? Math.floor(Math.random() * 2 ** 31);
    const response = await this.runWorker({
      action: 'generate',
      model_id: this.config.modelId,
      model_path: this.config.modelPath,
      runtime: this.config.runtime,
      profile: request.profile,
      prompt: request.prompt,
      negative_prompt: request.negativePrompt,
      width: request.width,
      height: request.height,
      seed,
      capabilities: this.config.capabilities,
      conditioning: request.conditioning
        ? { mode: request.conditioning.mode, image_base64: request.conditioning.image.toString('base64'), strength: request.conditioning.strength }
        : undefined,
    }, { timeoutMs: 300_000, signal: request.signal });
    if (!response.ok || !response.image_base64) throw new Error(response.error ?? `${this.id} worker failed`);
    return {
      image: Buffer.from(response.image_base64, 'base64'),
      provider: this.id,
      modelId: response.model_id ?? this.config.modelId,
      seed: response.seed ?? seed,
      fallbackGenerated: false,
    };
  }

  private runWorker(payload: Record<string, unknown>, options: { timeoutMs: number; signal?: AbortSignal }): Promise<WorkerResponse> {
    if (!this.config.workerPath) return Promise.reject(new Error(`${this.id} worker is not configured`));
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonPath, [this.config.workerPath!], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort); fn(); };
      const onAbort = () => { proc.kill(); finish(() => reject(new GenerationCancelledError())); };
      const timer = setTimeout(() => { proc.kill(); finish(() => reject(new Error(`${this.id} worker timed out`))); }, options.timeoutMs);
      options.signal?.addEventListener('abort', onAbort, { once: true });
      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on('error', (error) => finish(() => reject(error)));
      proc.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) { finish(() => reject(new Error(stderr || `${this.id} worker exited with code ${code}`))); return; }
        try { finish(() => resolve(JSON.parse(stdout) as WorkerResponse)); } catch { finish(() => reject(new Error(stderr || `Invalid ${this.id} worker response`))); }
      });
      proc.stdin.write(JSON.stringify(payload));
      proc.stdin.end();
    });
  }
}

export class QwenImageEditProvider extends LocalVisualFleetProvider {
  constructor(config: Omit<LocalVisualFleetConfig, 'modelId' | 'runtime' | 'capabilities'> = {}) {
    super('qwen-image-edit', { ...config, modelId: 'qwen-image-edit-2509', runtime: 'qwen-image-edit', capabilities: ['IMAGE_EDITING', 'REFERENCE_IMAGE', 'IMAGE_TO_IMAGE', 'IDENTITY_CONDITIONING', 'MULTI_IMAGE_REFERENCE', 'CONTROL_IMAGE', 'POSE_CONDITIONING'] });
  }
}

export class DreamOProvider extends LocalVisualFleetProvider {
  constructor(config: Omit<LocalVisualFleetConfig, 'modelId' | 'runtime' | 'capabilities'> = {}) {
    super('dreamo', { ...config, modelId: 'dreamo-v1.1', runtime: 'dreamo', capabilities: ['REFERENCE_IMAGE', 'IDENTITY_CONDITIONING', 'IMAGE_CUSTOMIZATION', 'STYLE_CONDITIONING'] });
  }
}

export class PulidProvider extends LocalVisualFleetProvider {
  constructor(config: Omit<LocalVisualFleetConfig, 'modelId' | 'runtime' | 'capabilities'> = {}) {
    super('pulid', { ...config, modelId: 'pulid-optional', runtime: 'pulid', capabilities: ['REFERENCE_IMAGE', 'IDENTITY_CONDITIONING'] });
  }
}
