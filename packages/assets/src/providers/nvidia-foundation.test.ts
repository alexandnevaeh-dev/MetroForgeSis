import { describe, expect, it } from 'vitest';
import {
  assertNoSecretLeak,
  buildNvidiaProvenance,
  catalogSummary,
  hashNvidiaPrompt,
  resolveNvidiaConfig,
  toNvidiaPersistedAssetRecord,
} from './nvidia-foundation.js';
import {
  nvidiaEnabledModels,
  nvidiaModelById,
  nvidiaSelectModelForImageTask,
} from '../foundry/nvidia-catalog.js';
import { nvidiaModelForImageTask, nvidiaSupportsReference } from '../image-task.js';
import { classifyNvidiaHttpFailure, hostedRequestBody, parseNvidiaErrorBody } from './nvidia-image-contract.js';
import { NvidiaImageProvider } from './nvidia-image.js';
import { NvidiaHttpClient } from './nvidia-http.js';
import {
  NvidiaCapabilityAdapter,
  classifyNvidiaErrorCode,
  nvidiaErrorFromHttpStatus,
} from './nvidia-provider.js';

describe('NVIDIA foundation config', () => {
  it('reports configured=false without leaking when key is absent', () => {
    const cfg = resolveNvidiaConfig({} as NodeJS.ProcessEnv);
    expect(cfg.configured).toBe(false);
    expect(cfg.apiKeyPresent).toBe(false);
    expect(cfg.provider).toBe('nvidia');
    expect(cfg.baseUrl).toContain('nvidia.com');
    expect(cfg.deployment).toBe('hosted');
  });

  it('reuses NVIDIA_API_KEY / base URL / image base / model from env', () => {
    const cfg = resolveNvidiaConfig({
      NVIDIA_API_KEY: 'nvapi-test-secret-key',
      NVIDIA_API_BASE_URL: 'https://example.nvidia.local/v1',
      NVIDIA_IMAGE_API_BASE_URL: 'https://example.nvidia.local/v1/genai',
      NVIDIA_IMAGE_MODEL: 'black-forest-labs/flux.1-dev',
      NVIDIA_DEPLOYMENT: 'nim',
    } as NodeJS.ProcessEnv);
    expect(cfg.configured).toBe(true);
    expect(cfg.deployment).toBe('nim');
    expect(cfg.endpointFamily).toBe('NVIDIA_SELF_HOSTED_NIM_INFER');
    expect(cfg.baseUrl).toBe('https://example.nvidia.local/v1');
    expect(cfg.imageApiBaseUrl).toBe('https://example.nvidia.local/v1/genai');
    expect(JSON.stringify(cfg)).not.toContain('nvapi-test-secret-key');
  });

  it('redaction helper catches accidental key echo', () => {
    expect(() => assertNoSecretLeak('Bearer nvapi-secret', 'nvapi-secret')).toThrow(/redaction/i);
    expect(() => assertNoSecretLeak('ok', 'nvapi-secret')).not.toThrow();
  });
});

describe('NVIDIA catalog routing', () => {
  it('routes image tasks from catalog metadata not hardcoded model names', () => {
    expect(nvidiaModelForImageTask('IMAGE_EDIT')).toBe('black-forest-labs/flux.1-kontext-dev');
    expect(nvidiaModelForImageTask('VFX_SOURCE')).toBe('black-forest-labs/flux.1-schnell');
    expect(nvidiaModelForImageTask('SPRITE_SOURCE')).toBe('black-forest-labs/flux.1-dev');
    expect(nvidiaSupportsReference('black-forest-labs/flux.1-kontext-dev')).toBe(true);
    expect(nvidiaSupportsReference('black-forest-labs/flux.1-dev')).toBe(false);
  });

  it('keeps unverified models out of enabled routing', () => {
    const enabled = nvidiaEnabledModels().map((m) => m.modelId);
    expect(enabled).not.toContain('black-forest-labs/flux.2-klein');
    expect(enabled).not.toContain('qwen/qwen-image-edit');
    expect(nvidiaModelById('black-forest-labs/flux.2-klein')?.status).toBe('known-but-disabled');
    const summary = catalogSummary();
    expect(summary.disabledUnverifiedModels.length).toBeGreaterThan(0);
    expect(summary.selectedReferenceModel).toBe('black-forest-labs/flux.1-dev');
  });

  it('selects edit-capable model for REFERENCE_VARIATION via metadata', () => {
    const row = nvidiaSelectModelForImageTask('REFERENCE_VARIATION');
    expect(row.supportsReferenceImages || row.supportsEditing).toBe(true);
  });
});

describe('NVIDIA error / request normalization', () => {
  it('normalizes hosted request body and classifies errors safely', () => {
    expect(hostedRequestBody({ prompt: 'hero', width: 64, height: 64, seed: 424242 })).toEqual({
      prompt: 'hero',
      seed: 424242,
      width: 1024,
      height: 1024,
    });
    expect(classifyNvidiaHttpFailure(401)).toBe('PROVIDER_AUTH_FAILED');
    expect(classifyNvidiaHttpFailure(429)).toBe('PROVIDER_RATE_LIMITED');
    expect(classifyNvidiaErrorCode(401)).toBe('NVIDIA_AUTH_ERROR');
    expect(classifyNvidiaErrorCode(429)).toBe('NVIDIA_RATE_LIMIT');
    expect(classifyNvidiaErrorCode(null, 'CONTENT_FILTERED')).toBe('NVIDIA_CONTENT_POLICY_ERROR');
    const err = nvidiaErrorFromHttpStatus(401, 'rejected');
    expect(err.code).toBe('NVIDIA_AUTH_ERROR');
    expect(JSON.stringify(err.toJSON())).not.toMatch(/nvapi-/i);
    const parsed = parseNvidiaErrorBody({ detail: [{ loc: ['body', 'prompt'], msg: 'bad', type: 'value_error' }] });
    expect(parsed.location).toBe('body.prompt');
    expect(JSON.stringify(parsed)).not.toMatch(/nvapi-/i);
  });

  it('builds provenance without secrets', () => {
    const provenance = buildNvidiaProvenance({
      model: 'black-forest-labs/flux.1-dev',
      deployment: 'hosted',
      capability: 'IMAGE_GENERATION',
      prompt: 'test prompt',
      seed: 424242,
      width: 1024,
      height: 1024,
      mimeType: 'image/png',
      fileSize: 9000,
      endpointFamily: 'NVIDIA_HOSTED_BUILD_API',
    });
    expect(provenance.promptHash).toBe(hashNvidiaPrompt('test prompt'));
    expect(provenance.provider).toBe('nvidia');
    expect(JSON.stringify(provenance)).not.toMatch(/nvapi-/i);
  });

  it('maps ImageGenResult into a persisted asset record', () => {
    const record = toNvidiaPersistedAssetRecord({
      assetId: 'nvidia-n1-test',
      request: {
        profile: 'CHARACTER',
        prompt: 'test',
        width: 64,
        height: 64,
        seed: 424242,
      },
      result: {
        image: Buffer.from('png'),
        provider: 'nvidia-image',
        modelId: 'black-forest-labs/flux.1-dev',
        seed: 424242,
        fallbackGenerated: false,
      },
      outputPath: '/tmp/out.png',
      config: resolveNvidiaConfig({ NVIDIA_API_KEY: 'x' } as NodeJS.ProcessEnv),
      nativeWidth: 1024,
      nativeHeight: 1024,
    });
    expect(record.provenance.source).toBe('nvidia');
    expect(record.capability).toBe('IMAGE_GENERATION');
    expect(record.fileSize).toBe(3);
  });
});

describe('NVIDIA doctor offline auth/config', () => {
  it('doctor reports NOT_CONFIGURED without network when key missing', async () => {
    const provider = new NvidiaImageProvider({ apiKey: undefined, enabled: false });
    const report = await provider.doctor();
    expect(report.configured).toBe(false);
    expect(report.readiness).toBe('NOT_CONFIGURED');
    expect(report.secretRedaction).toBe('SAFE');
    expect(JSON.stringify(report)).not.toMatch(/nvapi-/i);
  });
});

describe('NVIDIA http client + capability adapter', () => {
  it('http client describe never includes secrets', () => {
    const client = new NvidiaHttpClient({
      apiKey: 'nvapi-test-secret-key',
      baseUrl: 'https://example.nvidia.local/v1',
    });
    expect(client.configured).toBe(true);
    expect(JSON.stringify(client.describe())).not.toContain('nvapi-test-secret-key');
  });

  it('capability adapter routes IMAGE_EDIT and stubs other modalities', async () => {
    const adapter = new NvidiaCapabilityAdapter({ apiKey: undefined, enabled: false });
    await expect(
      adapter.imageEdit({
        sourceAssets: [{ assetId: 'x', bytes: Buffer.from('x') }],
        instruction: 'edit',
      }),
    ).rejects.toMatchObject({ code: 'NVIDIA_CONFIGURATION_ERROR' });
    await expect(adapter.videoGenerate({ prompt: 'x' })).rejects.toMatchObject({
      code: 'NVIDIA_UNSUPPORTED_CAPABILITY',
    });
    const report = await adapter.doctor();
    expect(report.provider).toBe('nvidia');
    expect(report.readiness).toBe('NOT_CONFIGURED');
  });
});
