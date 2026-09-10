import { decodePngRgba, encodePng } from './png.js';

export interface PixelArtOptions {
  targetWidth: number;
  targetHeight: number;
  tileSize?: number;
  palette?: [number, number, number][];
  alphaThreshold?: number;
  /** Keep source colors. Background plates must not be crushed to the sprite 8-color set. */
  skipQuantize?: boolean;
  /**
   * Skip the alpha-cleanup binarization pass (every pixel forced to fully opaque or fully
   * transparent at `alphaThreshold`). Needed for sheets that deliberately encode a fade via
   * alpha — e.g. generateDeathSheet's sink-and-fade frames — where binarizing would either
   * wipe a semi-transparent frame to fully blank (alpha < threshold) or erase the fade entirely
   * (alpha >= threshold, forced to 255). Character/tileset sprites should still binarize to
   * avoid antialiasing halos; only skip this for sheets with an intentional alpha gradient.
   */
  preserveAlphaGradient?: boolean;
  /**
   * Crop the opaque subject (character island, not a full FLUX scene) and scale it uniformly
   * into ~86% of the target frame, bottom-centered. Characters only — never tilesets or plates.
   */
  fitOpaque?: boolean;
  /**
   * Adds a 1px silhouette outline in this exact RGB color around the final, already-binarized
   * subject — every previously-transparent pixel 4-adjacent to an opaque one becomes this color
   * at full opacity. Interior pixels are never touched, so character detail/palette is otherwise
   * unchanged. Explicit, category-aware, opt-in (undefined = no outline, today's exact behavior)
   * — see planner.ts's `characterPlan()` for why the player specifically needs this: its
   * quantized silhouette can include DEFAULT_PALETTE[0] (`[20, 24, 32]`), which is bit-for-bit
   * identical to this project's Godot `default_clear_color`, making that part of the character
   * invisible against empty background. Not a general "always outline characters" default —
   * every other caller/category that doesn't set this is unaffected.
   */
  outlineColor?: [number, number, number];
}

export interface PixelArtResult {
  buffer: Buffer;
  width: number;
  height: number;
  palette: [number, number, number][];
  fallbackProcessed: boolean;
}

const DEFAULT_PALETTE: [number, number, number][] = [
  [20, 24, 32],
  [60, 64, 78],
  [90, 140, 220],
  [200, 80, 80],
  [80, 200, 120],
  [200, 180, 60],
  [180, 100, 200],
  [240, 240, 250],
];

/** DEFAULT_PALETTE's existing cyan/blue accent — already present in quantized character output
 *  (it's palette index 2), and matches this project's own established semantic color convention
 *  ("cyan for player and interaction" — see the locked STYLE text in
 *  modern-cohesion.evidence.test.ts). Exported so planner.ts's `characterPlan()` can reuse this
 *  exact value for the player outline fix without duplicating the constant. */
export const SILHOUETTE_ACCENT_CYAN: [number, number, number] = [90, 140, 220];

/** Deterministic pixel-art post-processing pipeline */
export class PixelArtProcessor {
  process(sourcePng: Buffer, options: PixelArtOptions): PixelArtResult {
    const { rgba, width, height } = decodePngRgba(sourcePng);
    const palette = options.palette ?? DEFAULT_PALETTE;

    const scaled = options.fitOpaque
      ? {
          rgba: fitOpaqueIntoFrame(rgba, width, height, options.targetWidth, options.targetHeight),
          width: options.targetWidth,
          height: options.targetHeight,
        }
      : nearestNeighborScale(rgba, width, height, options.targetWidth, options.targetHeight);

    const quantized = options.skipQuantize
      ? scaled.rgba
      : quantizeToPalette(scaled.rgba, scaled.width, scaled.height, palette);
    const cleaned = options.preserveAlphaGradient
      ? quantized
      : cleanupAlpha(quantized, scaled.width, scaled.height, options.alphaThreshold ?? 128);
    const outlined = options.outlineColor
      ? addSilhouetteOutline(cleaned, scaled.width, scaled.height, options.outlineColor)
      : cleaned;

    return {
      buffer: encodePng(scaled.width, scaled.height, outlined),
      width: scaled.width,
      height: scaled.height,
      palette,
      fallbackProcessed: true,
    };
  }

  /** Slice tileset source into individual tile PNGs */
  sliceTiles(sourcePng: Buffer, tileSize: number): Map<string, Buffer> {
    const { rgba, width, height } = decodePngRgba(sourcePng);
    const tiles = new Map<string, Buffer>();

    const cols = Math.floor(width / tileSize);
    const rows = Math.floor(height / tileSize);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileRgba = new Uint8Array(tileSize * tileSize * 4);
        for (let y = 0; y < tileSize; y++) {
          for (let x = 0; x < tileSize; x++) {
            const sx = col * tileSize + x;
            const sy = row * tileSize + y;
            const si = (sy * width + sx) * 4;
            const di = (y * tileSize + x) * 4;
            tileRgba[di] = rgba[si]!;
            tileRgba[di + 1] = rgba[si + 1]!;
            tileRgba[di + 2] = rgba[si + 2]!;
            tileRgba[di + 3] = rgba[si + 3]!;
          }
        }
        tiles.set(`tile_${col}_${row}`, encodePng(tileSize, tileSize, tileRgba));
      }
    }

    return tiles;
  }
}

export interface OpaqueBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Inclusive opaque bounding box, or null when the raster is fully transparent. */
export function opaquePixelBounds(
  rgba: Uint8Array,
  width: number,
  height: number,
  alphaMin = 16,
): OpaqueBounds | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3]! <= alphaMin) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0) return null;
  return { x0, y0, x1, y1 };
}

interface ComponentBounds extends OpaqueBounds {
  area: number;
}

function connectedComponents(
  rgba: Uint8Array,
  width: number,
  height: number,
  alphaMin = 16,
): ComponentBounds[] {
  const seen = new Uint8Array(width * height);
  const out: ComponentBounds[] = [];
  for (let i = 0; i < width * height; i++) {
    if (seen[i] || rgba[i * 4 + 3]! <= alphaMin) continue;
    const stack = [i];
    seen[i] = 1;
    let area = 0;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    while (stack.length) {
      const idx = stack.pop()!;
      area++;
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      const neighbors = [idx + 1, idx - 1, idx + width, idx - width];
      for (const n of neighbors) {
        if (n < 0 || n >= width * height) continue;
        if (n === idx + 1 && x === width - 1) continue;
        if (n === idx - 1 && x === 0) continue;
        if (seen[n] || rgba[n * 4 + 3]! <= alphaMin) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    out.push({ x0, y0, x1, y1, area });
  }
  return out;
}

function padBounds(b: OpaqueBounds, width: number, height: number, pad: number): OpaqueBounds {
  return {
    x0: Math.max(0, b.x0 - pad),
    y0: Math.max(0, b.y0 - pad),
    x1: Math.min(width - 1, b.x1 + pad),
    y1: Math.min(height - 1, b.y1 + pad),
  };
}

export function pickActorSubjectBounds(
  rgba: Uint8Array,
  width: number,
  height: number,
  dstW: number,
  dstH: number,
): OpaqueBounds | null {
  const full = opaquePixelBounds(rgba, width, height);
  if (!full) return null;
  if (Math.min(width, height) < Math.max(dstW, dstH) * 2.5) return full;

  const imgArea = width * height;
  const comps = connectedComponents(rgba, width, height);

  // A real segmentation matte (vs. this function's original "small figure in a wide FLUX still"
  // assumption) usually leaves one component that dominates the opaque pixel count outright. The
  // heuristics below were tuned for a distant, small subject and wrongly reject an ordinarily-
  // proportioned, frame-filling character/prop as "scenery" once real alpha correctly isolates it
  // -- verified directly: a real isolated player source scored the actual character 0 (excluded
  // as scenery) while a faint background remnant scored nonzero and won by default. When one
  // component clearly IS the subject, trust it directly instead of running that scoring.
  //
  // Guards, in order: the upper area bound excludes "no real isolation happened, the whole canvas
  // is one opaque blob" (handled by the existing `return full` fallback below); the width/height
  // bounds exclude a figure whose opaque pixels are still fused with a wide/tall background mass
  // (alpha-based connected components don't see color, so a standing figure painted touching a
  // ground band merges into ONE blob that dominates by area without being isolated at all --
  // confirmed by this file's own "pulls a standing figure off a wide ground mass" fixture, which
  // regressed against an earlier, unguarded version of this fast path). A genuinely isolated
  // subject occupies a minority of the frame in at least one dimension; this fast path only ever
  // helps, never actively cropping wrong, since anything it rejects still falls through to the
  // scoring heuristic below exactly as before this fast path existed.
  const totalOpaqueArea = comps.reduce((sum, c) => sum + c.area, 0);
  if (totalOpaqueArea > 0) {
    const dominant = comps.reduce((best, c) => (c.area > best.area ? c : best), comps[0]!);
    const dbw = dominant.x1 - dominant.x0 + 1;
    const dbh = dominant.y1 - dominant.y0 + 1;
    const plausibleSubjectSize = dbw < width * 0.6 && dbh < height * 0.85;
    if (dominant.area / totalOpaqueArea >= 0.6 && dominant.area < imgArea * 0.94 && plausibleSubjectSize) {
      const pad = Math.max(3, Math.round(Math.max(dbw, dbh) * 0.04));
      return padBounds(dominant, width, height, pad);
    }
  }

  const candidates: Array<ComponentBounds & { score: number }> = [];
  for (const c of comps) {
    const bw = c.x1 - c.x0 + 1;
    const bh = c.y1 - c.y0 + 1;
    const wide = bw > width * 0.45 || bw / Math.max(bh, 1) > 1.35;
    if (wide) {
      const rise = figureOnTerrain(rgba, width, height, c);
      if (rise) {
        const rbw = rise.x1 - rise.x0 + 1;
        const rbh = rise.y1 - rise.y0 + 1;
        const aspect = rbw / Math.max(rbh, 1);
        const human = aspect >= 0.28 && aspect <= 0.85 ? 1.15 : aspect <= 1.2 ? 0.55 : 0.2;
        const cy = (rise.y0 + rise.y1) * 0.5 / height;
        const hFrac = rbh / height;
        const size = hFrac >= 0.05 && hFrac <= 0.22 ? 1 : 0.4;
        candidates.push({
          ...rise,
          area: rbw * rbh,
          score: 1.4 * human * (0.5 + cy) * size,
        });
      }
    }
    if (c.area < Math.max(32, imgArea * 0.0015)) continue;
    const scenery = bh > height * 0.32 && bw > width * 0.18;
    const huge = bw * bh > imgArea * 0.16;
    if (wide || scenery || huge) continue;
    const aspect = bw / Math.max(bh, 1);
    const human = aspect >= 0.35 && aspect <= 0.85 ? 1 : aspect > 0.85 && aspect <= 1.25 ? 0.55 : 0.25;
    const fill = c.area / Math.max(bw * bh, 1);
    const cy = (c.y0 + c.y1) * 0.5 / height;
    const hFrac = bh / height;
    const size =
      hFrac >= 0.07 && hFrac <= 0.22 ? 1 : hFrac < 0.05 || hFrac > 0.32 ? 0.15 : 0.55;
    candidates.push({
      ...c,
      score: human * (0.25 + fill) * (0.35 + cy) * size,
    });
  }
  if (candidates.length === 0) return full;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  const pad = Math.max(3, Math.round(Math.max(best.x1 - best.x0 + 1, best.y1 - best.y0 + 1) * 0.1));
  return padBounds(best, width, height, pad);
}

/** Standing figure sitting on a wide terrain mass (FLUX scene stills). */
function figureOnTerrain(
  rgba: Uint8Array,
  width: number,
  height: number,
  terrain: ComponentBounds,
): ComponentBounds | null {
  const span = terrain.x1 - terrain.x0 + 1;
  if (span < 40) return null;
  const tops = new Int32Array(span);
  tops.fill(-1);
  for (let x = terrain.x0; x <= terrain.x1; x++) {
    for (let y = terrain.y0; y <= terrain.y1; y++) {
      if (rgba[(y * width + x) * 4 + 3]! > 16) {
        tops[x - terrain.x0] = y;
        break;
      }
    }
  }
  const samples: number[] = [];
  for (const y of tops) {
    if (y >= 0) samples.push(y);
  }
  if (samples.length < 12) return null;
  samples.sort((a, b) => a - b);
  const groundY = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.72))]!;
  const isRise = (y: number) => y >= 0 && groundY - y >= 20;
  type Run = { x0: number; x1: number; y0: number };
  const runs: Run[] = [];
  let run: Run | null = null;
  for (let i = 0; i < span; i++) {
    const y = tops[i]!;
    if (isRise(y)) {
      if (run) {
        run.x1 = terrain.x0 + i;
        if (y < run.y0) run.y0 = y;
      } else {
        run = { x0: terrain.x0 + i, x1: terrain.x0 + i, y0: y };
      }
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);

  let best: ComponentBounds | null = null;
  let bestScore = -1;
  for (const r of runs) {
    const bw = r.x1 - r.x0 + 1;
    const y1 = Math.min(terrain.y1, groundY + 4);
    const bh = y1 - r.y0 + 1;
    if (bw < 8 || bw > Math.max(72, Math.floor(width * 0.09))) continue;
    if (bh < 24 || bh > Math.max(140, Math.floor(height * 0.16))) continue;
    const aspect = bw / bh;
    if (aspect < 0.22 || aspect > 1.05) continue;
    const human = aspect >= 0.3 && aspect <= 0.8 ? 1 : 0.45;
    const hFrac = bh / height;
    const size = hFrac >= 0.05 && hFrac <= 0.16 ? 1 : 0.4;
    const score = human * size * (0.4 + r.x0 / width);
    if (score > bestScore) {
      bestScore = score;
      best = { x0: r.x0, y0: r.y0, x1: r.x1, y1, area: bw * bh };
    }
  }
  return best;
}

/** Uniform nearest-neighbor fit of the actor subject into a transparent target frame. */
export function fitOpaqueIntoFrame(
  rgba: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  occupy = 0.86,
): Uint8Array {
  const out = new Uint8Array(dstW * dstH * 4);
  const subject = pickActorSubjectBounds(rgba, srcW, srcH, dstW, dstH);
  if (!subject) return out;
  const bw = subject.x1 - subject.x0 + 1;
  const bh = subject.y1 - subject.y0 + 1;
  const scale = Math.min((dstW * 0.92) / bw, (dstH * occupy) / bh);
  const outW = Math.max(1, Math.round(bw * scale));
  const outH = Math.max(1, Math.round(bh * scale));
  const ox = Math.floor((dstW - outW) / 2);
  const oy = Math.max(0, dstH - outH);
  const cropped = new Uint8Array(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const si = ((subject.y0 + y) * srcW + (subject.x0 + x)) * 4;
      const di = (y * bw + x) * 4;
      cropped[di] = rgba[si]!;
      cropped[di + 1] = rgba[si + 1]!;
      cropped[di + 2] = rgba[si + 2]!;
      cropped[di + 3] = rgba[si + 3]!;
    }
  }
  const scaled = nearestNeighborScale(cropped, bw, bh, outW, outH);
  for (let y = 0; y < outH; y++) {
    const dy = oy + y;
    if (dy < 0 || dy >= dstH) continue;
    for (let x = 0; x < outW; x++) {
      const dx = ox + x;
      if (dx < 0 || dx >= dstW) continue;
      const si = (y * outW + x) * 4;
      const di = (dy * dstW + dx) * 4;
      out[di] = scaled.rgba[si]!;
      out[di + 1] = scaled.rgba[si + 1]!;
      out[di + 2] = scaled.rgba[si + 2]!;
      out[di + 3] = scaled.rgba[si + 3]!;
    }
  }
  return out;
}

function nearestNeighborScale(
  rgba: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { rgba: Uint8Array; width: number; height: number } {
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.floor((x / dstW) * srcW);
      const sy = Math.floor((y / dstH) * srcH);
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di] = rgba[si]!;
      out[di + 1] = rgba[si + 1]!;
      out[di + 2] = rgba[si + 2]!;
      out[di + 3] = rgba[si + 3]!;
    }
  }
  return { rgba: out, width: dstW, height: dstH };
}

function quantizeToPalette(
  rgba: Uint8Array,
  _width: number,
  _height: number,
  palette: [number, number, number][],
): Uint8Array {
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! < 32) {
      out[i + 3] = 0;
      continue;
    }
    const nearest = nearestPaletteColor(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, palette);
    out[i] = nearest[0];
    out[i + 1] = nearest[1];
    out[i + 2] = nearest[2];
    out[i + 3] = rgba[i + 3]!;
  }
  return out;
}

function nearestPaletteColor(r: number, g: number, b: number, palette: [number, number, number][]): [number, number, number] {
  let best = palette[0]!;
  let bestDist = Infinity;
  for (const c of palette) {
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function cleanupAlpha(rgba: Uint8Array, _w: number, _h: number, threshold: number): Uint8Array {
  const out = new Uint8Array(rgba);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3]! < threshold) {
      out[i + 3] = 0;
    } else {
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Stamps `color` at full opacity onto every transparent pixel 4-adjacent to an opaque one —
 *  a 1px silhouette outline. Runs on the already-binarized alpha (0 or 255 only), after
 *  quantization/cleanup, so it never recolors an existing interior pixel and is unaffected by
 *  palette choice. A pixel already at the canvas edge has fewer neighbors to test but is still
 *  outlined correctly on its interior-facing sides. */
export function addSilhouetteOutline(
  rgba: Uint8Array,
  width: number,
  height: number,
  color: [number, number, number],
): Uint8Array {
  const out = new Uint8Array(rgba);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3]! !== 0) continue; // only fill transparent pixels
      const neighbors: Array<[number, number]> = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      const touchesOpaque = neighbors.some(([nx, ny]) => {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) return false;
        return rgba[(ny * width + nx) * 4 + 3]! !== 0;
      });
      if (touchesOpaque) {
        out[i] = color[0]; out[i + 1] = color[1]; out[i + 2] = color[2]; out[i + 3] = 255;
      }
    }
  }
  return out;
}

