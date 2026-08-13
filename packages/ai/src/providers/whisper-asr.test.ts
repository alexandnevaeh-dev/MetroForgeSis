import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveWhisperModelPath, WhisperAsrProvider } from './whisper-asr.js';

describe('WhisperAsrProvider', () => {
  it('resolveWhisperModelPath finds ggml bin under models/speech/whisper-base', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metroforge-whisper-model-'));
    const modelDir = join(dir, 'speech', 'whisper-base');
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(join(modelDir, 'ggml-base.en.bin'), 'fake');

    expect(resolveWhisperModelPath(dir)).toBe(join(modelDir, 'ggml-base.en.bin'));
    rmSync(dir, { recursive: true, force: true });
  });

  it('transcribes wav via whisper-cli spawn and reads output txt', async () => {
    const provider = new WhisperAsrProvider({
      modelPath: '/models/ggml-base.en.bin',
      spawn: (_command, args) => {
        const outputIndex = args.indexOf('-of');
        const outputPrefix = outputIndex >= 0 ? args[outputIndex + 1]! : '';
        writeFileSync(`${outputPrefix}.txt`, 'connect room_a to room_b');
        return { status: 0, stdout: '', stderr: '' };
      },
    });

    const response = await provider.transcribe({
      audio: Buffer.from('RIFFfakeWAV'),
      format: 'wav',
    });

    expect(response.provider).toBe('whisper.cpp');
    expect(response.text).toBe('connect room_a to room_b');
  });

  it('checkHealth returns true when whisper responds', async () => {
    const provider = new WhisperAsrProvider({
      modelPath: '/models/ggml-base.en.bin',
      spawn: () => ({ status: 0, stdout: 'usage', stderr: '' }),
    });

    expect(await provider.checkHealth()).toBe(true);
  });

  it('rejects empty audio', async () => {
    const provider = new WhisperAsrProvider({
      modelPath: '/models/ggml-base.en.bin',
      spawn: () => ({ status: 0, stdout: '', stderr: '' }),
    });

    await expect(provider.transcribe({ audio: Buffer.alloc(0) })).rejects.toThrow(/non-empty audio/);
  });
});
