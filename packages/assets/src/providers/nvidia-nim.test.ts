import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  classifyNimErrorFromMessage,
  evaluateNimEditPreflightGate,
  probeNvidiaNimHealth,
  remoteNimRequirements,
  resolveCapabilityDeployment,
  resolveNvidiaDeploymentConfig,
  resolveNimApiKey,
  normalizeNimBaseUrl,
  buildNimEndpoint,
} from './nvidia-nim.js';
import {
  buildNimImageEditMultipart,
  extractNimEditImageBytes,
} from './nvidia-image-contract.js';
import { NvidiaImageEditProvider } from './nvidia-image-edit.js';
import { NvidiaCapabilityAdapter } from './nvidia-provider.js';
import { NvidiaHttpClient } from './nvidia-http.js';
import { encodePng } from '../png.js';
import { createEditAssetVersion, registerInitialAssetVersion } from '../asset-versioning.js';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

function colorfulPng(size = 64): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      rgba[i] = 40 + (x % 200);
      rgba[i + 1] = 80 + (y % 150);
      rgba[i + 2] = 160;
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
}

describe('NIM URL normalization', () => {
  it('normalizes base without /v1 and with /v1 identically', () => {
    expect(normalizeNimBaseUrl('https://nim.example.com')).toBe('https://nim.example.com/v1');
    expect(normalizeNimBaseUrl('https://nim.example.com/v1')).toBe('https://nim.example.com/v1');
    expect(normalizeNimBaseUrl('https://nim.example.com/v1/')).toBe('https://nim.example.com/v1');
  });

  it('prevents duplicate /v1/v1 on edit endpoint', () => {
    expect(buildNimEndpoint('https://host.example', 'images/edits')).toBe(
      'https://host.example/v1/images/edits',
    );
    expect(buildNimEndpoint('https://host.example/v1', 'images/edits')).toBe(
      'https://host.example/v1/images/edits',
    );
    expect(buildNimEndpoint('https://host.example/v1/v1', 'v1/images/edits')).toBe(
      'https://host.example/v1/images/edits',
    );
  });

  it('builds health paths under normalized root', () => {
    expect(buildNimEndpoint('https://host.example', 'health/ready')).toBe(
      'https://host.example/v1/health/ready',
    );
  });
});

describe('NVIDIA NIM deployment selection', () => {
  it('keeps IMAGE_GENERATION hosted while IMAGE_EDIT prefers NIM when base URL is set', () => {
    const env = {
      NVIDIA_DEPLOYMENT: 'hosted',
      NVIDIA_NIM_BASE_URL: 'http://gpu.example:8000/v1',
    } as NodeJS.ProcessEnv;
    const cfg = resolveNvidiaDeploymentConfig(env);
    expect(cfg.nimBaseUrl).toBe('http://gpu.example:8000/v1');
    expect(resolveCapabilityDeployment('IMAGE_GENERATION', env).mode).toBe('hosted');
    expect(resolveCapabilityDeployment('IMAGE_EDIT', env)).toMatchObject({
      mode: 'nim',
      baseUrl: 'http://gpu.example:8000/v1',
      endpointFamily: 'NVIDIA_SELF_HOSTED_NIM_OPENAI_IMAGES',
    });
  });

  it('reports NIM not configured without inventing a localhost URL', async () => {
    const report = await probeNvidiaNimHealth({});
    expect(report.configured).toBe(false);
    expect(report.lifecycle).toBe('NOT_CONFIGURED');
    expect(report.readiness).toBe('NOT_CONFIGURED');
    expect(report.baseUrl).toBeNull();
    expect(JSON.stringify(report)).not.toMatch(/nvapi-|NGC_/i);
  });

  it('documents remote requirements from official support matrix', () => {
    const req = remoteNimRequirements();
    expect(req.minGpuVramGb).toBe(80);
    expect(req.preferredModel).toBe('qwen-image-edit-2511');
    expect(req.containerImage).toContain('nvcr.io/nim/qwen/qwen-image-edit');
    expect(req.apiEndpoint).toContain('/images/edits');
  });

  it('classifies OOM distinctly', () => {
    expect(classifyNimErrorFromMessage('CUDA out of memory')).toBe('NVIDIA_NIM_OUT_OF_MEMORY');
  });

  it('prefers NVIDIA_NIM_API_KEY without leaking values', () => {
    expect(
      resolveNimApiKey({
        NVIDIA_NIM_API_KEY: 'nim-secret',
        NVIDIA_API_KEY: 'hosted-secret',
      } as NodeJS.ProcessEnv),
    ).toBe('nim-secret');
  });

  it('blocks preflight when NIM is not configured', () => {
    const gate = evaluateNimEditPreflightGate({
      health: {
        configured: false,
        reachable: false,
        live: false,
        ready: false,
        modelLoaded: false,
        imageEdit: false,
        readiness: 'NOT_CONFIGURED',
        lifecycle: 'NOT_CONFIGURED',
        baseUrl: null,
        editEndpoint: null,
        latencyMs: null,
        reason: 'missing',
        secretRedaction: 'SAFE',
      },
      selectedModel: 'qwen/qwen-image-edit-2511',
      customReferencesSupported: true,
      sourceValid: true,
      offlineTestsPass: true,
    });
    expect(gate.gatePass).toBe(false);
    expect(gate.blockers).toContain('REMOTE_NIM_CONFIGURED=false');
  });
});

describe('NVIDIA NIM multipart + response parsing', () => {
  it('builds multipart fields without secrets', () => {
    const png = colorfulPng(32);
    const parts = buildNimImageEditMultipart({
      model: 'qwen-image-edit-2511',
      instruction: 'violet accents',
      references: [png],
      seed: 7,
    });
    expect(parts.fields.prompt).toBe('violet accents');
    expect(parts.fields.model).toBe('qwen-image-edit-2511');
    expect(parts.fields.seed).toBe('7');
    expect(parts.files).toHaveLength(1);
    expect(parts.files[0]?.fieldName).toBe('image');
    expect(JSON.stringify(parts.fields)).not.toMatch(/nvapi-|Authorization/i);
  });

  it('extracts OpenAI b64_json responses', () => {
    const png = colorfulPng(48);
    const decoded = extractNimEditImageBytes({
      data: [{ b64_json: png.toString('base64') }],
    });
    expect(decoded?.equals(png)).toBe(true);
  });
});

describe('NVIDIA NIM HTTP client multipart', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts FormData and never serializes Authorization into errors', async () => {
    const seen: { contentType?: string | null; hasAuth?: boolean } = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        seen.contentType = headers.get('content-type');
        seen.hasAuth = headers.has('Authorization');
        expect(init?.body).toBeInstanceOf(FormData);
        return new Response(JSON.stringify({ data: [{ b64_json: colorfulPng(64).toString('base64') }] }), {
          status: 200,
        });
      }),
    );
    const client = new NvidiaHttpClient({
      apiKey: 'nvapi-secret-key',
      baseUrl: 'http://nim.test/v1',
    });
    const png = colorfulPng(32);
    const res = await client.requestJson({
      path: '/images/edits',
      multipart: {
        fields: { prompt: 'edit', model: 'qwen-image-edit-2511' },
        files: [{ fieldName: 'image', filename: 'a.png', bytes: png, mimeType: 'image/png' }],
      },
    });
    expect(res.ok).toBe(true);
    expect(seen.hasAuth).toBe(true);
    expect(seen.contentType).toBeNull();
    expect(JSON.stringify(client.describe())).not.toContain('nvapi-secret-key');
  });
});

describe('NVIDIA IMAGE_EDIT NIM routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NVIDIA_NIM_BASE_URL;
  });

  it('fails with NVIDIA_NIM_NOT_CONFIGURED when edit prefers NIM but URL missing', () => {
    process.env.NVIDIA_DEPLOYMENT = 'nim';
    const provider = new NvidiaImageEditProvider({ apiKey: 'nvapi-test', maxRetries: 0 });
    expect(() =>
      provider.validateRequest({
        sourceAssets: [{ assetId: 'a', bytes: colorfulPng(32) }],
        instruction: 'edit',
        modelOverride: 'qwen/qwen-image-edit-2511',
      }),
    ).toThrow(/NVIDIA_NIM_BASE_URL|NIM_NOT_CONFIGURED/i);
    delete process.env.NVIDIA_DEPLOYMENT;
  });

  it('routes successful NIM multipart edit to normalized /v1/images/edits', async () => {
    process.env.NVIDIA_NIM_BASE_URL = 'http://nim.test/v1';
    const png = colorfulPng(96);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(String(url)).toBe('http://nim.test/v1/images/edits');
        return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
          status: 200,
        });
      }),
    );
    const provider = new NvidiaImageEditProvider({
      apiKey: 'nvapi-test',
      nimBaseUrl: 'http://nim.test',
      maxRetries: 0,
    });
    const result = await provider.editImage({
      sourceAssets: [{ assetId: 'src', bytes: png }],
      instruction: 'violet glow',
      seed: 424242,
      modelOverride: 'qwen/qwen-image-edit-2511',
    });
    expect(result.provenance.deployment).toBe('nim');
    expect(result.provenance.capability).toBe('IMAGE_EDIT');
    expect(result.images[0]?.buffer.length).toBeGreaterThan(0);
  });

  it('maps connection refused to NVIDIA_NIM_UNREACHABLE', async () => {
    process.env.NVIDIA_NIM_BASE_URL = 'http://127.0.0.1:9/v1';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const provider = new NvidiaImageEditProvider({
      apiKey: 'nvapi-test',
      nimBaseUrl: 'http://127.0.0.1:9/v1',
      maxRetries: 0,
    });
    await expect(
      provider.editImage({
        sourceAssets: [{ assetId: 'src', bytes: colorfulPng(64) }],
        instruction: 'edit',
        modelOverride: 'qwen/qwen-image-edit-2511',
      }),
    ).rejects.toMatchObject({ code: 'NVIDIA_NIM_UNREACHABLE' });
  });

  it.each([
    [401, 'NVIDIA_AUTH_ERROR'],
    [403, 'NVIDIA_AUTH_ERROR'],
    [404, 'NVIDIA_MODEL_NOT_FOUND'],
    [422, 'NVIDIA_NIM_INVALID_RESPONSE'],
    [429, 'NVIDIA_RATE_LIMIT'],
    [500, 'NVIDIA_NIM_INFERENCE_ERROR'],
  ] as const)('maps NIM HTTP %i to %s', async (status, code) => {
    process.env.NVIDIA_NIM_BASE_URL = 'http://nim.test/v1';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(`err-${status}`, { status })),
    );
    const provider = new NvidiaImageEditProvider({
      apiKey: 'nvapi-test',
      nimBaseUrl: 'http://nim.test/v1',
      maxRetries: 0,
    });
    await expect(
      provider.editImage({
        sourceAssets: [{ assetId: 'src', bytes: colorfulPng(64) }],
        instruction: 'edit',
        modelOverride: 'qwen/qwen-image-edit-2511',
      }),
    ).rejects.toMatchObject({ code, httpStatus: status });
  });

  it('maps malformed NIM JSON success to NVIDIA_NIM_INVALID_RESPONSE', async () => {
    process.env.NVIDIA_NIM_BASE_URL = 'http://nim.test/v1';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [{}] }), { status: 200 })),
    );
    const provider = new NvidiaImageEditProvider({
      apiKey: 'nvapi-test',
      nimBaseUrl: 'http://nim.test/v1',
      maxRetries: 0,
    });
    await expect(
      provider.editImage({
        sourceAssets: [{ assetId: 'src', bytes: colorfulPng(64) }],
        instruction: 'edit',
        modelOverride: 'qwen/qwen-image-edit-2511',
      }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/INVALID|PAYLOAD/i) });
  });

  it('does not create v2 when NIM inference fails', async () => {
    process.env.NVIDIA_NIM_BASE_URL = 'http://nim.test/v1';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const root = mkdtempSync(join(tmpdir(), 'mf-nim-fail-'));
    mkdirSync(join(root, 'assets'), { recursive: true });
    const sourcePath = join(root, 'assets', 'v1.png');
    writeFileSync(sourcePath, colorfulPng(32));
    registerInitialAssetVersion({ storageRoot: root, assetId: 'n1', path: 'assets/v1.png' });
    const provider = new NvidiaImageEditProvider({
      apiKey: 'nvapi-test',
      nimBaseUrl: 'http://nim.test/v1',
      maxRetries: 0,
    });
    await expect(
      provider.editImage({
        sourceAssets: [{ assetId: 'n1', bytes: readFileSync(sourcePath) }],
        instruction: 'edit',
        modelOverride: 'qwen/qwen-image-edit-2511',
      }),
    ).rejects.toMatchObject({ httpStatus: 500 });
    expect(existsSync(join(root, 'assets', 'v2.png'))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('persists v2 only after successful NIM bytes and preserves source checksum', () => {
    const root = mkdtempSync(join(tmpdir(), 'mf-nim-ver-'));
    mkdirSync(join(root, 'assets'), { recursive: true });
    const sourcePath = join(root, 'assets', 'v1.png');
    const sourceBytes = Buffer.from('immutable-source');
    writeFileSync(sourcePath, sourceBytes);
    const before = createHash('sha256').update(sourceBytes).digest('hex');
    registerInitialAssetVersion({ storageRoot: root, assetId: 'n1', path: 'assets/v1.png' });
    const edited = createEditAssetVersion({
      storageRoot: root,
      sourceAssetId: 'n1',
      sourcePath,
      outputBuffer: Buffer.from('edited'),
      provider: 'nvidia-image-edit',
      model: 'qwen/qwen-image-edit-2511',
      instruction: 'edit',
    });
    const after = createHash('sha256').update(readFileSync(sourcePath)).digest('hex');
    expect(before).toBe(after);
    expect(edited.version.versionNumber).toBe(2);
    expect(existsSync(edited.outputPath)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('adapter still exposes hosted generation provider separately from NIM edit', () => {
    const adapter = new NvidiaCapabilityAdapter({ apiKey: undefined, enabled: false });
    expect(adapter.image.id).toBe('nvidia-image');
    expect(adapter.imageEditProvider.id).toBe('nvidia-image-edit');
    expect(adapter.capabilityDeployment('IMAGE_GENERATION').mode).toBe('hosted');
  });
});
