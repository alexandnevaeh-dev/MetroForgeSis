export type CastleFurnishing = {
  id: string;
  sectionId: string;
  chamberName: string;
  role: string;
  asset: string;
  x: number;
  floorY: number;
  targetHeight: number;
  mounting: 'floor' | 'rear-wall';
};

/** Match native grounding: largest eight-connected silhouette at alpha >= 31.
 * Disconnected scraps must not raise the main object's feet above its floor. */
export function furnishingSilhouette(pixels: Uint8ClampedArray, width: number, height: number) {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let largest = 0, left = width, right = -1, bottom = -1;
  for (let seed = 0; seed < visited.length; seed++) {
    if (visited[seed] || pixels[seed * 4 + 3]! < 31) continue;
    visited[seed] = 1;
    queue[0] = seed;
    let tail = 1, partLeft = width, partRight = -1, partBottom = -1;
    for (let head = 0; head < tail; head++) {
      const pixel = queue[head]!, x = pixel % width, y = Math.floor(pixel / width);
      partLeft = Math.min(partLeft, x);
      partRight = Math.max(partRight, x);
      partBottom = Math.max(partBottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const neighbor = yy * width + xx;
        if (!visited[neighbor] && pixels[neighbor * 4 + 3]! >= 31) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    if (tail > largest) {
      largest = tail; left = partLeft; right = partRight; bottom = partBottom;
    }
  }
  return { bottomInset: bottom >= 0 ? height - 1 - bottom : 0, halfWidth: right >= left ? (right - left + 1) / 2 : width / 2 };
}

export function validFurnishingAsset(item: CastleFurnishing): boolean {
  const prefix = 'assets/architecture/stormglass/';
  const roles = ['intact_statue', 'intact_sconce', 'intact_banner', 'archive_bookcase', 'archive_books', 'frozen_gears', 'frozen_bell', 'intact_altar', 'lancet_window'];
  return !!item && typeof item.id === 'string' && item.id.startsWith('RegionFurnishing_') &&
    typeof item.sectionId === 'string' && typeof item.chamberName === 'string' && roles.includes(item.role) &&
    item.asset === `${prefix}${item.role === 'lancet_window' ? '' : 'conditions/'}${item.role}.png` &&
    [item.x, item.floorY, item.targetHeight].every(Number.isFinite) &&
    item.targetHeight >= 32 && item.targetHeight <= 384 && ['floor', 'rear-wall'].includes(item.mounting);
}
