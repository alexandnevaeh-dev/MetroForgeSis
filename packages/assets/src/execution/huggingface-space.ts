import { createHash, randomBytes } from 'node:crypto';
import type { ExecutionTarget, ExecutionTargetType, RemoteVisualRequest, RemoteVisualResult, RemoteVisualWorkerClient } from './remote-worker.js';
import { RemoteWorkerError, sha256Bytes } from './remote-worker.js';

/** ZeroGPU is FREE_DEVELOPMENT, never GUARANTEED_PRODUCTION — quota/queue/rate-limit states
 *  are tracked distinctly from a bad model/prompt so a capacity failure is never misread as
 *  a model failure. */
export type HfSpaceProviderState = 'AVAILABLE' | 'QUEUED' | 'PROCESSING' | 'QUOTA_AVAILABLE' | 'QUOTA_EXHAUSTED' | 'RATE_LIMITED' | 'UNKNOWN';

export type HfSpaceReadiness =
  | 'NOT_CONFIGURED'
  | 'DISCOVERY_FAILED'
  | 'ENDPOINT_MISSING_API'
  | 'AUTH_REQUIRED'
  | 'QUOTA_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'REFERENCE_CAPABLE'
  | 'REFERENCE_INVOCATION_VALIDATED'
  | 'INVOCATION_FAILED';

/** Granular error taxonomy — deliberately never collapsed into a single "HUGGINGFACE_FAILED"
 *  code, so capacity/auth/queue/API/model failures each get an honest, distinct classification. */
export type HfSpaceErrorCode =
  | 'HF_AUTH_REQUIRED'
  | 'HF_ZERO_GPU_QUOTA_EXHAUSTED'
  | 'HF_ZERO_GPU_QUEUE_BUSY'
  | 'HF_ZERO_GPU_RATE_LIMITED'
  | 'HF_SPACE_UNAVAILABLE'
  | 'HF_SPACE_APPLICATION_ERROR'
  | 'HF_SPACE_API_CHANGED'
  | 'HF_UPLOAD_FAILED'
  | 'HF_RESULT_INVALID'
  | 'HF_GALLERY_PAYLOAD_INVALID'
  | 'HF_MODEL_INFERENCE_ERROR'
  | 'HF_PROMPT_REWRITE_ERROR'
  | 'HF_TRANSPORT_ERROR';

export type HfNetworkStage =
  | 'HF_DISCOVERY'
  | 'HF_UPLOAD'
  | 'HF_SUBMIT'
  | 'HF_QUEUE_CONNECT'
  | 'HF_QUEUE_POLL'
  | 'HF_RESULT_DOWNLOAD';

export class HfTransportError extends RemoteWorkerError {
  readonly stage: HfNetworkStage;
  readonly causeCode?: string;
  readonly causeName?: string;
  readonly causeMessage?: string;
  readonly causeErrno?: string | number;
  readonly causeSyscall?: string;

  constructor(input: {
    stage: HfNetworkStage;
    message: string;
    causeCode?: string;
    causeName?: string;
    causeMessage?: string;
    causeErrno?: string | number;
    causeSyscall?: string;
  }) {
    super('HF_TRANSPORT_ERROR', input.message);
    this.name = 'HfTransportError';
    this.stage = input.stage;
    this.causeCode = input.causeCode;
    this.causeName = input.causeName;
    this.causeMessage = input.causeMessage;
    this.causeErrno = input.causeErrno;
    this.causeSyscall = input.causeSyscall;
  }

  toDiagnostic(): Record<string, unknown> {
    return {
      code: this.code,
      stage: this.stage,
      causeCode: this.causeCode,
      causeName: this.causeName,
      causeMessage: this.causeMessage,
      causeErrno: this.causeErrno,
      causeSyscall: this.causeSyscall,
      message: this.message,
    };
  }
}

export class HfStageError extends RemoteWorkerError {
  readonly stage: HfNetworkStage;
  readonly httpStatus?: number;
  readonly httpStatusText?: string;
  readonly responseSnippet?: string;

  constructor(input: {
    code: HfSpaceErrorCode;
    stage: HfNetworkStage;
    message: string;
    httpStatus?: number;
    httpStatusText?: string;
    responseSnippet?: string;
  }) {
    super(input.code, input.message);
    this.name = 'HfStageError';
    this.stage = input.stage;
    this.httpStatus = input.httpStatus;
    this.httpStatusText = input.httpStatusText;
    this.responseSnippet = input.responseSnippet;
  }

  toDiagnostic(): Record<string, unknown> {
    return {
      code: this.code,
      stage: this.stage,
      httpStatus: this.httpStatus,
      httpStatusText: this.httpStatusText,
      responseSnippet: this.responseSnippet,
      message: this.message,
    };
  }
}

export interface HuggingFaceSpaceConfig {
  token?: string;
  spaceId?: string;
  apiName?: string;
  rootUrl?: string;
  fetchImpl?: typeof fetch;
  timeouts?: Partial<HfSpaceTimeouts>;
}

/** Separate timeout budgets — ZeroGPU may queue for a while before GPU allocation even begins,
 *  so queueing is not a connection/network failure and must not share a short generic timeout. */
export interface HfSpaceTimeouts {
  connectionMs: number;
  uploadMs: number;
  queueMs: number;
  generationMs: number;
  resultTransferMs: number;
}

export const DEFAULT_HF_SPACE_TIMEOUTS: HfSpaceTimeouts = {
  connectionMs: 15_000,
  uploadMs: 30_000,
  queueMs: 120_000,
  generationMs: 180_000,
  resultTransferMs: 30_000,
};

export interface HfSpaceApiInput {
  id: number;
  type: string;
  label?: string;
  minimum?: number;
  maximum?: number;
  step?: number;
  defaultValue?: unknown;
}

export interface HfSpaceApiSchema {
  apiName: string;
  fnIndex: number;
  inputs: HfSpaceApiInput[];
  outputs: Array<{ id: number; type: string; label?: string }>;
  gradioVersion?: string;
  protocol?: string;
  apiPrefix: string;
}

export interface HuggingFaceSpaceDoctorReport {
  configured: boolean;
  spaceId?: string;
  rootUrl?: string;
  authenticated: boolean;
  hfTokenConfigured: boolean;
  apiDiscovery: 'PASS' | 'FAIL' | 'NOT_ATTEMPTED';
  spaceReachable: boolean;
  authenticationAttached: boolean;
  zeroGpuDetected: 'DETECTED' | 'UNKNOWN';
  referenceCapability: boolean;
  lastQuotaState: HfSpaceProviderState;
  readiness: HfSpaceReadiness;
  providerState: HfSpaceProviderState;
  apiSchema?: HfSpaceApiSchema;
  reason?: string;
  setupInstructions?: string[];
  transport?: Record<string, unknown>;
}

const NON_SECRET_SETUP_INSTRUCTIONS = [
  'Set HF_SPACE_ID to the Gradio Space to call (e.g. Qwen/Qwen-Image-Edit-2509).',
  'Optionally set HF_TOKEN (a Hugging Face account token) for authenticated ZeroGPU quota — never commit it.',
  'Optionally set HF_SPACE_API_NAME to select a specific named endpoint (default: /infer).',
  'ZeroGPU is FREE_DEVELOPMENT quota shared by anonymous users — expect QUOTA_EXHAUSTED/QUEUE_BUSY/RATE_LIMITED states, not a production SLA.',
];

/** Known official ZeroGPU Spaces where hardware is publicly documented, so `zeroGpuDetected`
 *  can be reported honestly as DETECTED without scraping any unstable internal endpoint. */
const KNOWN_ZEROGPU_SPACES = new Set(['Qwen/Qwen-Image-Edit-2509']);

export interface HfGradioFileData {
  path: string;
  url: string | null;
  size: number;
  orig_name: string;
  mime_type: string;
  is_stream: boolean;
  meta: { _type: 'gradio.FileData' };
}

export interface HfGalleryImageEntry {
  image: HfGradioFileData;
  caption: string | null;
}

export const HF_QWEN_DETERMINISTIC_INFER = {
  seed: 424242,
  randomizeSeed: false,
  trueGuidanceScale: 4.0,
  numInferenceSteps: 40,
  height: 1024,
  width: 1024,
  rewritePrompt: false,
} as const;

function rootUrlForSpaceId(spaceId: string): string {
  const slug = spaceId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return `https://${slug}.hf.space`;
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  return AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(timeoutMs)]);
}

export function createHfSessionHash(): string {
  return randomBytes(9).toString('base64url').slice(0, 12);
}

export function promptSha256(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex').toUpperCase();
}

/** Gradio 5.46.1 Gallery JSON shape from the live `/gradio_api/info` example_input —
 *  a list of GalleryImage objects, never a bare FileData or `[file, caption]` tuple. */
export function serializeHfGalleryInput(fileData: HfGradioFileData): HfGalleryImageEntry[] {
  if (!fileData.path) {
    throw new RemoteWorkerError('HF_GALLERY_PAYLOAD_INVALID', 'Gallery FileData is missing a path');
  }
  return [{ image: fileData, caption: null }];
}

function snapSlider(value: number, input?: HfSpaceApiInput): number {
  const min = Number(input?.minimum ?? Number.NaN);
  const max = Number(input?.maximum ?? Number.NaN);
  const step = Number(input?.step ?? 1);
  let next = value;
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  if (Number.isFinite(min) && Number.isFinite(step) && step > 0) {
    next = min + Math.round((next - min) / step) * step;
    if (Number.isFinite(max)) next = Math.min(max, next);
  }
  return next;
}

function inputByLabel(schema: HfSpaceApiSchema, label: string): HfSpaceApiInput | undefined {
  return schema.inputs.find((input) => (input.label ?? '').toLowerCase() === label.toLowerCase());
}

export function buildHfInferPayload(args: {
  schema: HfSpaceApiSchema;
  sessionHash: string;
  gallery: HfGalleryImageEntry[];
  prompt: string;
  seed: number;
  randomizeSeed: boolean;
  trueGuidanceScale: number;
  numInferenceSteps: number;
  height: number;
  width: number;
  rewritePrompt: boolean;
}): { data: unknown[]; fn_index: number; session_hash: string; event_data: null } {
  const seed = snapSlider(args.seed, inputByLabel(args.schema, 'Seed'));
  const guidance = snapSlider(args.trueGuidanceScale, inputByLabel(args.schema, 'True guidance scale'));
  const steps = snapSlider(args.numInferenceSteps, inputByLabel(args.schema, 'Number of inference steps'));
  const height = snapSlider(args.height, inputByLabel(args.schema, 'Height'));
  const width = snapSlider(args.width, inputByLabel(args.schema, 'Width'));
  const byType: Record<string, unknown> = {
    'input images': args.gallery,
    gallery: args.gallery,
    prompt: args.prompt,
    textbox: args.prompt,
    seed,
    'randomize seed': args.randomizeSeed,
    'true guidance scale': guidance,
    'number of inference steps': steps,
    height,
    width,
    'rewrite prompt': args.rewritePrompt,
  };
  const qwenOrder: unknown[] = [
    args.gallery,
    args.prompt,
    seed,
    args.randomizeSeed,
    guidance,
    steps,
    height,
    width,
    args.rewritePrompt,
  ];
  // Always send the full explicit /infer vector (including rewrite_prompt=false). A short
  // discovered input list must not fall back to Space defaults (rewrite and randomize are true).
  const data =
    args.schema.inputs.length >= 9
      ? args.schema.inputs.map((input) => {
          const label = (input.label ?? input.type ?? '').toLowerCase();
          if (label in byType) return byType[label];
          if (input.type === 'gallery') return args.gallery;
          if (input.type === 'textbox') return args.prompt;
          throw new RemoteWorkerError('HF_SPACE_API_CHANGED', `No value mapping for discovered /infer input '${input.label ?? input.type}'`);
        })
      : qwenOrder;
  return { data, fn_index: args.schema.fnIndex, session_hash: args.sessionHash, event_data: null };
}

function fileUrlForUpload(rootUrl: string, apiPrefix: string, uploadedPath: string): string {
  if (/^https?:\/\//i.test(uploadedPath)) return uploadedPath;
  return `${rootUrl}${apiPrefix}/file=${uploadedPath}`;
}

function sanitizeHfDiagnosticText(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bhf_[A-Za-z0-9]+/g, '[redacted]')
    .replace(/([?&](?:token|access_token|key|authorization)=)[^&\s]+/gi, '$1[redacted]');
}

function causeRecord(error: unknown): Record<string, unknown> | undefined {
  if (!error || typeof error !== 'object' || !('cause' in error)) return undefined;
  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== 'object') return undefined;
  return cause as Record<string, unknown>;
}

export function wrapHfTransportError(stage: HfNetworkStage, error: unknown): HfTransportError {
  if (error instanceof HfTransportError) return error;
  const err = error instanceof Error ? error : new Error(String(error));
  const cause = causeRecord(error);
  const timeout = err.name === 'TimeoutError' || err.name === 'AbortError' || /aborted|timeout/i.test(err.message);
  const causeCode =
    (typeof cause?.code === 'string' ? cause.code : undefined) ??
    (typeof cause?.name === 'string' && String(cause.name).startsWith('UND_ERR') ? String(cause.name) : undefined) ??
    (timeout ? 'TIMEOUT' : undefined);
  const causeName = typeof cause?.name === 'string' ? cause.name : undefined;
  const causeMessage = typeof cause?.message === 'string' ? sanitizeHfDiagnosticText(cause.message) : undefined;
  const causeErrno = typeof cause?.errno === 'string' || typeof cause?.errno === 'number' ? cause.errno : undefined;
  const causeSyscall = typeof cause?.syscall === 'string' ? cause.syscall : undefined;
  const parts = [`HF transport failed at ${stage}`, `${err.name}: ${sanitizeHfDiagnosticText(err.message)}`];
  if (causeName || causeCode || causeMessage) {
    parts.push(`cause ${causeName ?? 'Error'}${causeCode ? ` ${causeCode}` : ''}${causeMessage ? `: ${causeMessage}` : ''}`);
  }
  return new HfTransportError({
    stage,
    message: parts.join(' — '),
    causeCode,
    causeName,
    causeMessage,
    causeErrno,
    causeSyscall,
  });
}

async function hfFetch(stage: HfNetworkStage, fetchImpl: typeof fetch, input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(input, init);
  } catch (error) {
    throw wrapHfTransportError(stage, error);
  }
}

function parseSseErrorText(data: string): string {
  if (!data || data === 'null') return '';
  try {
    const parsed = JSON.parse(data) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      if (typeof record.error === 'string') return record.error;
      if (typeof record.message === 'string') return record.message;
    }
  } catch {
    return data;
  }
  return data;
}

async function safeResponseSnippet(response: Response): Promise<string | undefined> {
  try {
    const text = sanitizeHfDiagnosticText(await response.text());
    if (!text) return undefined;
    return text.length <= 300 ? text : `${text.slice(0, 300)}…`;
  } catch {
    return undefined;
  }
}

async function throwHfHttpStageError(
  stage: HfNetworkStage,
  response: Response,
  code: HfSpaceErrorCode,
  fallback: string,
): Promise<never> {
  const snippet = await safeResponseSnippet(response.clone());
  const statusLine = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
  const detail = snippet ? ` — ${snippet}` : '';
  throw new HfStageError({
    code,
    stage,
    httpStatus: response.status,
    httpStatusText: response.statusText || undefined,
    responseSnippet: snippet,
    message: `${fallback} (HTTP ${statusLine})${detail}`,
  });
}

/** Reusable adapter beneath the existing capability router / RemoteVisualWorkerClient contract —
 *  discovers the Space's Gradio API at runtime (never guesses endpoint names), uploads the
 *  canonical reference via the documented multipart upload route, invokes the named endpoint,
 *  and polls the SSE result stream. Authentication (when HF_TOKEN is configured) is attached to
 *  every request in the flow — discovery, upload, submission, polling, and result download —
 *  never only the first one. */
export class HuggingFaceSpaceExecutionBackend implements RemoteVisualWorkerClient {
  readonly target: ExecutionTarget;
  private readonly fetchImpl: typeof fetch;
  private readonly timeouts: HfSpaceTimeouts;
  private cachedSchema: HfSpaceApiSchema | undefined;
  private lastQuotaState: HfSpaceProviderState = 'UNKNOWN';

  constructor(private readonly config: HuggingFaceSpaceConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeouts = { ...DEFAULT_HF_SPACE_TIMEOUTS, ...config.timeouts };
    const rootUrl = config.rootUrl ?? (config.spaceId ? rootUrlForSpaceId(config.spaceId) : undefined);
    const type: ExecutionTargetType = 'HF_ZEROGPU_SPACE';
    this.target = {
      id: config.spaceId ? `hf-space:${config.spaceId}` : 'hf-space:unconfigured',
      type,
      location: 'remote',
      provider: 'huggingface-zerogpu',
      endpoint: rootUrl,
      capabilities: [],
      health: 'UNKNOWN',
      authenticationType: config.token ? 'bearer' : 'none',
      availability: rootUrl ? 'configured' : 'unconfigured',
      costMetadata: { costClass: 'free', costTier: 'FREE_QUOTA', billingProvider: 'huggingface', gpuClass: 'ZeroGPU' },
    };
  }

  /** Never logs, prints, or embeds the token — only attaches it as a request header. */
  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.config.token) headers.Authorization = `Bearer ${this.config.token}`;
    return headers;
  }

  async discover(signal?: AbortSignal): Promise<HfSpaceApiSchema> {
    if (this.cachedSchema) return this.cachedSchema;
    if (!this.target.endpoint) throw new RemoteWorkerError('HF_SPACE_NOT_CONFIGURED', 'HF_SPACE_ID is not configured');
    const res = await hfFetch('HF_DISCOVERY', this.fetchImpl, `${this.target.endpoint}/config`, { headers: this.headers(), signal: withTimeout(signal, this.timeouts.connectionMs) });
    if (res.status === 401 || res.status === 403) throw new HfStageError({ code: 'HF_AUTH_REQUIRED', stage: 'HF_DISCOVERY', httpStatus: res.status, httpStatusText: res.statusText || undefined, message: 'Hugging Face authentication failed while reading Space config' });
    if (res.status >= 500) await throwHfHttpStageError('HF_DISCOVERY', res, 'HF_SPACE_UNAVAILABLE', 'Space config request failed');
    if (!res.ok) await throwHfHttpStageError('HF_DISCOVERY', res, 'HF_SPACE_API_CHANGED', 'Space config request failed');
    const json = (await res.json()) as { dependencies?: Array<Record<string, unknown>>; components?: Array<Record<string, unknown>>; version?: string; protocol?: string; api_prefix?: string };
    const apiName = this.config.apiName ?? '/infer';
    const bareName = apiName.replace(/^\//, '');
    const dependencies = json.dependencies ?? [];
    const dep = dependencies.find((d) => d.api_name === bareName);
    if (!dep) throw new RemoteWorkerError('HF_SPACE_API_CHANGED', `Space does not expose named API endpoint '${apiName}'`);
    const comps = json.components ?? [];
    const describe = (id: number): HfSpaceApiInput => {
      const c = comps.find((x) => x.id === id) as { type?: string; props?: Record<string, unknown> } | undefined;
      const props = c?.props ?? {};
      return {
        id,
        type: c?.type ?? 'unknown',
        label: typeof props.label === 'string' ? props.label : undefined,
        minimum: typeof props.minimum === 'number' ? props.minimum : undefined,
        maximum: typeof props.maximum === 'number' ? props.maximum : undefined,
        step: typeof props.step === 'number' ? props.step : undefined,
        defaultValue: props.value,
      };
    };
    this.cachedSchema = {
      apiName,
      fnIndex: Number(dep.id ?? 0),
      inputs: ((dep.inputs as number[]) ?? []).map(describe),
      outputs: ((dep.outputs as number[]) ?? []).map(describe),
      gradioVersion: json.version,
      protocol: json.protocol,
      apiPrefix: json.api_prefix ?? '/gradio_api',
    };
    return this.cachedSchema;
  }

  async health(signal?: AbortSignal): Promise<Record<string, unknown>> {
    const schema = await this.discover(signal);
    return { status: 'healthy', apiName: schema.apiName, gradioVersion: schema.gradioVersion, modelState: 'MODEL_READY' };
  }

  async capabilities(signal?: AbortSignal): Promise<Record<string, unknown>> {
    const schema = await this.discover(signal);
    return { worker: 'huggingface-zerogpu-space', apiName: schema.apiName, capabilities: ['IMAGE_GENERATION', 'IMAGE_EDITING', 'REFERENCE_IMAGE'] };
  }

  private async uploadFile(bytes: Buffer, filename: string, apiPrefix: string, sessionHash: string, signal?: AbortSignal): Promise<string> {
    const form = new FormData();
    form.append('files', new Blob([bytes], { type: 'image/png' }), filename);
    const res = await hfFetch(
      'HF_UPLOAD',
      this.fetchImpl,
      `${this.target.endpoint}${apiPrefix}/upload?upload_id=${encodeURIComponent(sessionHash)}`,
      {
        method: 'POST',
        body: form,
        headers: this.headers(),
        signal: withTimeout(signal, this.timeouts.uploadMs),
      },
    );
    if (res.status === 401 || res.status === 403) throw new HfStageError({ code: 'HF_AUTH_REQUIRED', stage: 'HF_UPLOAD', httpStatus: res.status, httpStatusText: res.statusText || undefined, message: 'Hugging Face authentication failed during upload' });
    if (res.status === 429) throw new HfStageError({ code: 'HF_ZERO_GPU_RATE_LIMITED', stage: 'HF_UPLOAD', httpStatus: res.status, httpStatusText: res.statusText || undefined, message: 'Hugging Face Space rate-limited the upload request' });
    if (res.status >= 500) await throwHfHttpStageError('HF_UPLOAD', res, 'HF_SPACE_UNAVAILABLE', 'Upload failed');
    if (!res.ok) await throwHfHttpStageError('HF_UPLOAD', res, 'HF_UPLOAD_FAILED', 'Upload failed');
    const [path] = (await res.json()) as string[];
    if (!path) throw new RemoteWorkerError('HF_UPLOAD_FAILED', 'Upload response did not include a file path');
    return path;
  }

  async generate(request: RemoteVisualRequest, signal?: AbortSignal): Promise<RemoteVisualResult> {
    const started = Date.now();
    const schema = await this.discover(signal);
    const source = request.sourceImages?.[0];
    if (!source) throw new RemoteWorkerError('REFERENCE_IMAGE_REQUIRED', 'HuggingFace Space reference generation requires a source image');
    const sessionHash = createHfSessionHash();
    const uploadedPath = await this.uploadFile(source.bytes, `${source.assetId}.png`, schema.apiPrefix, sessionHash, signal);
    if (!uploadedPath || typeof uploadedPath !== 'string') {
      throw new RemoteWorkerError('HF_GALLERY_PAYLOAD_INVALID', 'Upload did not return a usable file path for the Gallery input');
    }
    const fileData: HfGradioFileData = {
      path: uploadedPath,
      url: fileUrlForUpload(this.target.endpoint ?? '', schema.apiPrefix, uploadedPath),
      size: source.bytes.length,
      orig_name: `${source.assetId}.png`,
      mime_type: 'image/png',
      is_stream: false,
      meta: { _type: 'gradio.FileData' },
    };
    const galleryEntries = serializeHfGalleryInput(fileData);
    const trueGuidanceScale = Number(request.conditioning?.trueGuidanceScale ?? HF_QWEN_DETERMINISTIC_INFER.trueGuidanceScale);
    const numInferenceSteps = Number(request.conditioning?.numInferenceSteps ?? HF_QWEN_DETERMINISTIC_INFER.numInferenceSteps);
    const randomizeSeed = Boolean(request.conditioning?.randomizeSeed ?? HF_QWEN_DETERMINISTIC_INFER.randomizeSeed);
    const rewritePrompt = Boolean(request.conditioning?.rewritePrompt ?? HF_QWEN_DETERMINISTIC_INFER.rewritePrompt);
    const payload = buildHfInferPayload({
      schema,
      sessionHash,
      gallery: galleryEntries,
      prompt: request.prompt,
      seed: request.seed,
      randomizeSeed,
      trueGuidanceScale,
      numInferenceSteps,
      height: request.height,
      width: request.width,
      rewritePrompt,
    });
    const callRes = await hfFetch(
      'HF_SUBMIT',
      this.fetchImpl,
      `${this.target.endpoint}${schema.apiPrefix}/call${schema.apiName}`,
      {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: withTimeout(signal, this.timeouts.connectionMs),
      },
    );
    if (callRes.status === 401 || callRes.status === 403) throw new HfStageError({ code: 'HF_AUTH_REQUIRED', stage: 'HF_SUBMIT', httpStatus: callRes.status, httpStatusText: callRes.statusText || undefined, message: 'Hugging Face authentication failed during invocation' });
    if (callRes.status === 429) throw new HfStageError({ code: 'HF_ZERO_GPU_RATE_LIMITED', stage: 'HF_SUBMIT', httpStatus: callRes.status, httpStatusText: callRes.statusText || undefined, message: 'Hugging Face Space rate-limited the call request' });
    if (callRes.status >= 500) await throwHfHttpStageError('HF_SUBMIT', callRes, 'HF_SPACE_UNAVAILABLE', 'Call failed');
    if (!callRes.ok) await throwHfHttpStageError('HF_SUBMIT', callRes, 'HF_SPACE_API_CHANGED', 'Call failed');
    const callJson = (await callRes.json()) as { event_id?: string };
    if (!callJson.event_id) throw new RemoteWorkerError('HF_SPACE_API_CHANGED', 'Space did not return an event id');
    const queueStarted = Date.now();
    const polled = await this.pollEvent(schema, callJson.event_id, signal);
    const generationDoneAt = Date.now();
    const outputs = polled.outputs;
    const gallery = outputs[0] as Array<{ image?: { url?: string | null; path?: string } } | { url?: string; path?: string }> | undefined;
    const first = gallery?.[0];
    const imageInfo =
      first && typeof first === 'object' && 'image' in first
        ? first.image
        : (first as { url?: string; path?: string } | undefined);
    const url = imageInfo?.url ?? (imageInfo?.path ? fileUrlForUpload(this.target.endpoint ?? '', schema.apiPrefix, imageInfo.path) : undefined);
    if (!url) throw new HfStageError({ code: 'HF_RESULT_INVALID', stage: 'HF_RESULT_DOWNLOAD', message: 'Space did not return an output image' });
    const imgRes = await hfFetch('HF_RESULT_DOWNLOAD', this.fetchImpl, url, { headers: this.headers(), signal: withTimeout(signal, this.timeouts.resultTransferMs) });
    if (!imgRes.ok) await throwHfHttpStageError('HF_RESULT_DOWNLOAD', imgRes, 'HF_RESULT_INVALID', 'Output image download failed');
    const image = Buffer.from(await imgRes.arrayBuffer());
    if (image.length === 0) throw new RemoteWorkerError('HF_RESULT_INVALID', 'Output image download returned zero bytes');
    const outputSha256 = sha256Bytes(image);
    this.lastQuotaState = 'AVAILABLE';
    return {
      requestId: request.requestId,
      success: true,
      provider: 'huggingface-zerogpu',
      model: this.config.spaceId ?? 'unknown',
      executionTarget: this.target,
      seed: request.seed,
      durationMs: Date.now() - started,
      image,
      outputSha256,
      warnings: [],
      errors: [],
      provenance: {
        referenceInputUsed: true,
        sourceAssetId: source.assetId,
        sourceHash: source.sha256,
        spaceId: this.config.spaceId,
        apiName: schema.apiName,
        apiEndpoint: `${schema.apiPrefix}/call${schema.apiName}`,
        executionType: 'HF_ZEROGPU',
        seed: request.seed,
        randomizeSeed,
        rewritePrompt,
        trueGuidanceScale,
        numInferenceSteps,
        height: request.height,
        width: request.width,
        promptHash: promptSha256(request.prompt),
        queueTimeMs: polled.processStartedAt ? polled.processStartedAt - queueStarted : queueStarted - started,
        generationTimeMs: polled.processStartedAt ? generationDoneAt - polled.processStartedAt : generationDoneAt - queueStarted,
        outputHash: outputSha256,
      },
    };
  }

  private async pollEvent(
    schema: HfSpaceApiSchema,
    eventId: string,
    signal?: AbortSignal,
  ): Promise<{ outputs: unknown[]; processStartedAt?: number }> {
    const res = await hfFetch(
      'HF_QUEUE_CONNECT',
      this.fetchImpl,
      `${this.target.endpoint}${schema.apiPrefix}/call${schema.apiName}/${eventId}`,
      {
        headers: { ...this.headers(), Accept: 'text/event-stream' },
        signal: withTimeout(signal, this.timeouts.queueMs + this.timeouts.generationMs),
      },
    );
    if (res.status === 401 || res.status === 403) throw new HfStageError({ code: 'HF_AUTH_REQUIRED', stage: 'HF_QUEUE_CONNECT', httpStatus: res.status, httpStatusText: res.statusText || undefined, message: 'Hugging Face authentication failed while polling the result stream' });
    if (res.status === 429) { this.lastQuotaState = 'RATE_LIMITED'; throw new HfStageError({ code: 'HF_ZERO_GPU_RATE_LIMITED', stage: 'HF_QUEUE_CONNECT', httpStatus: res.status, httpStatusText: res.statusText || undefined, message: 'Hugging Face Space rate-limited the result stream' }); }
    if (res.status >= 500) await throwHfHttpStageError('HF_QUEUE_CONNECT', res, 'HF_SPACE_UNAVAILABLE', 'Queue connect failed');
    if (!res.ok) await throwHfHttpStageError('HF_QUEUE_CONNECT', res, 'HF_MODEL_INFERENCE_ERROR', 'Queue connect failed');
    if (!res.body) throw new HfStageError({ code: 'HF_SPACE_UNAVAILABLE', stage: 'HF_QUEUE_CONNECT', message: 'Space did not return an event stream' });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let processStartedAt: number | undefined;
    while (true) {
      let value: Uint8Array | undefined;
      let done = false;
      try {
        ({ value, done } = await reader.read());
      } catch (error) {
        throw wrapHfTransportError('HF_QUEUE_POLL', error);
      }
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const lines = part.split('\n');
        let event = 'message';
        let data = '';
        for (const line of lines) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (event === 'estimation' || event === 'heartbeat') this.lastQuotaState = 'QUEUED';
        if (event === 'process_starts') {
          this.lastQuotaState = 'PROCESSING';
          processStartedAt = Date.now();
        }
        if (event === 'complete') {
          this.lastQuotaState = 'AVAILABLE';
          const parsed = JSON.parse(data) as unknown;
          const outputs = Array.isArray(parsed)
            ? parsed
            : parsed && typeof parsed === 'object' && Array.isArray((parsed as { data?: unknown[] }).data)
              ? (parsed as { data: unknown[] }).data
              : null;
          if (!outputs) throw new RemoteWorkerError('HF_RESULT_INVALID', 'Complete event did not contain an output array');
          return { outputs, processStartedAt };
        }
        if (event === 'error') {
          const text = parseSseErrorText(data);
          const lowered = text.toLowerCase();
          const isEmpty = text === '';
          const isQuota = /quota|gpu.?time|out of gpu/.test(lowered);
          const isQueue = /queue/.test(lowered) && /(full|busy|limit)/.test(lowered);
          const isAuth = /unauthorized|authentication|forbidden/.test(lowered);
          const isRewrite = /rewrite|dashscope/.test(lowered);
          const isGalleryPayload = /gallery|invalid.*input|malformed|schema/.test(lowered);
          let code: HfSpaceErrorCode;
          if (isAuth) code = 'HF_AUTH_REQUIRED';
          else if (isQuota) code = 'HF_ZERO_GPU_QUOTA_EXHAUSTED';
          else if (isQueue) code = 'HF_ZERO_GPU_QUEUE_BUSY';
          else if (isRewrite) code = 'HF_PROMPT_REWRITE_ERROR';
          else if (isGalleryPayload) code = 'HF_GALLERY_PAYLOAD_INVALID';
          else if (isEmpty) code = 'HF_SPACE_APPLICATION_ERROR';
          else code = 'HF_MODEL_INFERENCE_ERROR';
          this.lastQuotaState = isQuota ? 'QUOTA_EXHAUSTED' : this.lastQuotaState;
          throw new HfStageError({
            code,
            stage: 'HF_QUEUE_POLL',
            responseSnippet: !isEmpty ? sanitizeHfDiagnosticText(text) : undefined,
            message: !isEmpty ? sanitizeHfDiagnosticText(text) : 'Space raised an error without further detail — commonly correlates with anonymous/authenticated ZeroGPU capacity restrictions on public Spaces, but this is not proven by the response.',
          });
        }
      }
    }
    throw new HfStageError({ code: 'HF_SPACE_APPLICATION_ERROR', stage: 'HF_QUEUE_POLL', message: 'Event stream ended before a result was received' });
  }

  async doctor(signal?: AbortSignal): Promise<HuggingFaceSpaceDoctorReport> {
    const configured = Boolean(this.config.spaceId);
    const hfTokenConfigured = Boolean(this.config.token);
    const zeroGpuDetected = this.config.spaceId && KNOWN_ZEROGPU_SPACES.has(this.config.spaceId) ? 'DETECTED' : 'UNKNOWN';
    const base = {
      configured,
      spaceId: this.config.spaceId,
      rootUrl: this.target.endpoint,
      authenticated: hfTokenConfigured,
      hfTokenConfigured,
      authenticationAttached: hfTokenConfigured,
      zeroGpuDetected: zeroGpuDetected as 'DETECTED' | 'UNKNOWN',
      lastQuotaState: this.lastQuotaState,
    };
    if (!configured) {
      return {
        ...base,
        apiDiscovery: 'NOT_ATTEMPTED',
        spaceReachable: false,
        referenceCapability: false,
        readiness: 'NOT_CONFIGURED',
        providerState: 'UNKNOWN',
        reason: 'HF_SPACE_CONFIGURATION_REQUIRED: HF_SPACE_ID is not configured',
        setupInstructions: NON_SECRET_SETUP_INSTRUCTIONS,
      };
    }
    try {
      const schema = await this.discover(signal);
      return {
        ...base,
        apiDiscovery: 'PASS',
        spaceReachable: true,
        referenceCapability: true,
        readiness: 'REFERENCE_CAPABLE',
        providerState: 'AVAILABLE',
        apiSchema: schema,
        reason: `Discovered named API endpoint ${schema.apiName} with ${schema.inputs.length} inputs`,
      };
    } catch (error) {
      const transport = error instanceof HfTransportError ? error.toDiagnostic() : undefined;
      const code = error instanceof RemoteWorkerError ? (error.code as HfSpaceErrorCode) : 'HF_SPACE_UNAVAILABLE';
      const readiness: HfSpaceReadiness = code === 'HF_SPACE_API_CHANGED' ? 'ENDPOINT_MISSING_API' : code === 'HF_AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'DISCOVERY_FAILED';
      return {
        ...base,
        apiDiscovery: 'FAIL',
        spaceReachable: code !== 'HF_SPACE_UNAVAILABLE' && code !== 'HF_TRANSPORT_ERROR',
        referenceCapability: false,
        readiness,
        providerState: 'UNKNOWN',
        reason: error instanceof Error ? error.message : String(error),
        setupInstructions: NON_SECRET_SETUP_INSTRUCTIONS,
        transport,
      };
    }
  }
}
