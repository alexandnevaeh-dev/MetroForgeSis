import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  SpeechRecognitionProvider,
  SpeechRecognitionRequest,
  SpeechRecognitionResponse,
} from '../provider-plugin.js';

export interface WhisperSpawnResult {
  status: number | null;
  stdout: string | Buffer;
  stderr: string | Buffer;
}

export interface WhisperAsrConfig {
  modelPath: string;
  binaryPath?: string;
  modelId?: string;
  /** Injectable for unit tests. */
  spawn?: (command: string, args: string[]) => WhisperSpawnResult;
}

const DEFAULT_BINARY = 'whisper-cli';

/** Locate a whisper.cpp GGML model under models/speech/ or WHISPER_MODEL_PATH. */
export function resolveWhisperModelPath(modelsDir = join(process.cwd(), 'models')): string | null {
  const envPath = process.env.WHISPER_MODEL_PATH;
  if (envPath && existsSync(envPath)) {
    return envPath;
  }

  const direct = join(modelsDir, 'speech', 'whisper-base', 'ggml-base.en.bin');
  if (existsSync(direct)) {
    return direct;
  }

  const speechDir = join(modelsDir, 'speech', 'whisper-base');
  if (existsSync(speechDir)) {
    const bin = readdirSync(speechDir).find((name) => name.endsWith('.bin'));
    if (bin) {
      return join(speechDir, bin);
    }
  }

  return null;
}

export class WhisperAsrProvider implements SpeechRecognitionProvider {
  readonly id = 'whisper.cpp';
  private readonly binaryPath: string;
  private readonly modelId: string;
  private readonly spawnFn: (command: string, args: string[]) => WhisperSpawnResult;

  constructor(private readonly config: WhisperAsrConfig) {
    this.binaryPath = config.binaryPath ?? process.env.WHISPER_BINARY ?? DEFAULT_BINARY;
    this.modelId = config.modelId ?? 'whisper-base';
    this.spawnFn =
      config.spawn ??
      ((command, args) => {
        const result = spawnSync(command, args, {
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
      const result = this.spawnFn(this.binaryPath, ['--help']);
      return result.status === 0 || result.status === 1;
    } catch {
      return false;
    }
  }

  async transcribe(request: SpeechRecognitionRequest): Promise<SpeechRecognitionResponse> {
    if (!request.audio.length) {
      throw new Error('Whisper ASR requires non-empty audio');
    }
    if (request.format && request.format !== 'wav') {
      throw new Error(`Whisper ASR only supports wav input (got ${request.format})`);
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'metroforge-whisper-'));
    const inputPath = join(tempDir, 'input.wav');
    const outputPrefix = join(tempDir, 'transcript');

    try {
      writeFileSync(inputPath, request.audio);

      const args = [
        '-m',
        this.config.modelPath,
        '-f',
        inputPath,
        '-otxt',
        '-of',
        outputPrefix,
        '-nt',
        '-np',
      ];
      if (request.language) {
        args.push('-l', request.language);
      }

      const result = this.spawnFn(this.binaryPath, args);
      if (result.status !== 0) {
        const detail =
          (typeof result.stderr === 'string' ? result.stderr : result.stderr.toString()) ||
          (typeof result.stdout === 'string' ? result.stdout : result.stdout.toString()) ||
          'unknown error';
        throw new Error(`Whisper ASR failed (${result.status}): ${detail}`);
      }

      const transcriptPath = `${outputPrefix}.txt`;
      let text = '';
      if (existsSync(transcriptPath)) {
        text = readFileSync(transcriptPath, 'utf-8').trim();
      } else {
        text =
          (typeof result.stdout === 'string' ? result.stdout : result.stdout.toString()).trim();
      }

      return {
        text,
        modelId: this.modelId,
        provider: this.id,
        language: request.language,
      };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
