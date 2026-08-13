import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  SpeechGenerationProvider,
  SpeechGenerationRequest,
  SpeechGenerationResponse,
} from '../provider-plugin.js';

export interface PiperSpawnResult {
  status: number | null;
  stdout: string | Buffer;
  stderr: string | Buffer;
}

export interface PiperTtsConfig {
  modelPath: string;
  binaryPath?: string;
  modelId?: string;
  /** Injectable for unit tests. */
  spawn?: (command: string, args: string[], input: string) => PiperSpawnResult;
}

const DEFAULT_BINARY = 'piper';

export class PiperTtsProvider implements SpeechGenerationProvider {
  readonly id = 'piper';
  private readonly binaryPath: string;
  private readonly modelId: string;
  private readonly spawnFn: (command: string, args: string[], input: string) => PiperSpawnResult;

  constructor(private readonly config: PiperTtsConfig) {
    this.binaryPath = config.binaryPath ?? DEFAULT_BINARY;
    this.modelId = config.modelId ?? 'piper-en';
    this.spawnFn =
      config.spawn ??
      ((command, args, input) => {
        const result = spawnSync(command, args, {
          input,
          encoding: 'utf-8',
          maxBuffer: 16 * 1024 * 1024,
        });
        return {
          status: result.status,
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? '',
        };
      });
  }

  async checkHealth(): Promise<boolean> {
    try {
      const result = this.spawnFn(this.binaryPath, ['--help'], '');
      return result.status === 0 || result.status === 1;
    } catch {
      return false;
    }
  }

  async synthesize(request: SpeechGenerationRequest): Promise<SpeechGenerationResponse> {
    const text = request.text.trim();
    if (!text) {
      throw new Error('Piper TTS requires non-empty text');
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'metroforge-piper-'));
    const outputPath = join(tempDir, 'speech.wav');

    try {
      const args = ['--model', this.config.modelPath, '--output_file', outputPath];
      if (request.speed != null && request.speed > 0) {
        args.push('--length_scale', String(1 / request.speed));
      }

      const result = this.spawnFn(this.binaryPath, args, text);
      if (result.status !== 0) {
        const detail =
          (typeof result.stderr === 'string' ? result.stderr : result.stderr.toString()) ||
          (typeof result.stdout === 'string' ? result.stdout : result.stdout.toString()) ||
          'unknown error';
        throw new Error(`Piper TTS failed (${result.status}): ${detail}`);
      }

      const audio = readFileSync(outputPath);
      return {
        audio,
        modelId: this.modelId,
        provider: this.id,
        format: 'wav',
      };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
