import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLogger, redactString } from './logger.js';

describe('redactString', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NVIDIA_API_KEY = 'nvapi-supersecrettestvalue1234567890';
    process.env.GEMINI_API_KEY = 'AIzaSyTestSecretGeminiKeyValueHere123';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('redacts a literal occurrence of a configured secret env var', () => {
    const out = redactString(`request failed with key ${process.env.NVIDIA_API_KEY}`);
    expect(out).not.toContain('supersecrettestvalue');
    expect(out).toContain('***REDACTED***');
  });

  it('redacts an Authorization: Bearer header verbatim in an error message', () => {
    const out = redactString('fetch failed, headers: Authorization: Bearer abc123.def456-ghi789');
    expect(out).not.toContain('abc123.def456-ghi789');
    expect(out).toContain('Authorization: Bearer ***REDACTED***');
  });

  it('redacts a ?key= query-string credential (Gemini auth scheme)', () => {
    const out = redactString('GET https://api.example.com/v1/models?key=AIzaVerySecretValue123');
    expect(out).not.toContain('AIzaVerySecretValue123');
    expect(out).toContain('key=***REDACTED***');
  });

  it('redacts known provider key-prefix shapes even without a matching env var', () => {
    expect(redactString('token was hf_abcdefgh12345678')).not.toContain('hf_abcdefgh12345678');
    expect(redactString('token was gsk_abcdefgh12345678')).not.toContain('gsk_abcdefgh12345678');
    expect(redactString('token was sk-abcdefgh12345678')).not.toContain('sk-abcdefgh12345678');
  });

  it('leaves ordinary text untouched', () => {
    expect(redactString('Generation complete for slug my-game')).toBe(
      'Generation complete for slug my-game',
    );
  });
});

describe('createLogger — redaction applied to real log output', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NVIDIA_API_KEY = 'nvapi-loggertestsecretvalue1234567890';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('never prints the real secret value, in message or context, to stdout/stderr', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const logger = createLogger('test-logger', 'debug');
    logger.info(`calling provider with key ${process.env.NVIDIA_API_KEY}`);
    logger.error('provider failed', { detail: `Authorization: Bearer ${process.env.NVIDIA_API_KEY}` });

    const allOutput = [...logSpy.mock.calls, ...errorSpy.mock.calls].map((c) => String(c[0])).join('\n');
    expect(allOutput).not.toContain('loggertestsecretvalue');
    expect(allOutput).toContain('***REDACTED***');
  });
});
