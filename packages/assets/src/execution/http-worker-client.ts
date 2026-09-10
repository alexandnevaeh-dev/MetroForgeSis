import type {
  ExecutionTarget,
  RemoteVisualRequest,
  RemoteVisualResult,
  RemoteVisualWorkerClient,
  RemoteWorkerTimeouts,
} from './remote-worker.js';
import { DEFAULT_REMOTE_WORKER_TIMEOUTS, ProviderGpuOomError, RemoteWorkerError, sha256Bytes } from './remote-worker.js';

interface RemoteArtifact {
  mimeType?: string;
  extension?: string;
  base64?: string;
  sha256?: string;
  width?: number;
  height?: number;
}

export class HttpRemoteVisualWorkerClient implements RemoteVisualWorkerClient {
  private readonly timeouts: RemoteWorkerTimeouts;

  constructor(
    public readonly target: ExecutionTarget,
    private readonly token?: string,
    private readonly fetchImpl: typeof fetch = fetch,
    timeouts: Partial<RemoteWorkerTimeouts> = {},
  ) {
    this.timeouts = { ...DEFAULT_REMOTE_WORKER_TIMEOUTS, ...timeouts };
  }

  async health(signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.getJson('/health', signal, this.timeouts.connectionMs);
  }

  async capabilities(signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.getJson('/capabilities', signal, this.timeouts.connectionMs);
  }

  async generate(request: RemoteVisualRequest, signal?: AbortSignal): Promise<RemoteVisualResult> {
    const started = Date.now();
    const response = await this.request('/reference', {
      method: 'POST',
      body: JSON.stringify({
        ...request,
        sourceImages: request.sourceImages?.map((source) => ({
          assetId: source.assetId,
          sourceVersion: source.sourceVersion,
          sha256: source.sha256,
          base64: source.bytes.toString('base64'),
        })),
        controlImages: request.controlImages?.map((source) => ({
          assetId: source.assetId,
          sourceVersion: source.sourceVersion,
          sha256: source.sha256,
          base64: source.bytes.toString('base64'),
        })),
      }),
    }, signal, this.timeouts.coldStartMs + this.timeouts.modelLoadMs + this.timeouts.generationMs);
    const payload = (await response.json()) as {
      requestId?: string;
      success?: boolean;
      provider?: string;
      model?: string;
      revision?: string;
      seed?: number;
      artifact?: RemoteArtifact;
      warnings?: string[];
      errors?: string[];
      executionTarget?: ExecutionTarget;
      provenance?: Record<string, unknown>;
      license?: Record<string, unknown>;
      oom?: { gpu?: string; vramMb?: number; model?: string; runtimeProfile?: string; precision?: string; width?: number; height?: number };
      modelState?: string;
    };
    if (payload.oom || payload.errors?.some((error) => error.includes('PROVIDER_GPU_OOM'))) {
      throw new ProviderGpuOomError(payload.oom ?? { model: payload.model });
    }
    if (!payload.success || !payload.artifact?.base64) {
      throw new RemoteWorkerError('REMOTE_GENERATION_FAILED', payload.errors?.join('; ') ?? 'Remote worker returned no artifact');
    }
    const image = Buffer.from(payload.artifact.base64, 'base64');
    if (image.length > 25 * 1024 * 1024) throw new RemoteWorkerError('REMOTE_ARTIFACT_TOO_LARGE', 'Remote image exceeds 25 MiB limit');
    if (payload.artifact.mimeType && payload.artifact.mimeType !== 'image/png') throw new RemoteWorkerError('REMOTE_ARTIFACT_MIME_INVALID', 'Remote artifact is not PNG');
    const outputSha256 = sha256Bytes(image);
    if (payload.artifact.sha256 && payload.artifact.sha256.toUpperCase() !== outputSha256) throw new RemoteWorkerError('REMOTE_ARTIFACT_HASH_MISMATCH', 'Remote artifact hash mismatch');
    return {
      requestId: payload.requestId ?? request.requestId,
      success: true,
      provider: payload.provider ?? this.target.provider,
      model: payload.model ?? request.providerModel,
      revision: payload.revision,
      executionTarget: payload.executionTarget ?? this.target,
      seed: payload.seed ?? request.seed,
      durationMs: Date.now() - started,
      image,
      outputSha256,
      warnings: payload.warnings ?? [],
      errors: payload.errors ?? [],
      license: payload.license,
      provenance: { ...(payload.provenance ?? {}), sourceAssetIds: request.sourceImages?.map((source) => source.assetId) ?? [], sourceHashes: request.sourceImages?.map((source) => source.sha256) ?? [], referenceInputUsed: Boolean(request.sourceImages?.length) },
    };
  }

  private async getJson(path: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<Record<string, unknown>> {
    const response = await this.request(path, { method: 'GET' }, signal, timeoutMs);
    return (await response.json()) as Record<string, unknown>;
  }

  private async request(path: string, init: RequestInit, signal: AbortSignal | undefined, timeoutMs: number): Promise<Response> {
    if (!this.target.endpoint) throw new RemoteWorkerError('REMOTE_ENDPOINT_MISSING', 'Remote worker endpoint is not configured');
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
    let response: Response;
    try {
      response = await this.fetchImpl(new URL(path, this.target.endpoint), { ...init, headers, signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(timeoutMs)]) });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') throw new RemoteWorkerError('REMOTE_TIMEOUT', `Remote worker request to ${path} timed out after ${timeoutMs}ms`);
      throw new RemoteWorkerError('REMOTE_CONNECTION_FAILED', error instanceof Error ? error.message : String(error));
    }
    if (response.status === 401 || response.status === 403) throw new RemoteWorkerError('REMOTE_AUTH_FAILED', 'Remote worker authentication failed');
    if (!response.ok) throw new RemoteWorkerError('REMOTE_HTTP_ERROR', `Remote worker returned HTTP ${response.status}`);
    return response;
  }
}
