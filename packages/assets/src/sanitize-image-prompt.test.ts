import { describe, it, expect } from 'vitest';
import { sanitizeImagePromptText } from './sanitize-image-prompt.js';

describe('sanitizeImagePromptText', () => {
  it('strips NVIDIA / NVCF / NVAPI brand tokens from game-title-like prompts', () => {
    expect(sanitizeImagePromptText('NVIDIA Image Activation Smoke')).toBe(
      'Image Activation Smoke',
    );
    expect(sanitizeImagePromptText('pixel art for NVIDIA Image Activation Smoke')).toBe(
      'pixel art for Image Activation Smoke',
    );
    expect(sanitizeImagePromptText('NVCF test biome NVAPI walls')).toBe('test biome walls');
  });

  it('is case-insensitive and collapses leftover whitespace / punctuation gaps', () => {
    expect(sanitizeImagePromptText('nViDiA  style,  nvidia  art')).toBe('style, art');
    expect(sanitizeImagePromptText('Dark NVIDIA. Tone')).toBe('Dark. Tone');
  });

  it('leaves unrelated text unchanged', () => {
    expect(sanitizeImagePromptText('dark pixel art player character')).toBe(
      'dark pixel art player character',
    );
  });
});
