import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PiperTtsProvider } from './piper-tts.js';

describe('PiperTtsProvider', () => {
  it('synthesizes speech via piper CLI spawn', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'metroforge-piper-test-'));
    const wavBytes = Buffer.from('RIFFfakeWAV');

    const provider = new PiperTtsProvider({
      modelPath: '/models/en.onnx',
      spawn: (_command, args, _input) => {
        const outputIndex = args.indexOf('--output_file');
        const outputPath = outputIndex >= 0 ? args[outputIndex + 1]! : '';
        writeFileSync(outputPath, wavBytes);
        return {
          status: 0,
          stdout: '',
          stderr: '',
        };
      },
    });

    const response = await provider.synthesize({ text: 'Hello traveler.' });
    expect(response.provider).toBe('piper');
    expect(response.format).toBe('wav');
    expect(response.audio.equals(wavBytes)).toBe(true);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('checkHealth returns true when piper responds', async () => {
    const provider = new PiperTtsProvider({
      modelPath: '/models/en.onnx',
      spawn: () => ({
        status: 0,
        stdout: 'usage',
        stderr: '',
      }),
    });

    expect(await provider.checkHealth()).toBe(true);
  });

  it('rejects empty text', async () => {
    const provider = new PiperTtsProvider({
      modelPath: '/models/en.onnx',
      spawn: () => ({
        status: 0,
        stdout: '',
        stderr: '',
      }),
    });

    await expect(provider.synthesize({ text: '   ' })).rejects.toThrow(/non-empty text/);
  });
});
