/** Validated Unity terrain presentation values shared by future editor controls. */
export interface TerrainPresentation {
  x: number; y: number; width: number; height: number;
  pixelsPerUnit: number;
  borderLeft: number; borderRight: number; borderTop: number; borderBottom: number;
  smoothFiltering: boolean;
  tintR: number; tintG: number; tintB: number;
}
export function parseTerrainPresentation(value: unknown, image: { width: number; height: number }): TerrainPresentation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Terrain settings must be an object');
  if (![image.width, image.height].every(n => Number.isInteger(n) && n > 0)) throw new Error('Invalid terrain image dimensions');
  const raw = value as Record<string, unknown>;
  const defaults: TerrainPresentation = { x: 0, y: 0, width: 0, height: 0, pixelsPerUnit: 1, borderLeft: 0, borderRight: 0, borderTop: 0, borderBottom: 0, smoothFiltering: true, tintR: 1, tintG: 1, tintB: 1 };
  for (const key of Object.keys(raw)) if (!Object.prototype.hasOwnProperty.call(defaults, key)) throw new Error(`Unknown terrain setting: ${key}`);
  const result = { ...defaults, ...raw } as TerrainPresentation;
  for (const [key, n] of Object.entries(result)) {
    if (key === 'smoothFiltering') { if (typeof n !== 'boolean') throw new Error('Terrain filtering must be a boolean'); }
    else if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`Terrain ${key} must be finite`);
  }
  if (result.x < 0 || result.y < 0 || result.width <= 0 || result.height <= 0 || result.pixelsPerUnit <= 0
    || result.x + result.width > image.width || result.y + result.height > image.height) throw new Error('Terrain crop or scale is out of bounds');
  if ([result.borderLeft, result.borderRight, result.borderTop, result.borderBottom].some(n => n < 0)
    || result.borderLeft + result.borderRight >= result.width || result.borderTop + result.borderBottom >= result.height) throw new Error('Terrain borders exceed the crop');
  if ([result.tintR, result.tintG, result.tintB].some(n => n < 0 || n > 1)) throw new Error('Terrain tint must be between zero and one');
  return result;
}
