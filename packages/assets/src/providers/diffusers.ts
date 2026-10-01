import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { ImageGenRequest, ImageGenResult, ImageGenerator } from '../types/image-gen.js';
import { GenerationCancelledError, throwIfCancelled, getResourceRoot, getRepoRoot, resolvePythonExecutable } from '@metroforge/shared';
import { conditioningPayload } from '../image-conditioning.js';
export type { ImageGenRequest, ImageGenResult };

export interface DiffusersConfig {
  pythonPath?: string;
  workerPath?: string;
  modelId?: string;
  baseModelPath?: string;
  ipAdapterRepo?: string;
  ipAdapterWeight?: string;
  enabled?: boolean;
  device?: 'auto' | 'cuda' | 'openvino_gpu' | 'cpu' | 'mps';
  cpuTimeoutMs?: number;
  gpuTimeoutMs?: number;
  /** Includes cold Python/tokenizer startup; independent of image generation. */
  promptCheckTimeoutMs?: number;
  warmupTimeoutMs?: number;
  generationTimeoutMs?: number;
}

interface WorkerResponse {
  ok: boolean;
  error?: string;
  provider?: string;
  model_id?: string;
  seed?: number;
  device?: string;
  offload_strategy?: string;
  image_base64?: string;
  cuda?: boolean;
  runtime?: Record<string, unknown>;
  models?: Record<string, unknown>;
  readiness?: string;
  dtype?: string;
  compute_backends?: Record<string, { available?: boolean; device?: string; dtype?: string }>;
  selected_backend?: string;
  recommended_backend?: string;
  fallback_reason?: string;
  openvino_model_prepared?: boolean;
  execution_path?: string;
  timings?: Record<string, unknown>;
  workerReused?: boolean;
  modelCacheHit?: boolean;
  compiledComponentCacheHit?: boolean;
  tokenizerCacheHit?: boolean;
  schedulerCacheHit?: boolean;
  memory?: Record<string, unknown>;
  // check_prompt / generate prompt-budget echo (see PromptBudgetResult below for the shape).
  modelPath?: string;
  tokenizerClass?: string;
  positive?: PromptSideBudget;
  negative?: PromptSideBudget;
  anyOverflow?: boolean;
  promptBudget?: { positive: PromptSideBudget; negative: PromptSideBudget; anyOverflow: boolean; tokenizerClass?: string };
  effectiveConditioningMode?: string | null;
  effectiveConditioningStrength?: number | null;
  effectivePrompt?: string;
  effectiveNegativePrompt?: string;
  effectiveSteps?: number;
  effectiveGuidance?: number;
  effectiveWidth?: number;
  effectiveHeight?: number;
  // segment_foreground echo (see SegmentForegroundResult below for the shape).
  model?: string;
  modelVersion?: string;
  occupancy?: number;

  inferenceSeconds?: number;
}

/** One side (positive or negative) of a prompt-budget check result. */
export interface PromptSideBudget {
  text: string;
  tokenCount: number;
  maxTokens: number;
  overflow: boolean;
  overflowBy: number;
}

/** Result of checking a prompt/negative-prompt pair against the REAL tokenizer for a specific
 *  model — never an approximation. Positive and negative conditioning are reported separately
 *  because they are encoded, and budgeted, independently by CLIP-family text encoders. */
export interface PromptBudgetResult {
  ok: boolean;
  error?: string;
  modelPath?: string;
  tokenizerClass?: string;
  positive?: PromptSideBudget;
  negative?: PromptSideBudget;
  anyOverflow?: boolean;
}

/** Result of a `segmentForeground()` call — a real ML-computed alpha matte, not a heuristic. */
export interface SegmentForegroundResult {
  ok: boolean;
  error?: string;
  buffer?: Buffer;
  model?: string;
  modelVersion?: string;
  /** Fraction of output pixels with alpha > 16 — a coarse signal for whether the model found a
   *  clear single-subject region at all (very low occupancy suggests the source image lacks a
   *  segmentable foreground object, e.g. a diffuse scene rather than a single recognizable thing). */
  occupancy?: number;
  device?: string;
  inferenceSeconds?: number;
}

const DEFAULT_VENV_PYTHON = join(
  getRepoRoot(),
  '.venv-diffusers',
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python',
);

function terminateWorker(proc: ReturnType<typeof spawn>): void {
  if (proc.killed) return;
  if (process.platform === 'win32' && proc.pid) {
    try { execFileSync('taskkill.exe', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); return; }
    catch { /* Fall through to Node's platform kill. */ }
  }
  proc.kill('SIGKILL');
}

/** Parse only a complete worker protocol response. Native runtime stdout chatter is ignored. */
export function parseOpenVinoWorkerLine(line: string): WorkerResponse | undefined {
  try {
    const response = JSON.parse(line) as WorkerResponse;
    return response && typeof response === 'object' && typeof response.ok === 'boolean' ? response : undefined;
  } catch {
    return undefined;
  }
}

/** Spawns local Python diffusers worker for SDXL generation */
export class DiffusersProvider implements ImageGenerator {
  id = 'diffusers';
  private enabled: boolean;
  private pythonPath: string;
  private workerPath: string;
  private modelId: string;
  private baseModelPath?: string;
  private ipAdapterRepo?: string;
  private ipAdapterWeight?: string;
  private device: 'auto' | 'cuda' | 'openvino_gpu' | 'cpu' | 'mps';
  private cpuTimeoutMs: number;
  private gpuTimeoutMs: number;
  private promptCheckTimeoutMs: number;
  private warmupTimeoutMs: number;
  private generationTimeoutMs: number;
  private openvinoServer?: ReturnType<typeof spawn>;
  private openvinoStartedAt?: number;
  private openvinoQueue: Promise<unknown> = Promise.resolve();
  private openvinoPending?: { resolve: (response: WorkerResponse) => void; reject: (error: Error) => void };

  constructor(config: DiffusersConfig = {}) {
    this.enabled = config.enabled ?? true;
    this.pythonPath = resolvePythonExecutable(config.pythonPath);
    if (
      (this.pythonPath === 'python' || this.pythonPath === 'python3') &&
      existsSync(DEFAULT_VENV_PYTHON)
    ) {
      this.pythonPath = DEFAULT_VENV_PYTHON;
    }
    this.workerPath = config.workerPath ?? join(getResourceRoot(), 'workers', 'diffusers_image_worker.py');
    this.modelId = config.modelId ?? process.env.DIFFUSERS_MODEL_ID ?? 'stabilityai/sdxl-turbo';
    this.baseModelPath = config.baseModelPath ?? process.env.DIFFUSERS_BASE_MODEL_PATH;
    this.ipAdapterRepo = config.ipAdapterRepo ?? process.env.DIFFUSERS_IP_ADAPTER_REPO;
    this.ipAdapterWeight = config.ipAdapterWeight ?? process.env.DIFFUSERS_IP_ADAPTER_WEIGHT;
    this.device = config.device ?? ((process.env.METROFORGE_DIFFUSION_DEVICE as 'auto' | 'cuda' | 'openvino_gpu' | 'cpu' | 'mps') ?? 'auto');
    this.cpuTimeoutMs = config.cpuTimeoutMs ?? Number(process.env.METROFORGE_CPU_DIFFUSION_TIMEOUT_MS ?? 180000);
    this.gpuTimeoutMs = config.gpuTimeoutMs ?? Number(process.env.METROFORGE_GPU_DIFFUSION_TIMEOUT_MS ?? 420000);
    this.warmupTimeoutMs = config.warmupTimeoutMs ?? Number(process.env.METROFORGE_OPENVINO_WARMUP_TIMEOUT_MS ?? 600000);
    this.generationTimeoutMs = config.generationTimeoutMs ?? this.gpuTimeoutMs;
    this.promptCheckTimeoutMs = config.promptCheckTimeoutMs ?? 120_000;
    if (!Number.isFinite(this.promptCheckTimeoutMs) || this.promptCheckTimeoutMs <= 0) {
      throw new RangeError('promptCheckTimeoutMs must be a positive finite number');
    }
  }

  async checkHealth(): Promise<boolean> {
    if (!this.enabled || !existsSync(this.workerPath)) return false;
    try {
      const res = await this.runWorker({ action: 'health', quick: true }, { timeoutMs: 4_000 });
      const computeBackends = (res as { compute_backends?: Record<string, { available?: boolean }> }).compute_backends ?? {};
      const anyAvailable = Object.values(computeBackends).some((backend) => backend?.available === true) || res.ok === true;
      return res.ok === true && anyAvailable && res.readiness !== 'RUNTIME_NOT_INSTALLED';
    } catch {
      return false;
    }
  }

  async getHealthReport() {
    if (!this.enabled || !existsSync(this.workerPath)) {
      return { status: 'UNAVAILABLE' as const, reason: 'Diffusers worker is missing or disabled' };
    }
    try {
      const res = await this.runWorker({
        action: 'health',
        model_id: this.modelId,
        quick: true,
        base_model_path: this.baseModelPath,
        ip_adapter_repo: this.ipAdapterRepo,
        ip_adapter_weight: this.ipAdapterWeight,
      }, { timeoutMs: 4_000 });
      if (!res.ok) {
        return { status: 'UNAVAILABLE' as const, reason: res.error ?? 'Diffusers runtime unavailable' };
      }
      const computeBackends = (res as { compute_backends?: Record<string, { available?: boolean; device?: string; dtype?: string }> }).compute_backends ?? {};
      const available = Object.entries(computeBackends)
        .filter(([, info]) => info?.available === true)
        .map(([backend, info]) => `${backend}:${info?.device ?? 'n/a'}`);
      const recommended = (res as { selected_backend?: string; recommended_backend?: string }).selected_backend ?? (res as { recommended_backend?: string }).recommended_backend ?? 'cpu';
      const referenceReady = res.readiness === 'REFERENCE_CAPABLE' || res.readiness === 'REFERENCE_INVOCATION_VALIDATED';
      const healthy = referenceReady || available.length > 0;
      return {
        status: healthy ? ('HEALTHY' as const) : ('UNAVAILABLE' as const),
        reason: healthy
          ? `Diffusers local runtime is healthy; available backends: ${available.join(', ') || recommended}`
          : `Diffusers runtime is present but no compatible local backend is available (${res.readiness ?? 'NOT_INSTALLED'})`,
        safeDiagnostic: JSON.stringify({
          runtime: res.runtime,
          models: res.models,
          readiness: res.readiness,
          computeBackends,
          selectedBackend: recommended,
          dtype: res.dtype,
          openvinoModelPrepared: res.openvino_model_prepared ?? false,
        }),
      };
    } catch (error) {
      return { status: 'UNAVAILABLE' as const, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Reusable, model-aware prompt-budget check: asks the worker to tokenize `prompt` and
   *  `negativePrompt` SEPARATELY with the REAL tokenizer for this provider's configured model —
   *  never a word-count or character-count approximation, and never silently truncated. Callers
   *  should call this before `generateImage()` when they want to fail with an actionable
   *  diagnostic ahead of spending a real generation; `generateImage()` also runs the identical
   *  check worker-side and refuses to generate on overflow regardless of whether the caller
   *  checked first — this method exists for callers that want the diagnostic without waiting on
   *  a full generation attempt. Not every provider on this interface implements token budgets the
   *  same way (or at all) — callers must not assume every `ImageGenerator` shares CLIP's 77-token
   *  limit; this method is specific to `DiffusersProvider`, not part of the generic interface. */
  async checkPromptBudget(prompt: string, negativePrompt = ''): Promise<PromptBudgetResult> {
    if (!this.enabled || !existsSync(this.workerPath)) {
      return { ok: false, error: 'Diffusers worker is missing or disabled' };
    }
    try {
      const res = await this.runWorker(
        { action: 'check_prompt', model_id: this.modelId, prompt, negative_prompt: negativePrompt },
        { timeoutMs: this.promptCheckTimeoutMs },
      );
      if (!res.ok) return { ok: false, error: res.error ?? 'prompt budget check failed' };
      return { ok: true, modelPath: res.modelPath, tokenizerClass: res.tokenizerClass, positive: res.positive, negative: res.negative, anyOverflow: res.anyOverflow };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Runs real foreground/background segmentation (U^2-Net, see workers/u2net_model.py) on a
   *  fully-opaque source image and returns an RGBA PNG whose alpha channel is a real matte — RGB
   *  pixels are untouched. This is a generic local-ML utility unrelated to which diffusion model
   *  this provider instance is configured for; it exists on `DiffusersProvider` only because that
   *  class already owns the spawn/JSON-worker transport this reuses (see apple_mps_worker.py's
   *  `segment_foreground` action). Not part of the generic `ImageGenerator` interface. */
  async segmentForeground(png: Buffer): Promise<SegmentForegroundResult> {
    if (!this.enabled || !existsSync(this.workerPath)) {
      return { ok: false, error: 'Diffusers worker is missing or disabled' };
    }
    try {
      const res = await this.runWorker(
        { action: 'segment_foreground', image_base64: png.toString('base64') },
        { timeoutMs: 60_000 },
      );
      if (!res.ok || !res.image_base64) return { ok: false, error: res.error ?? 'segmentation failed' };
      return {
        ok: true,
        buffer: Buffer.from(res.image_base64, 'base64'),
        model: res.model as string | undefined,
        modelVersion: res.modelVersion as string | undefined,
        occupancy: res.occupancy as number | undefined,
        device: res.device,
        inferenceSeconds: res.inferenceSeconds,
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    throwIfCancelled(request.signal);
    const seed = request.seed ?? Math.floor(Math.random() * 2 ** 31);
    const requestedBackend = this.device === 'auto' ? 'auto' : this.device;
    const backend = requestedBackend === 'auto'
      ? await this.resolveAutoBackend()
      : requestedBackend;
    const payload =
      {
        action: 'generate',
        model_id: this.modelId,
        base_model_path: this.baseModelPath,
        ip_adapter_repo: this.ipAdapterRepo,
        ip_adapter_weight: this.ipAdapterWeight,
        profile: request.profile,
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        width: request.width,
        height: request.height,
        seed,
        compute_backend: backend,
        // A per-request step count must win over the process-wide env var/default — otherwise a
        // caller's declared inferenceSteps and what actually runs can silently diverge, which
        // would make generationRequestHash() (built from the *requested* steps) lie about the
        // *executed* steps. Unset requests keep exactly the previous behavior.
        steps: request.inferenceSteps ?? Number(process.env.METROFORGE_OPENVINO_STEPS ?? 6),
        openvino_device: process.env.METROFORGE_OPENVINO_DEVICE ?? 'GPU',
        diagnostic_path: process.env.METROFORGE_OPENVINO_DIAGNOSTIC_PATH,
        ...(request.conditioning ? conditioningPayload(request.conditioning) : {}),
      };
    const res = backend === 'openvino_gpu'
      ? await this.runOpenVinoServer(payload, { timeoutMs: this.generationTimeoutMs, signal: request.signal })
      : await this.runWorker(payload, { timeoutMs: backend === 'cpu' ? this.cpuTimeoutMs : this.gpuTimeoutMs, signal: request.signal });

    if (!res.ok || !res.image_base64) {
      throw new Error(res.error ?? 'Diffusers worker failed');
    }

    return {
      image: Buffer.from(res.image_base64, 'base64'),
      provider: this.id,
      modelId: res.model_id ?? this.modelId,
      seed: res.seed ?? seed,
      fallbackGenerated: false,
      selectedProvider: 'diffusers',
      selectedModel: res.model_id ?? this.modelId,
      requestedCapability: 'image-generation',
      productionAllowed: true,
      fallbackReason: res.fallback_reason ?? undefined,
      executionMetadata: {
        computeBackend: backend,
        actualDevice: res.device,
        offloadStrategy: res.offload_strategy,
        executionPath: res.execution_path,
        timings: res.timings,
        workerReused: res.workerReused,
        modelCacheHit: res.modelCacheHit,
        compiledComponentCacheHit: res.compiledComponentCacheHit,
        tokenizerCacheHit: res.tokenizerCacheHit,
        schedulerCacheHit: res.schedulerCacheHit,
        memory: res.memory,
        runtime: res.runtime,
        // Effective conditioning/parameters actually sent to inference, echoed back by the
        // worker — provenance should reflect what ran, not just what was requested, and a caller
        // that wants to reject a requested/effective discrepancy can compare these against the
        // request fields above without re-deriving them.
        effectiveConditioningMode: res.effectiveConditioningMode,
        effectiveConditioningStrength: res.effectiveConditioningStrength,
        effectivePrompt: res.effectivePrompt,
        effectiveNegativePrompt: res.effectiveNegativePrompt,
        effectiveSteps: res.effectiveSteps,
        effectiveGuidance: res.effectiveGuidance,
        effectiveWidth: res.effectiveWidth,
        effectiveHeight: res.effectiveHeight,
        promptBudget: res.promptBudget,
      },
    };
  }

  private runWorker(
    payload: Record<string, unknown>,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<WorkerResponse> {
    const timeoutMs = options.timeoutMs ?? Number(process.env.METROFORGE_CPU_DIFFUSION_TIMEOUT_MS ?? 120000);
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonPath, [this.workerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        fn();
      };

      const onAbort = () => {
        terminateWorker(proc);
        finish(() => reject(new GenerationCancelledError()));
      };

      const timer = setTimeout(() => {
        terminateWorker(proc);
        // Report numeric progress only: stderr may contain prompts or private paths.
        // Loading and inference both use tqdm, so do not label this as inference progress.
        const reports = [...stderr.matchAll(/(\d{1,3})%\|[^\r\n]*?\|\s*(\d+)\/(\d+)/g)];
        const last = reports.at(-1);
        const progress = last ? `; last reported worker progress ${last[2]}/${last[3]} (${last[1]}%)` : '; no worker progress reported';
        finish(() => reject(new Error(`Diffusers worker timed out after ${timeoutMs}ms${progress}`)));
      }, timeoutMs);

      options.signal?.addEventListener('abort', onAbort, { once: true });

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err) => {
        finish(() => reject(err));
      });
      proc.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) {
          finish(() => reject(new Error(stderr || `Diffusers worker exited with code ${code}`)));
          return;
        }
        try {
          finish(() => resolve(JSON.parse(stdout) as WorkerResponse));
        } catch {
          finish(() => reject(new Error(stderr || 'Invalid diffusers worker response')));
        }
      });

      proc.stdin.write(JSON.stringify(payload));
      proc.stdin.end();
    });
  }

  private async resolveAutoBackend(): Promise<'cuda' | 'openvino_gpu' | 'cpu'> {
    const health = await this.runWorker({ action: 'health', model_id: this.modelId }, { timeoutMs: 4_000 });
    const selected = health.selected_backend;
    return selected === 'cuda' || selected === 'openvino_gpu' ? selected : 'cpu';
  }

  private runOpenVinoServer(
    payload: Record<string, unknown>,
    options: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<WorkerResponse> {
    const work = this.openvinoQueue.then(() => this.sendOpenVinoRequest(payload, options));
    this.openvinoQueue = work.catch(() => undefined);
    return work;
  }

  private sendOpenVinoRequest(
    payload: Record<string, unknown>,
    options: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      const server = this.getOpenVinoServer();
      const requestStartedAt = Date.now();
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        // These handlers belong to this request, not to the persistent worker. A successful
        // line response must remove them just as timeout/cancellation/crash paths do.
        server.removeListener('error', onError);
        server.removeListener('exit', onExit);
        fn();
      };
      const onError = (error: Error) => finish(() => reject(error));
      const onExit = () => {
        if (this.openvinoServer === server) this.openvinoServer = undefined;
        finish(() => reject(new Error('OpenVINO worker exited')));
      };
      const invalidateServer = () => {
        if (this.openvinoServer === server) this.openvinoServer = undefined;
        if (!server.killed) terminateWorker(server);
      };
      const onAbort = () => {
        invalidateServer();
        finish(() => reject(new GenerationCancelledError()));
      };
      const timer = setTimeout(() => {
        invalidateServer();
        finish(() => reject(new Error('OpenVINO worker timed out')));
      }, options.timeoutMs);
      this.openvinoPending = { resolve: (response) => finish(() => resolve({ ...response, timings: { ...(response.timings ?? {}), parentRoundTripMs: Date.now() - requestStartedAt, workerAgeMs: this.openvinoStartedAt ? Date.now() - this.openvinoStartedAt : undefined } })), reject: (error) => finish(() => reject(error)) };
      server.once('error', onError);
      server.once('exit', onExit);
      options.signal?.addEventListener('abort', onAbort, { once: true });
      server.stdin!.write(`${JSON.stringify(payload)}\n`);
    });
  }

  private getOpenVinoServer() {
    if (this.openvinoServer && !this.openvinoServer.killed) return this.openvinoServer;
    const server = spawn(this.pythonPath, [join(getResourceRoot(), 'workers', 'openvino_direct_server.py')], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const lines = createInterface({ input: server.stdout! });
    lines.on('line', (line) => {
      const pending = this.openvinoPending;
      if (!pending) return;
      const response = parseOpenVinoWorkerLine(line);
      // Native OpenVINO plugins can write informational text to stdout. Only a valid worker
      // protocol object owns/completes the request; noise must not consume the pending slot.
      if (!response) return;
      this.openvinoPending = undefined;
      pending.resolve(response);
    });
    server.stderr?.on('data', () => undefined);
    server.on('exit', () => {
      this.openvinoServer = undefined;
      this.openvinoStartedAt = undefined;
      const pending = this.openvinoPending;
      this.openvinoPending = undefined;
      pending?.reject(new Error('OpenVINO worker exited'));
    });
    this.openvinoServer = server;
    this.openvinoStartedAt = Date.now();
    return server;
  }

  async unloadOpenVinoRuntime(): Promise<void> {
    if (!this.openvinoServer || this.openvinoServer.killed) return;
    await this.runOpenVinoServer({ action: 'shutdown', model_id: 'sd-1.5' }, { timeoutMs: 30_000 });
    this.openvinoServer = undefined;
    this.openvinoStartedAt = undefined;
  }

  async warmupOpenVinoRuntime(): Promise<Record<string, unknown>> {
    const response = await this.runOpenVinoServer(
      { action: 'warmup', model_id: 'sd-1.5', compute_backend: 'openvino_gpu' },
      { timeoutMs: this.warmupTimeoutMs },
    );
    if (!response.ok) throw new Error(response.error ?? 'OpenVINO worker warmup failed');
    return {
      timings: response.timings ?? {},
      workerReused: response.workerReused ?? false,
      compiledComponentCacheHit: response.compiledComponentCacheHit ?? false,
      memory: response.memory ?? {},
      runtime: response.runtime ?? {},
    };
  }
}
