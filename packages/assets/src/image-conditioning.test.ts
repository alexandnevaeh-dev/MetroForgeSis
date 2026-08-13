import { describe, it, expect } from 'vitest';
import {
  conditioningPayload,
  defaultConditioningStrength,
  resolveConditioningStrength,
} from './image-conditioning.js';

describe('image-conditioning', () => {
  it('uses mode-specific default strengths', () => {
    expect(defaultConditioningStrength('ip_adapter')).toBe(0.55);
    expect(defaultConditioningStrength('controlnet_canny')).toBe(0.65);
  });

  it('serializes conditioning for worker payloads', () => {
    const payload = conditioningPayload({
      mode: 'img2img',
      image: Buffer.from('abc'),
      strength: 0.8,
    });
    expect(payload.conditioning_mode).toBe('img2img');
    expect(payload.conditioning_strength).toBe(0.8);
    expect(payload.init_image_base64).toBe(Buffer.from('abc').toString('base64'));
  });

  it('clamps strength to a safe range', () => {
    expect(resolveConditioningStrength({ mode: 'img2img', image: Buffer.alloc(0), strength: 2 })).toBe(
      1,
    );
  });
});
