import type { TopDownOverworld } from '@metroforge/procedural';

/** Expose actual runtime areas; do not manufacture side-view tiles or entity placements. */
export function topDownRoomRecords(world: TopDownOverworld) {
  if (!Array.isArray(world.areas)) throw new Error('Top-down world has no area list');
  const ids = new Set<string>();
  return world.areas.map((area, index) => {
    if (!area || typeof area.id !== 'string' || !area.id || ids.has(area.id)) throw new Error('Invalid or duplicate top-down area ID');
    ids.add(area.id);
    if (![area.widthTiles, area.heightTiles, area.tileSize].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error(`Invalid area dimensions: ${area.id}`);
    const width = area.widthTiles * area.tileSize;
    const height = area.heightTiles * area.tileSize;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) throw new Error(`Area dimensions exceed supported range: ${area.id}`);
    return {
      ...structuredClone(area),
      index,
      width,
      height,
      archetype: area.kind,
      worldArchetype: 'TOP_DOWN_ACTION_ADVENTURE' as const,
      editingMode: 'topdown' as const,
    };
  });
}
