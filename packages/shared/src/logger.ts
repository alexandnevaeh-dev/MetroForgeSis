/** Env vars whose values must never appear verbatim in a log line. Individual providers
 *  (e.g. NVIDIA's own `redact()` in packages/ai/src/providers/nvidia.ts) already guard their
 *  own error paths, but that protection is per-provider and easy to miss for a new one — this
 *  is the backstop every log line goes through regardless of which code produced it. */
const SECRET_ENV_VARS = [
  'NVIDIA_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'HUGGINGFACE_API_KEY',
] as const;

/** Fallback patterns for secrets that didn't come from one of the known env vars above (e.g.
 *  a key baked into a config file, or a provider added later without updating this list) —
 *  matches on shape rather than exact value. Group 1 is the non-secret prefix to keep (e.g.
 *  "Authorization: Bearer "), group 2 is the secret to drop. */
const PREFIXED_SECRET_PATTERNS: RegExp[] = [
  /\b(Authorization:\s*Bearer\s+)(\S+)/gi,
  /([?&]key=)([^&\s"']+)/gi,
];

/** Known provider key-prefix formats where the *entire* match is the secret — nothing to
 *  preserve, unlike the prefixed patterns above. */
const WHOLE_MATCH_SECRET_PATTERNS: RegExp[] = [
  /\bnvapi-[A-Za-z0-9_-]{8,}\b/g,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bgsk_[A-Za-z0-9_-]{8,}\b/g,
  /\bhf_[A-Za-z0-9_-]{8,}\b/g,
];

export function redactString(input: string): string {
  let out = input;
  for (const envVar of SECRET_ENV_VARS) {
    const value = process.env[envVar];
    if (value && value.length >= 6) {
      out = out.split(value).join('***REDACTED***');
    }
  }
  for (const pattern of PREFIXED_SECRET_PATTERNS) {
    out = out.replace(pattern, (_match, prefix: string) => `${prefix}***REDACTED***`);
  }
  for (const pattern of WHOLE_MATCH_SECRET_PATTERNS) {
    out = out.replace(pattern, '***REDACTED***');
  }
  return out;
}

/** Recursively redacts every string value in a log context object, bounded to a shallow depth
 *  (log context is metadata, not arbitrary deep structures — this is defense-in-depth, not a
 *  general-purpose sanitizer) so a pathological/circular object can't hang the logger. */
function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 4) return value;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactDeep(v, depth + 1);
    return out;
  }
  return value;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId?: string;
  jobId?: string;
  phase?: string;
  provider?: string;
  model?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(
  name: string,
  minLevel: LogLevel = 'info',
  baseContext: LogContext = {},
): Logger {
  const log = (level: LogLevel, message: string, context?: LogContext) => {
    if (LEVELS[level] < LEVELS[minLevel]) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      logger: name,
      message: redactString(message),
      ...(redactDeep({ ...baseContext, ...context }) as LogContext),
    };
    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug: (m, c) => log('debug', m, c),
    info: (m, c) => log('info', m, c),
    warn: (m, c) => log('warn', m, c),
    error: (m, c) => log('error', m, c),
    child: (ctx) => createLogger(name, minLevel, { ...baseContext, ...ctx }),
  };
}
