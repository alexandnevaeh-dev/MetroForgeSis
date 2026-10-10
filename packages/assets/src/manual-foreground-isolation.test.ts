import { describe, expect, it, vi } from 'vitest';
import { isolateManualForeground } from './manual-foreground-isolation.js';
import { encodePng, decodePngRgba } from './png.js';
const plan = { transparent: true, grounded: true };
function image(alpha = false, color = 80, width = 16) {
  const rgba = new Uint8Array(width * 16 * 4);
  for (let i = 0; i < rgba.length; i += 4) rgba.set([color, 82, 86, alpha && i < rgba.length / 2 ? 0 : 255], i);
  return encodePng(width, 16, rgba);
}
describe('manual foreground isolation', () => {
  it('keeps existing matte bytes and does not call the model', async () => {
    const segmentForeground = vi.fn(); const source = image(true);
    const result = await isolateManualForeground(source, plan, { segmentForeground });
    expect(result.buffer.equals(source)).toBe(true);
    expect(result.metadata.matteSource).toBe('existing_alpha');
    expect(segmentForeground).not.toHaveBeenCalled();
  });
  it.each([{ transparent: false, grounded: true }, { transparent: true, grounded: false }])('skips scenery and non-grounded effects', async category => {
    const segmentForeground = vi.fn();
    expect((await isolateManualForeground(image(), category, { segmentForeground })).metadata.matteSource).toBe('skipped_category');
    expect(segmentForeground).not.toHaveBeenCalled();
  });
  it('labels missing capability as fallback without pretending segmentation ran', async () => {
    const result = await isolateManualForeground(image(), plan);
    expect(result.metadata).toEqual({ applied: false, matteSource: 'unavailable_fallback' });
  });
  it('accepts a color-preserving mask and records its origin', async () => {
    const source = image(), masked = image(true);
    const result = await isolateManualForeground(source, plan, { segmentForeground: async () => ({ ok: true, buffer: masked, model: 'u2net' }) });
    expect(result.buffer.equals(masked)).toBe(true);
    expect(result.metadata).toMatchObject({ applied: true, matteSource: 'segmentation_model', model: 'u2net' });
    expect(decodePngRgba(result.buffer).width).toBe(16);
  });
  it.each([
    [{ ok: false, error: 'private runtime detail' }, 'Local foreground isolation failed'],
    [{ ok: true, buffer: image() }, 'no usable matte'],
    [{ ok: true, buffer: image(true, 80, 8) }, 'dimensions'],
    [{ ok: true, buffer: image(true, 120) }, 'colors'],
  ])('refuses failed or altered segmentation outputs', async (result, reason) => {
    await expect(isolateManualForeground(image(), plan, { segmentForeground: async () => result })).rejects.toThrow(reason);
  });
});
