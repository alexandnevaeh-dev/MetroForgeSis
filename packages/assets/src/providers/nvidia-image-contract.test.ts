import { describe, expect, it } from 'vitest';
import { classifyNvidiaHttpFailure, hostedRequestBody, hostedEditRequestBody, parseNvidiaErrorBody, validateHostedImageRequest } from './nvidia-image-contract.js';
import { encodePng } from '../png.js';

describe('NVIDIA image endpoint contract', () => {
  it('serializes the minimal hosted request without generic image fields', () => {
    expect(hostedRequestBody({ prompt: 'simple hero', width: 64, height: 64, seed: 7 })).toEqual({ prompt: 'simple hero', seed: 7, width: 1024, height: 1024 });
  });

  it('rejects unsupported hosted request fields locally', () => {
    expect(() => validateHostedImageRequest({ prompt: 'hero', width: 64, height: 64, steps: 20 })).toThrow(/steps/i);
    expect(() => validateHostedImageRequest({ prompt: 'hero', width: 0, height: 64 })).toThrow(/dimensions/i);
  });

  it('extracts sanitized validation details from a 422 body', () => {
    const parsed = parseNvidiaErrorBody({ detail: [{ loc: ['body', 'width'], msg: 'invalid dimension', type: 'value_error' }] });
    expect(parsed).toEqual({ location: 'body.width', message: 'invalid dimension', errorType: 'value_error', field: undefined });
    expect(classifyNvidiaHttpFailure(422)).toBe('PROVIDER_REQUEST_INVALID');
  });

  it('classifies transient server failures separately', () => {
    expect(classifyNvidiaHttpFailure(504)).toBe('PROVIDER_SERVER_ERROR');
    expect(classifyNvidiaHttpFailure(429)).toBe('PROVIDER_RATE_LIMITED');
  });

  it('builds hosted edit request with data URI reference', () => {
    const rgba = new Uint8Array(32 * 32 * 4);
    rgba.fill(200);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
    const png = encodePng(32, 32, rgba);
    const body = hostedEditRequestBody({
      instruction: 'violet glow',
      width: 1024,
      height: 1024,
      seed: 1,
      references: [png],
    });
    expect(String(body.image)).toMatch(/^data:image\/png;base64,/);
    expect(body.prompt).toBe('violet glow');
  });
});
