import { createHash } from 'node:crypto';

export type NvidiaImageEndpointFamily =
  | 'NVIDIA_HOSTED_BUILD_API'
  | 'NVIDIA_SELF_HOSTED_NIM_INFER'
  | 'NVIDIA_SELF_HOSTED_NIM_OPENAI_IMAGES';

export type NvidiaImageErrorCategory =
  | 'PROVIDER_REQUEST_INVALID'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_SERVER_ERROR'
  | 'PROVIDER_RESPONSE_INVALID';

export interface NormalizedNvidiaImageRequest {
  prompt: string;
  width: number;
  height: number;
  seed?: number;
  reference?: Buffer;
  numberOfImages?: number;
  steps?: number;
  guidance?: number;
}

export interface NormalizedNvidiaEditRequest {
  instruction: string;
  width: number;
  height: number;
  seed?: number;
  /** One or more reference/source images (catalog decides max count). */
  references: Buffer[];
  strength?: number;
}

export interface NvidiaProviderDiagnostic {
  category: NvidiaImageErrorCategory;
  endpointFamily: NvidiaImageEndpointFamily;
  status: number | null;
  contentType?: string;
  errorType?: string;
  field?: string;
  location?: string;
  message: string;
  requestId?: string;
  attempt: number;
  requestHash: string;
}

export function validateHostedImageRequest(request: NormalizedNvidiaImageRequest): void {
  if (!request.prompt.trim()) throw new Error('NVIDIA image request prompt must not be empty');
  if (request.width <= 0 || request.height <= 0) throw new Error('NVIDIA image request dimensions must be positive');
  if (request.numberOfImages !== undefined && request.numberOfImages !== 1) {
    throw new Error('NVIDIA hosted image endpoint supports one image per request');
  }
  if (request.steps !== undefined || request.guidance !== undefined) {
    throw new Error('NVIDIA hosted image endpoint does not accept steps or guidance fields');
  }
}

export function hostedRequestBody(request: NormalizedNvidiaImageRequest): Record<string, unknown> {
  validateHostedImageRequest(request);
  return {
    prompt: request.prompt,
    seed: request.seed,
    width: 1024,
    height: 1024,
  };
}

function isPng(buf: Buffer): boolean {
  return buf.length >= 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG';
}

function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/** Encode reference bytes for hosted Kontext / img2img — data URI, never raw base64 field alone. */
export function encodeNvidiaReferenceImage(bytes: Buffer): string {
  const mime = isPng(bytes) ? 'image/png' : isJpeg(bytes) ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

export function validateHostedEditRequest(request: NormalizedNvidiaEditRequest): void {
  if (!request.instruction.trim()) throw new Error('NVIDIA image edit instruction must not be empty');
  if (request.references.length === 0) throw new Error('NVIDIA image edit requires at least one reference image');
  if (request.width <= 0 || request.height <= 0) throw new Error('NVIDIA image edit dimensions must be positive');
}

export function hostedEditRequestBody(request: NormalizedNvidiaEditRequest): Record<string, unknown> {
  validateHostedEditRequest(request);
  const body: Record<string, unknown> = {
    prompt: request.instruction,
    seed: request.seed,
    width: 1024,
    height: 1024,
  };
  const primary = request.references[0];
  if (primary) {
    body.image = encodeNvidiaReferenceImage(primary);
  }
  return body;
}

/** OpenAI-compatible NIM /v1/images/edits multipart field plan (no network). */
export function buildNimImageEditMultipart(input: {
  model: string;
  instruction: string;
  references: Buffer[];
  seed?: number;
}): {
  fields: Record<string, string>;
  files: Array<{ fieldName: string; filename: string; bytes: Buffer; mimeType: string }>;
} {
  if (!input.instruction.trim()) throw new Error('NIM image edit instruction must not be empty');
  if (input.references.length === 0) throw new Error('NIM image edit requires at least one reference image');

  const fields: Record<string, string> = {
    model: input.model,
    prompt: input.instruction,
    response_format: 'b64_json',
  };
  if (input.seed !== undefined) fields.seed = String(input.seed);

  const files = input.references.map((bytes, index) => {
    const mime = isPng(bytes) ? 'image/png' : isJpeg(bytes) ? 'image/jpeg' : 'image/png';
    const ext = mime === 'image/jpeg' ? 'jpg' : 'png';
    return {
      fieldName: 'image',
      filename: `reference_${index + 1}.${ext}`,
      bytes,
      mimeType: mime,
    };
  });

  return { fields, files };
}

/** Extract image bytes from OpenAI-style or NVCF-style NIM edit responses. */
export function extractNimEditImageBytes(body: unknown): Buffer | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;

  const data = Array.isArray(value.data) ? value.data : null;
  if (data?.[0] && typeof data[0] === 'object') {
    const row = data[0] as Record<string, unknown>;
    const b64 = typeof row.b64_json === 'string' ? row.b64_json : typeof row.base64 === 'string' ? row.base64 : undefined;
    if (b64?.trim()) {
      try {
        return Buffer.from(b64.trim(), 'base64');
      } catch {
        return null;
      }
    }
  }

  const artifacts = Array.isArray(value.artifacts) ? value.artifacts : null;
  if (artifacts?.[0] && typeof artifacts[0] === 'object') {
    const row = artifacts[0] as Record<string, unknown>;
    const b64 = typeof row.base64 === 'string' ? row.base64 : undefined;
    if (b64?.trim()) {
      try {
        return Buffer.from(b64.trim(), 'base64');
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function requestHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
}

function firstString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseNvidiaErrorBody(body: unknown): {
  errorType?: string;
  field?: string;
  location?: string;
  message?: string;
} {
  if (!body || typeof body !== 'object') return {};
  const value = body as Record<string, unknown>;
  const detail = Array.isArray(value.detail) ? value.detail[0] : value.detail;
  const detailObject = detail && typeof detail === 'object' ? detail as Record<string, unknown> : {};
  const error = value.error && typeof value.error === 'object' ? value.error as Record<string, unknown> : {};
  const loc = Array.isArray(detailObject.loc) ? detailObject.loc.map(String).join('.') : firstString(detailObject.location);
  return {
    errorType: firstString(value.type) ?? firstString(error.type) ?? firstString(detailObject.type),
    field: firstString(value.field) ?? firstString(error.field) ?? firstString(detailObject.field),
    location: loc,
    message:
      firstString(value.title) ?? firstString(value.message) ?? firstString(error.message) ??
      firstString(detailObject.msg) ?? firstString(detailObject.message) ?? firstString(value.detail),
  };
}

export function classifyNvidiaHttpFailure(status: number): NvidiaImageErrorCategory {
  if (status === 401 || status === 403) return 'PROVIDER_AUTH_FAILED';
  if (status === 429) return 'PROVIDER_RATE_LIMITED';
  if (status === 400 || status === 422) return 'PROVIDER_REQUEST_INVALID';
  if (status >= 500) return 'PROVIDER_SERVER_ERROR';
  return 'PROVIDER_RESPONSE_INVALID';
}
