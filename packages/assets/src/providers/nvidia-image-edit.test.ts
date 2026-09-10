import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NvidiaImageEditProvider } from './nvidia-image-edit.js';
import { NvidiaCapabilityAdapter, NvidiaStructuredError } from './nvidia-provider.js';
import { encodePng } from '../png.js';
import {
  hostedEditRequestBody,
  encodeNvidiaReferenceImage,
} from './nvidia-image-contract.js';

function colorfulPng(size = 96): Buffer {
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

describe('NVIDIA image edit contract', () => {
  it('serializes edit body with data URI reference', () => {
    const png = colorfulPng(32);
    const body = hostedEditRequestBody({
      instruction: 'change accent color',
      width: 1024,
      height: 1024,
      seed: 7,
      references: [png],
    });
    expect(body.prompt).toBe('change accent color');
    expect(String(body.image)).toMatch(/^data:image\/png;base64,/);
    expect(body.strength).toBeUndefined();
  });

  it('encodeNvidiaReferenceImage never leaks api keys', () => {
    const uri = encodeNvidiaReferenceImage(colorfulPng(16));
    expect(uri).not.toMatch(/nvapi-/i);
  });
});

describe('NVIDIA image edit validation', () => {
  it('rejects empty reference list before network', () => {
    const provider = new NvidiaImageEditProvider({ apiKey: 'nvapi-test-key', maxRetries: 0 });
    expect(() =>
      provider.validateRequest({
        sourceAssets: [],
        instruction: 'edit',
      }),
    ).toThrow(NvidiaStructuredError);
  });

  it('rejects empty instruction', () => {
    const provider = new NvidiaImageEditProvider({ apiKey: 'nvapi-test-key', maxRetries: 0 });
    expect(() =>
      provider.validateRequest({
        sourceAssets: [{ assetId: 'a', bytes: colorfulPng(32) }],
        instruction: '   ',
      }),
    ).toThrow(/instruction/i);
  });

  it('rejects unsupported model capability', () => {
    const provider = new NvidiaImageEditProvider({ apiKey: 'nvapi-test-key', maxRetries: 0 });
    expect(() =>
      provider.validateRequest(
        {
          sourceAssets: [{ assetId: 'a', bytes: colorfulPng(32) }],
          instruction: 'edit',
          modelOverride: 'black-forest-labs/flux.1-dev',
        },
        'black-forest-labs/flux.1-dev',
      ),
    ).toThrow(NvidiaStructuredError);
  });

  it('rejects too many references for kontext maxReferenceImages=1', () => {
    const provider = new NvidiaImageEditProvider({ apiKey: 'nvapi-test-key', maxRetries: 0 });
    try {
      provider.validateRequest({
        sourceAssets: [
          { assetId: 'a', bytes: colorfulPng(32) },
          { assetId: 'b', bytes: colorfulPng(32) },
        ],
        instruction: 'edit',
        modelOverride: 'black-forest-labs/flux.1-kontext-dev',
      });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toMatchObject({ code: 'NVIDIA_REFERENCE_LIMIT_EXCEEDED' });
    }
  });
});

describe('NVIDIA image edit HTTP', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps 401 to NVIDIA_AUTH_ERROR without leaking key', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    const provider = new NvidiaImageEditProvider({ apiKey: 'nvapi-secret-key', maxRetries: 0 });
    await expect(
      provider.editImage({
        sourceAssets: [{ assetId: 'src', bytes: colorfulPng(64) }],
        instruction: 'edit colors',
        modelOverride: 'black-forest-labs/flux.1-kontext-dev',
      }),
    ).rejects.toMatchObject({ code: 'NVIDIA_AUTH_ERROR' });
    expect(JSON.stringify(provider.getLastDiagnostic())).not.toContain('nvapi-secret-key');
  });

  it('maps example_id 422 to NVIDIA_UNSUPPORTED_CAPABILITY', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Expected: example_id, got: base64' }), { status: 422 }),
    );
    const provider = new NvidiaImageEditProvider({ apiKey: 'nvapi-test-key', maxRetries: 0 });
    await expect(
      provider.editImage({
        sourceAssets: [{ assetId: 'src', bytes: colorfulPng(64) }],
        instruction: 'edit colors',
        modelOverride: 'black-forest-labs/flux.1-kontext-dev',
      }),
    ).rejects.toMatchObject({ code: 'NVIDIA_UNSUPPORTED_CAPABILITY', httpStatus: 422 });
  });

  it('persists successful edit response as PNG result', async () => {
    const pngBytes = colorfulPng(96);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ artifacts: [{ base64: pngBytes.toString('base64'), finishReason: 'SUCCESS' }] }), {
        status: 200,
        headers: { 'nvcf-request-id': 'edit-req-1' },
      }),
    );
    const provider = new NvidiaImageEditProvider({ apiKey: 'nvapi-test-key', maxRetries: 0 });
    const result = await provider.editImage({
      sourceAssets: [{ assetId: 'src', bytes: pngBytes }],
      instruction: 'violet accents',
      seed: 424242,
      modelOverride: 'black-forest-labs/flux.1-kontext-dev',
      purpose: 'COLOR_VARIATION',
    });
    expect(result.provider).toBe('nvidia-image-edit');
    expect(result.model).toBe('black-forest-labs/flux.1-kontext-dev');
    expect(result.sourceAssetIds).toEqual(['src']);
    expect(result.images[0]?.buffer.length).toBeGreaterThan(0);
    expect(result.provenance.capability).toBe('IMAGE_EDIT');
    expect(result.provenance.source).toBe('image_edit');
    expect(result.requestId).toBe('edit-req-1');
  });
});

describe('NVIDIA capability routing', () => {
  it('routes IMAGE_EDIT through adapter while generation remains on image provider', async () => {
    const adapter = new NvidiaCapabilityAdapter({ apiKey: undefined, enabled: false });
    expect(adapter.image.id).toBe('nvidia-image');
    expect(adapter.imageEditProvider.id).toBe('nvidia-image-edit');
    await expect(
      adapter.imageEdit({
        sourceAssets: [{ assetId: 'x', bytes: colorfulPng(32) }],
        instruction: 'test',
      }),
    ).rejects.toMatchObject({ code: 'NVIDIA_CONFIGURATION_ERROR' });
  });
});
