import { describe, expect, it } from 'vitest';
import {
  HuggingFaceSpaceExecutionBackend,
  buildHfInferPayload,
  serializeHfGalleryInput,
  promptSha256,
  wrapHfTransportError,
  HfTransportError,
  HfStageError,
} from './huggingface-space.js';
import type { RemoteVisualRequest } from './remote-worker.js';

const CONFIG_JSON = {
  version: '5.46.1',
  protocol: 'sse_v3',
  api_prefix: '/gradio_api',
  dependencies: [{ id: 0, api_name: 'infer', inputs: [6, 9], outputs: [7, 12] }],
  components: [
    { id: 6, type: 'gallery', props: { label: 'Input Images' } },
    { id: 9, type: 'textbox', props: { label: 'Prompt' } },
    { id: 7, type: 'gallery', props: { label: 'Result' } },
    { id: 12, type: 'slider', props: { label: 'Seed' } },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function sseResponse(events: Array<{ event: string; data: string }>): Response {
  const body = events.map((e) => `event: ${e.event}\ndata: ${e.data}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const CANONICAL_SOURCE = { assetId: 'player', sha256: 'ABC', bytes: Buffer.from('source') };

function baseRequest(overrides: Partial<RemoteVisualRequest> = {}): RemoteVisualRequest {
  return {
    requestId: 'r1',
    assetId: 'player',
    capability: 'REFERENCE_IMAGE',
    providerModel: 'qwen-image-edit',
    prompt: 'standing to running',
    seed: 42,
    width: 1024,
    height: 1024,
    sourceImages: [CANONICAL_SOURCE],
    ...overrides,
  };
}

describe('HuggingFaceSpaceExecutionBackend', () => {
  it('reports NOT_CONFIGURED with setup instructions when HF_SPACE_ID is missing', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({});
    const report = await backend.doctor();
    expect(report.readiness).toBe('NOT_CONFIGURED');
    expect(report.hfTokenConfigured).toBe(false);
    expect(report.apiDiscovery).toBe('NOT_ATTEMPTED');
    expect(report.setupInstructions?.some((line) => line.includes('HF_SPACE_ID'))).toBe(true);
  });

  it('reports hfTokenConfigured=true and authenticationAttached=true once a token is set, without ever exposing it', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({ spaceId: 'Qwen/Qwen-Image-Edit-2509', token: 'secret-token-value', fetchImpl: async () => jsonResponse(CONFIG_JSON) });
    const report = await backend.doctor();
    expect(report.hfTokenConfigured).toBe(true);
    expect(report.authenticationAttached).toBe(true);
    expect(report.zeroGpuDetected).toBe('DETECTED');
    expect(JSON.stringify(report)).not.toContain('secret-token-value');
  });

  it('discovers the named API endpoint dynamically instead of guessing it', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async () => jsonResponse(CONFIG_JSON),
    });
    const report = await backend.doctor();
    expect(report.readiness).toBe('REFERENCE_CAPABLE');
    expect(report.apiDiscovery).toBe('PASS');
    expect(report.spaceReachable).toBe(true);
    expect(report.referenceCapability).toBe(true);
    expect(report.apiSchema?.apiName).toBe('/infer');
    expect(report.apiSchema?.inputs).toHaveLength(2);
  });

  it('reports ENDPOINT_MISSING_API (HF_SPACE_API_CHANGED) when the requested named endpoint does not exist', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'someone/other-space',
      apiName: '/does-not-exist',
      fetchImpl: async () => jsonResponse(CONFIG_JSON),
    });
    const report = await backend.doctor();
    expect(report.readiness).toBe('ENDPOINT_MISSING_API');
    expect(report.apiDiscovery).toBe('FAIL');
  });

  it('propagates the Authorization header on discovery, upload, submission, polling, and result download', async () => {
    const authHeaders: Array<string | null> = [];
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      token: 'secret-token-value',
      fetchImpl: async (input, init) => {
        const url = String(input);
        authHeaders.push(new Headers(init?.headers).get('Authorization'));
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-auth' });
        if (url.endsWith('/call/infer/evt-auth')) return sseResponse([{ event: 'complete', data: JSON.stringify([[{ image: { url: 'https://example.test/out.png' } }], 42]) }]);
        if (url === 'https://example.test/out.png') return new Response(Buffer.from('output-png-bytes'), { status: 200 });
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await backend.generate(baseRequest());
    expect(authHeaders.every((h) => h === 'Bearer secret-token-value')).toBe(true);
    expect(authHeaders.length).toBeGreaterThanOrEqual(5);
  });

  it('uploads the reference file via the documented multipart route before invoking', async () => {
    const calls: string[] = [];
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-1' });
        if (url.endsWith('/call/infer/evt-1')) {
          return sseResponse([{ event: 'complete', data: JSON.stringify([[{ image: { url: 'https://example.test/out.png' } }], 42]) }]);
        }
        if (url === 'https://example.test/out.png') return new Response(Buffer.from('output-png-bytes'), { status: 200 });
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    const result = await backend.generate(baseRequest());
    expect(result.success).toBe(true);
    expect(result.provenance.referenceInputUsed).toBe(true);
    expect(result.provenance.sourceAssetId).toBe('player');
    expect(result.provenance.sourceHash).toBe('ABC');
    expect(result.provenance.executionType).toBe('HF_ZEROGPU');
    expect(calls.some((c) => c.includes('/upload?upload_id='))).toBe(true);
  });

  it('classifies an opaque error event as HF_SPACE_APPLICATION_ERROR (never a bad-model verdict, never silently HF_ZERO_GPU_QUOTA_EXHAUSTED without evidence)', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-2' });
        if (url.endsWith('/call/infer/evt-2')) return sseResponse([{ event: 'error', data: 'null' }]);
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_SPACE_APPLICATION_ERROR' });
  });

  it('classifies an explicit quota message as HF_ZERO_GPU_QUOTA_EXHAUSTED (EXECUTION_CAPACITY_FAILURE, not MODEL_FAILURE)', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-quota' });
        if (url.endsWith('/call/infer/evt-quota')) return sseResponse([{ event: 'error', data: JSON.stringify('You have exceeded your GPU quota') }]);
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_ZERO_GPU_QUOTA_EXHAUSTED' });
  });

  it('classifies an explicit queue-busy message as HF_ZERO_GPU_QUEUE_BUSY', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-queue' });
        if (url.endsWith('/call/infer/evt-queue')) return sseResponse([{ event: 'error', data: JSON.stringify('queue is full, try again later') }]);
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_ZERO_GPU_QUEUE_BUSY' });
  });

  it('classifies HTTP 429 during upload as HF_ZERO_GPU_RATE_LIMITED', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return new Response('rate limited', { status: 429 });
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_ZERO_GPU_RATE_LIMITED' });
  });

  it('classifies HTTP 401 during discovery as HF_AUTH_REQUIRED', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async () => new Response('unauthorized', { status: 401 }),
    });
    const report = await backend.doctor();
    expect(report.readiness).toBe('AUTH_REQUIRED');
  });

  it('classifies HTTP 5xx during discovery as HF_SPACE_UNAVAILABLE', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async () => new Response('server error', { status: 503 }),
    });
    const report = await backend.doctor();
    expect(report.reason).toContain('HTTP 503');
    expect(report.spaceReachable).toBe(false);
  });

  it('classifies a missing output image as HF_RESULT_INVALID', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-noimg' });
        if (url.endsWith('/call/infer/evt-noimg')) return sseResponse([{ event: 'complete', data: JSON.stringify([[], 42]) }]);
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_RESULT_INVALID' });
  });

  it('succeeds and produces a valid provenance-rich result when the Space returns a real image', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-ok' });
        if (url.endsWith('/call/infer/evt-ok')) return sseResponse([{ event: 'complete', data: JSON.stringify([[{ image: { url: 'https://example.test/ok.png' } }], 42]) }]);
        if (url === 'https://example.test/ok.png') return new Response(Buffer.from('valid-output-bytes'), { status: 200 });
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    const result = await backend.generate(baseRequest());
    expect(result.success).toBe(true);
    expect(result.outputSha256).toBeTruthy();
    expect(result.image?.length).toBeGreaterThan(0);
  });

  it('rejects with REFERENCE_IMAGE_REQUIRED when no source image is provided (never prompt-only reference editing)', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({ spaceId: 'Qwen/Qwen-Image-Edit-2509', fetchImpl: async () => jsonResponse(CONFIG_JSON) });
    await expect(
      backend.generate({ requestId: 'r1', assetId: 'player', capability: 'REFERENCE_IMAGE', providerModel: 'qwen-image-edit', prompt: 'run', seed: 1, width: 1024, height: 1024 }),
    ).rejects.toMatchObject({ code: 'REFERENCE_IMAGE_REQUIRED' });
  });

  it('serializes Gallery as [{ image: FileData, caption: null }] rather than a bare file or tuple', () => {
    const gallery = serializeHfGalleryInput({
      path: '/tmp/gradio/abc/player.png',
      url: 'https://qwen-qwen-image-edit-2509.hf.space/gradio_api/file=/tmp/gradio/abc/player.png',
      size: 12,
      orig_name: 'player.png',
      mime_type: 'image/png',
      is_stream: false,
      meta: { _type: 'gradio.FileData' },
    });
    expect(gallery).toEqual([
      {
        image: expect.objectContaining({ path: '/tmp/gradio/abc/player.png', meta: { _type: 'gradio.FileData' } }),
        caption: null,
      },
    ]);
  });

  it('explicitly sends rewrite_prompt=false, randomize_seed=false, and the deterministic seed', async () => {
    let submitted: Record<string, unknown> | undefined;
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) {
          submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return jsonResponse({ event_id: 'evt-payload' });
        }
        if (url.endsWith('/call/infer/evt-payload')) {
          return sseResponse([{ event: 'complete', data: JSON.stringify([[{ image: { url: 'https://example.test/out.png' } }], 424242]) }]);
        }
        if (url === 'https://example.test/out.png') return new Response(Buffer.from('output-png-bytes'), { status: 200 });
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await backend.generate(
      baseRequest({
        seed: 424242,
        prompt: 'standing to running',
        conditioning: { rewritePrompt: false, randomizeSeed: false, trueGuidanceScale: 4, numInferenceSteps: 40 },
      }),
    );
    const data = submitted?.data as unknown[];
    expect(submitted?.session_hash).toEqual(expect.any(String));
    expect(submitted?.fn_index).toBe(0);
    expect(Array.isArray(data?.[0])).toBe(true);
    expect((data?.[0] as Array<{ image?: { path?: string }; caption?: unknown }>)[0]).toMatchObject({
      image: { path: '/tmp/gradio/abc/player.png', meta: { _type: 'gradio.FileData' } },
      caption: null,
    });
    expect(data?.[1]).toBe('standing to running');
    expect(data?.[2]).toBe(424242);
    expect(data?.[3]).toBe(false);
    expect(data?.[4]).toBe(4);
    expect(data?.[5]).toBe(40);
    expect(data?.[6]).toBe(1024);
    expect(data?.[7]).toBe(1024);
    expect(data?.[8]).toBe(false);
  });

  it('maps a full 9-input discovered schema by label and snaps sliders into the live ranges', () => {
    const payload = buildHfInferPayload({
      schema: {
        apiName: '/infer',
        fnIndex: 0,
        apiPrefix: '/gradio_api',
        inputs: [
          { id: 6, type: 'gallery', label: 'Input Images' },
          { id: 9, type: 'textbox', label: 'Prompt' },
          { id: 12, type: 'slider', label: 'Seed', minimum: 0, maximum: 2147483647, step: 1 },
          { id: 13, type: 'checkbox', label: 'Randomize seed', defaultValue: true },
          { id: 15, type: 'slider', label: 'True guidance scale', minimum: 1, maximum: 10, step: 0.1, defaultValue: 4 },
          { id: 16, type: 'slider', label: 'Number of inference steps', minimum: 1, maximum: 50, step: 1, defaultValue: 40 },
          { id: 17, type: 'slider', label: 'Height', minimum: 256, maximum: 2048, step: 8, defaultValue: 256 },
          { id: 18, type: 'slider', label: 'Width', minimum: 256, maximum: 2048, step: 8, defaultValue: 256 },
          { id: 19, type: 'checkbox', label: 'Rewrite prompt', defaultValue: true },
        ],
        outputs: [],
      },
      sessionHash: 'sess1234abcd',
      gallery: serializeHfGalleryInput({
        path: '/tmp/x.png',
        url: 'https://example.test/file=/tmp/x.png',
        size: 1,
        orig_name: 'x.png',
        mime_type: 'image/png',
        is_stream: false,
        meta: { _type: 'gradio.FileData' },
      }),
      prompt: 'pose only',
      seed: 424242,
      randomizeSeed: false,
      trueGuidanceScale: 4,
      numInferenceSteps: 40,
      height: 1024,
      width: 1024,
      rewritePrompt: false,
    });
    expect(payload.session_hash).toBe('sess1234abcd');
    expect(payload.data[3]).toBe(false);
    expect(payload.data[8]).toBe(false);
    expect(payload.data[6]).toBe(1024);
    expect(payload.data[7]).toBe(1024);
  });

  it('classifies rewrite/DashScope failures as HF_PROMPT_REWRITE_ERROR and never as quota', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-rewrite' });
        if (url.endsWith('/call/infer/evt-rewrite')) return sseResponse([{ event: 'error', data: JSON.stringify('dashscope rewrite failed') }]);
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_PROMPT_REWRITE_ERROR' });
  });

  it('classifies gallery/schema errors as HF_GALLERY_PAYLOAD_INVALID', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-gallery' });
        if (url.endsWith('/call/infer/evt-gallery')) return sseResponse([{ event: 'error', data: JSON.stringify('invalid gallery input') }]);
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_GALLERY_PAYLOAD_INVALID' });
  });

  it('hashes prompts without embedding the raw prompt in the hash helper output length contract', () => {
    expect(promptSha256('standing to running')).toMatch(/^[A-F0-9]{64}$/);
    expect(promptSha256('standing to running')).not.toBe(promptSha256('different'));
  });

  function nodeFetchFailed(code: string, extras: { name?: string; message?: string; errno?: number; syscall?: string } = {}): TypeError {
    const cause = Object.assign(new Error(extras.message ?? code), {
      code,
      name: extras.name ?? 'Error',
      errno: extras.errno,
      syscall: extras.syscall ?? 'connect',
    });
    const error = new TypeError('fetch failed');
    (error as TypeError & { cause: unknown }).cause = cause;
    return error;
  }

  it('wraps ECONNRESET as HF_TRANSPORT_ERROR without leaking tokens', () => {
    const wrapped = wrapHfTransportError('HF_UPLOAD', nodeFetchFailed('ECONNRESET', { message: 'read ECONNRESET Bearer secret-token-value hf_notarealtoken' }));
    expect(wrapped).toBeInstanceOf(HfTransportError);
    expect(wrapped.code).toBe('HF_TRANSPORT_ERROR');
    expect(wrapped.stage).toBe('HF_UPLOAD');
    expect(wrapped.causeCode).toBe('ECONNRESET');
    expect(wrapped.message).not.toContain('secret-token-value');
    expect(wrapped.message).not.toContain('hf_notarealtoken');
    expect(JSON.stringify(wrapped.toDiagnostic())).not.toContain('secret-token-value');
  });

  it('wraps ETIMEDOUT, ENOTFOUND, UND_ERR_CONNECT_TIMEOUT, and TLS certificate causes', () => {
    expect(wrapHfTransportError('HF_DISCOVERY', nodeFetchFailed('ETIMEDOUT')).causeCode).toBe('ETIMEDOUT');
    expect(wrapHfTransportError('HF_DISCOVERY', nodeFetchFailed('ENOTFOUND', { syscall: 'getaddrinfo' })).causeCode).toBe('ENOTFOUND');
    expect(wrapHfTransportError('HF_SUBMIT', nodeFetchFailed('UND_ERR_CONNECT_TIMEOUT', { name: 'ConnectTimeoutError' })).causeCode).toBe('UND_ERR_CONNECT_TIMEOUT');
    expect(wrapHfTransportError('HF_RESULT_DOWNLOAD', nodeFetchFailed('UNABLE_TO_VERIFY_LEAF_SIGNATURE', { name: 'Error', message: 'unable to verify the first certificate' })).causeCode).toBe('UNABLE_TO_VERIFY_LEAF_SIGNATURE');
  });

  it('labels an upload-stage fetch failure as HF_UPLOAD', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) throw nodeFetchFailed('ECONNRESET');
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_TRANSPORT_ERROR', stage: 'HF_UPLOAD', causeCode: 'ECONNRESET' });
  });

  it('labels a submit-stage fetch failure as HF_SUBMIT', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) throw nodeFetchFailed('ETIMEDOUT');
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_TRANSPORT_ERROR', stage: 'HF_SUBMIT', causeCode: 'ETIMEDOUT' });
  });

  it('labels an SSE body-read failure as HF_QUEUE_POLL', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-poll' });
        if (url.endsWith('/call/infer/evt-poll')) {
          return new Response(
            new ReadableStream({
              pull(controller) {
                controller.error(nodeFetchFailed('ECONNRESET', { message: 'socket hang up' }));
              },
            }),
            { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_TRANSPORT_ERROR', stage: 'HF_QUEUE_POLL' });
  });

  it('labels an SSE connect fetch failure as HF_QUEUE_CONNECT', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-sse' });
        if (url.endsWith('/call/infer/evt-sse')) throw nodeFetchFailed('ENOTFOUND');
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_TRANSPORT_ERROR', stage: 'HF_QUEUE_CONNECT', causeCode: 'ENOTFOUND' });
  });

  it('labels a result-download fetch failure as HF_RESULT_DOWNLOAD', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-dl' });
        if (url.endsWith('/call/infer/evt-dl')) return sseResponse([{ event: 'complete', data: JSON.stringify([[{ image: { url: 'https://example.test/out.png' } }], 42]) }]);
        if (url === 'https://example.test/out.png') throw nodeFetchFailed('ECONNRESET');
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_TRANSPORT_ERROR', stage: 'HF_RESULT_DOWNLOAD', causeCode: 'ECONNRESET' });
  });

  it('preserves HF_SPACE_APPLICATION_ERROR as a semantic Space error, not HF_TRANSPORT_ERROR', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-app' });
        if (url.endsWith('/call/infer/evt-app')) return sseResponse([{ event: 'error', data: 'null' }]);
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({ code: 'HF_SPACE_APPLICATION_ERROR' });
  });

  it('preserves submit HTTP 404 with stage HF_SUBMIT and httpStatus=404', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return new Response('Not Found', { status: 404, statusText: 'Not Found' });
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({
      code: 'HF_SPACE_API_CHANGED',
      stage: 'HF_SUBMIT',
      httpStatus: 404,
    });
  });

  it('preserves queue-connect HTTP 404 with stage HF_QUEUE_CONNECT and httpStatus=404', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-404' });
        if (url.endsWith('/call/infer/evt-404')) return new Response('Not Found', { status: 404, statusText: 'Not Found' });
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({
      code: 'HF_MODEL_INFERENCE_ERROR',
      stage: 'HF_QUEUE_CONNECT',
      httpStatus: 404,
    });
  });

  it('preserves queue-poll application error with stage HF_QUEUE_POLL', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-queuepoll' });
        if (url.endsWith('/call/infer/evt-queuepoll')) return sseResponse([{ event: 'error', data: JSON.stringify('404: Not Found') }]);
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    let captured: unknown;
    try {
      await backend.generate(baseRequest());
    } catch (error) {
      captured = error;
    }
    expect(captured).toMatchObject({ code: 'HF_MODEL_INFERENCE_ERROR', stage: 'HF_QUEUE_POLL' });
    expect(captured).toBeInstanceOf(HfStageError);
  });

  it('preserves result-download HTTP 404 with stage HF_RESULT_DOWNLOAD and httpStatus=404', async () => {
    const backend = new HuggingFaceSpaceExecutionBackend({
      spaceId: 'Qwen/Qwen-Image-Edit-2509',
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith('/config')) return jsonResponse(CONFIG_JSON);
        if (url.includes('/upload')) return jsonResponse(['/tmp/gradio/abc/player.png']);
        if (url.endsWith('/call/infer')) return jsonResponse({ event_id: 'evt-result404' });
        if (url.endsWith('/call/infer/evt-result404')) return sseResponse([{ event: 'complete', data: JSON.stringify([[{ image: { url: 'https://example.test/out404.png' } }], 42]) }]);
        if (url === 'https://example.test/out404.png') return new Response('Not Found', { status: 404, statusText: 'Not Found' });
        throw new Error(`unexpected fetch: ${url}`);
      },
    });
    await expect(backend.generate(baseRequest())).rejects.toMatchObject({
      code: 'HF_RESULT_INVALID',
      stage: 'HF_RESULT_DOWNLOAD',
      httpStatus: 404,
    });
  });
});
