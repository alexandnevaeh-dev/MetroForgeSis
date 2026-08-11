import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WORKER = join(__dirname, '..', '..', '..', 'workers', 'diffusers_audio_worker.py');

export interface StableAudioRequest {
  prompt: string;
  duration?: number;
  seed?: number;
  modelId?: string;
}

export interface StableAudioResult {
  buffer: Buffer;
  provider: string;
  sampleRate: number;
  fallbackGenerated: boolean;
}

interface WorkerResponse {
  ok: boolean;
  error?: string;
  audio_base64?: string;
  sample_rate?: number;
}

/** Optional Stable Audio Open worker — falls back to procedural WAV */
export class StableAudioProvider {
  id = 'stable-audio';

  constructor(
    private readonly pythonPath = process.platform === 'win32' ? 'python' : 'python3',
    private readonly workerPath = DEFAULT_WORKER,
    private readonly modelId = process.env.STABLE_AUDIO_MODEL_ID ?? 'stabilityai/stable-audio-open-1.0',
  ) {}

  async checkHealth(): Promise<boolean> {
    if (!existsSync(this.workerPath)) return false;
    try {
      const res = await this.runWorker({ action: 'health' });
      return res.ok === true;
    } catch {
      return false;
    }
  }

  async generate(request: StableAudioRequest): Promise<StableAudioResult> {
    const res = await this.runWorker({
      action: 'generate',
      model_id: request.modelId ?? this.modelId,
      prompt: request.prompt,
      duration: request.duration ?? 8,
      seed: request.seed ?? 42,
    });

    if (!res.ok || !res.audio_base64) {
      throw new Error(res.error ?? 'Stable Audio worker failed');
    }

    return {
      buffer: Buffer.from(res.audio_base64, 'base64'),
      provider: this.id,
      sampleRate: res.sample_rate ?? 44100,
      fallbackGenerated: false,
    };
  }

  private runWorker(payload: Record<string, unknown>, timeoutMs = 4000): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonPath, [this.workerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error('Stable Audio worker timed out'));
      }, timeoutMs);

      proc.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
      proc.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
      proc.on('error', (err) => { clearTimeout(timer); reject(err); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(stderr || `Stable Audio worker exited ${code}`));
          return;
        }
        try {
          resolve(JSON.parse(stdout) as WorkerResponse);
        } catch {
          reject(new Error(stderr || 'Invalid stable audio worker response'));
        }
      });
      proc.stdin.write(JSON.stringify(payload));
      proc.stdin.end();
    });
  }
}
