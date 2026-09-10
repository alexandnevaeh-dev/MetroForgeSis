import { describe, expect, it } from 'vitest';
import { encodePng, decodePngRgba } from '../src/png.js';
import {
  PixelArtProcessor,
  opaquePixelBounds,
  pickActorSubjectBounds,
  addSilhouetteOutline,
} from '../src/pixel-art-processor.js';

function paintRect(
  rgba: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: [number, number, number],
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }
}

describe('fitOpaque actor compile', () => {
  it('extracts a small standing figure from a scene instead of scaling the architecture', () => {
    const w = 256;
    const h = 256;
    const rgba = new Uint8Array(w * h * 4);
    paintRect(rgba, w, 10, 210, 250, 248, [70, 80, 90]);
    paintRect(rgba, w, 30, 20, 90, 150, [120, 118, 110]);
    paintRect(rgba, w, 168, 160, 188, 208, [40, 70, 180]);
    const source = encodePng(w, h, rgba);
    const picked = pickActorSubjectBounds(decodePngRgba(source).rgba, w, h, 64, 64);
    expect(picked).toBeTruthy();
    expect(picked!.x0).toBeGreaterThan(140);
    expect(picked!.y0).toBeGreaterThan(140);
    expect(picked!.y1 - picked!.y0).toBeLessThan(80);

    const compiled = new PixelArtProcessor().process(source, {
      targetWidth: 64,
      targetHeight: 64,
      skipQuantize: true,
      fitOpaque: true,
    });
    const out = decodePngRgba(compiled.buffer);
    const bbox = opaquePixelBounds(out.rgba, out.width, out.height)!;
    expect(bbox.y1 - bbox.y0 + 1).toBeGreaterThanOrEqual(48);
    expect(bbox.y1).toBeGreaterThanOrEqual(60);
    expect(bbox.x1 - bbox.x0 + 1).toBeLessThan(50);
  });

  it('pulls a standing figure off a wide ground mass', () => {
    const w = 256;
    const h = 256;
    const rgba = new Uint8Array(w * h * 4);
    paintRect(rgba, w, 8, 188, 248, 230, [60, 70, 50]);
    paintRect(rgba, w, 176, 132, 196, 190, [40, 70, 180]);
    const source = encodePng(w, h, rgba);
    const picked = pickActorSubjectBounds(decodePngRgba(source).rgba, w, h, 64, 64);
    expect(picked).toBeTruthy();
    expect(picked!.x0).toBeGreaterThan(140);
    expect(picked!.x1).toBeLessThan(230);
    expect(picked!.y1 - picked!.y0).toBeLessThan(90);
    expect(picked!.y1 - picked!.y0).toBeGreaterThan(40);
  });

  it('picks a frame-filling, correctly-isolated subject instead of a smaller background remnant (regression for the eighth-session defect)', () => {
    // Mirrors the real defect found generating a v2-profile player sprite: once a source is
    // actually segmented (real transparent background, not a fully-opaque diffusion source), the
    // real subject commonly fills most of the frame's height -- outside the old scoring's
    // "small distant figure" window (0.07-0.22 of height), which classified it as "scenery" and
    // let a smaller, incidental blob win by default. See docs/audit's eighth session.
    const w = 384;
    const h = 384;
    const rgba = new Uint8Array(w * h * 4);
    // The real subject: tall, frame-filling (bh/h = 250/384 = 0.65, matching the real case),
    // occupying a minority of the frame's width.
    paintRect(rgba, w, 270, 130, 360, 380, [30, 30, 40]);
    // A smaller, separate remnant blob elsewhere -- must NOT be picked.
    paintRect(rgba, w, 120, 170, 170, 370, [80, 80, 90]);
    const source = encodePng(w, h, rgba);
    const picked = pickActorSubjectBounds(decodePngRgba(source).rgba, w, h, 64, 64);
    expect(picked).toBeTruthy();
    expect(picked!.x0).toBeGreaterThanOrEqual(260);
    expect(picked!.x1).toBeLessThanOrEqual(370);
    expect(picked!.y1 - picked!.y0).toBeGreaterThan(200);
  });

  it('still picks the small distant figure off a wide ground mass, not the fused blob as a whole (no regression from the fast path above)', () => {
    const w = 256;
    const h = 256;
    const rgba = new Uint8Array(w * h * 4);
    paintRect(rgba, w, 8, 188, 248, 230, [60, 70, 50]);
    paintRect(rgba, w, 176, 132, 196, 190, [40, 70, 180]);
    const source = encodePng(w, h, rgba);
    const picked = pickActorSubjectBounds(decodePngRgba(source).rgba, w, h, 64, 64);
    expect(picked).toBeTruthy();
    // The ground+figure are alpha-connected into one fused blob (touching, both opaque) -- the
    // dominant-component fast path must not mistake that fusion for "already isolated" and must
    // fall through to the existing small-figure-on-terrain scoring, unchanged.
    expect(picked!.x1 - picked!.x0 + 1).toBeLessThan(100);
  });

  it('addSilhouetteOutline stamps color only onto transparent pixels touching the opaque silhouette, never interior pixels (ninth-session player-visibility fix)', () => {
    const w = 6, h = 6;
    const rgba = new Uint8Array(w * h * 4);
    // A 2x2 opaque square in the middle, colored [20,24,32] (this project's real bit-for-bit
    // collision with Godot's default_clear_color -- see the ninth session).
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]]) {
      const i = (y * w + x) * 4;
      rgba[i] = 20; rgba[i + 1] = 24; rgba[i + 2] = 32; rgba[i + 3] = 255;
    }
    const outlined = addSilhouetteOutline(rgba, w, h, [90, 140, 220]);

    // Interior pixels unchanged.
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]]) {
      const i = (y * w + x) * 4;
      expect([outlined[i], outlined[i + 1], outlined[i + 2]]).toEqual([20, 24, 32]);
    }
    // The 4-adjacent ring is now opaque with the outline color.
    for (const [x, y] of [[1, 2], [4, 2], [2, 1], [2, 4]]) {
      const i = (y * w + x) * 4;
      expect([outlined[i], outlined[i + 1], outlined[i + 2], outlined[i + 3]]).toEqual([90, 140, 220, 255]);
    }
    // A pixel not touching the silhouette at all stays fully transparent.
    const farIdx = (0 * w + 0) * 4;
    expect(outlined[farIdx + 3]).toBe(0);
  });

  it('leaves tileset compiles uncropped when fitOpaque is off', () => {
    const rgba = new Uint8Array(32 * 32 * 4);
    paintRect(rgba, 32, 0, 0, 31, 31, [80, 90, 100]);
    const source = encodePng(32, 32, rgba);
    const compiled = new PixelArtProcessor().process(source, {
      targetWidth: 32,
      targetHeight: 32,
      skipQuantize: true,
    });
    const out = decodePngRgba(compiled.buffer);
    expect(opaquePixelBounds(out.rgba, 32, 32)).toEqual({ x0: 0, y0: 0, x1: 31, y1: 31 });
  });
});
