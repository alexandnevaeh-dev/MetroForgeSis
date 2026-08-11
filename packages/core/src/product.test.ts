import { describe, it, expect } from 'vitest';
import { getProductInfo, getVersionString } from '../src/product.js';

describe('product', () => {
  it('returns product info with configurable name', () => {
    const info = getProductInfo();
    expect(info.id).toBe('metroforge-ai');
    expect(info.version).toBe('0.1.0');
  });

  it('formats version string', () => {
    expect(getVersionString()).toContain('MetroForge AI');
    expect(getVersionString()).toContain('0.1.0');
  });
});
