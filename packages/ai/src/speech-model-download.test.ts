import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModelEntrySchema } from '@metroforge/schemas';
import {
  SpeechModelDownloadAdapter,
  assertAllowedSpeechModelUrl,
  isSpeechModelInstalled,
} from './speech-model-download.js';

const piperModel = ModelEntrySchema.parse({
  id: 'piper-en',
  name: 'Piper TTS English',
  provider: 'piper',
  modality: 'speech',
  capabilities: ['SPEECH_GENERATION'],
  local: true,
  enabled: true,
  costClass: 'free',
  license: 'MIT',
  commercialUse: 'allowed',
  runtime: 'piper',
  downloadSizeMb: 63,
  priority: 70,
  tags: [],
});

const whisperModel = ModelEntrySchema.parse({
  id: 'whisper-base',
  name: 'Whisper Base',
  provider: 'whisper.cpp',
  modality: 'speech',
  capabilities: ['SPEECH_RECOGNITION'],
  local: true,
  enabled: true,
  costClass: 'free',
  license: 'MIT',
  commercialUse: 'allowed',
  runtime: 'whisper.cpp',
  downloadSizeMb: 148,
  priority: 65,
  tags: [],
});

describe('SpeechModelDownloadAdapter', () => {
  it('claims piper and whisper speech catalog entries', () => {
    const adapter = new SpeechModelDownloadAdapter('/tmp/models');
    expect(adapter.canDownload(piperModel)).toBe(true);
    expect(adapter.canDownload(whisperModel)).toBe(true);
  });

  it('rejects non-HTTPS download URLs', () => {
    expect(() => assertAllowedSpeechModelUrl('file:///etc/passwd')).toThrow(/Disallowed speech model URL/);
  });

  it('downloads curated files via fetch', async () => {
    const modelsDir = mkdtempSync(join(tmpdir(), 'metroforge-speech-dl-'));
    const fetchFn = vi.fn(async (url: string) => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`payload:${url}`));
          controller.close();
        },
      });
      return new Response(body, { status: 200, headers: { 'content-length': '12' } });
    });

    const adapter = new SpeechModelDownloadAdapter(modelsDir, fetchFn as typeof fetch);
    await adapter.download(piperModel);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(
      readFileSync(
        join(modelsDir, 'speech', 'piper-en', 'en_US-lessac-medium.onnx'),
        'utf-8',
      ),
    ).toContain('payload:');

    expect(isSpeechModelInstalled(modelsDir, 'piper-en')).toBe(true);
    rmSync(modelsDir, { recursive: true, force: true });
  });
});
