import type { PlatformRect } from './tile-layout.js';
const FURNISHING_ROLES: Record<string, string[]> = {
  'Gate Vestibule': ['intact_statue', 'intact_sconce'],
  'Watch Hall': ['intact_banner', 'intact_statue'],
  'Scribe Reading Room': ['archive_bookcase', 'archive_books'],
  'Sentinel Armory': ['intact_banner', 'intact_statue'],
  'Lens Workshop': ['frozen_gears', 'archive_books'],
  'Moon Study': ['archive_bookcase', 'lancet_window'],
  'Bell Keeper Chamber': ['frozen_bell', 'frozen_gears'],
  'Choir Recess': ['intact_altar', 'intact_banner'],
  'Star Chart Cabinet': ['archive_bookcase', 'lancet_window'],
  'Lantern Rest Chamber': ['intact_sconce', 'intact_altar'],
};
/** Original Stormglass geometry. Camera estimates use the planning viewport; native tests measure the live camera separately. */
export function buildCastleRegionPlan({ viewportWidth = 1920, viewportHeight = 1080, zoom = 1.85 } = {}) {
  if (![viewportWidth, viewportHeight, zoom].every(v => Number.isFinite(v) && v > 0)) throw new Error('Invalid gameplay camera');
  const width = 16384, height = 6144, tileSize = 32;
  const floors = Array.from({length: 5}, (_, i) => height - 64 - i * 1152);
  const platforms: PlatformRect[] = [], partitions: PlatformRect[] = [];
  const sections: Array<{id: string; name: string; storey: string; x: number; width: number; floorY: number; ceilingY: number; purpose: string; furnishingIntent: string; rewardIntent: string | null; combatIntent: string}> = [];
  const routes: Array<{id: string; from: number; to: number; shaft: string; direction: number; ascent: Array<{x: number; y: number; launchX: number}>}> = [];
  const names = [
    ['Gate Vestibule', 'Reliquary Processional Hall', 'Watch Hall'],
    ['Scribe Reading Room', 'Archive Crosswalk', 'Sentinel Armory'],
    ['Lens Workshop', 'Observatory Approach', 'Moon Study'],
    ['Bell Keeper Chamber', 'Chapel Processional Hall', 'Choir Recess'],
    ['Star Chart Cabinet', 'Crown Gallery', 'Lantern Rest Chamber'],
  ];
  for (let level = 0; level < floors.length; level++) {
    const floorY = floors[level];
    if (level > 0) {
      // Leave the incoming shaft open; bridge the opposite shaft so the next
      // stair starts from this storey rather than dropping back to the ground.
      const x = level % 2 === 1 ? 2560 : 192;
      const end = level % 2 === 1 ? width - 192 : width - 2560;
      platforms.push({ x, y: floorY, width: end - x, height: 32 });
    }
    const spans = level === 0 ? [[256, 2304], [2560, width - 5120], [width - 2560, 2496]] : [[2560, 1536], [4096, width - 8192], [width - 4096, 1536]];
    spans.forEach(([x, w], index) => {
      const ceilingY = floorY - 768;
      // The long hall ceiling and chamber headers share real collision and one grid.
      if (level > 0 || index === 1) platforms.push({x, y: ceilingY, width: w, height: 32});
      if (level > 0 && index !== 1) {
        for (const wallX of [x, x + w - 32]) partitions.push({x: wallX, y: ceilingY, width: 32, height: 576});
      }
      sections.push({id: `level-${level}-space-${index}`, name: names[level][index], storey: level === 0 ? 'lower' : `storey-${level}`, x, width: w, floorY, ceilingY,
        purpose: index === 1 ? 'Clear encounter and cross-route; no furniture in the combat lane' : index === 0 ? 'Optional exploration destination and visible return landmark' : 'Sheltered side chamber and return-route landmark',
        furnishingIntent: index === 1 ? 'Anchored wall lights and recessed piers' : level === 1 ? 'Supported shelves and reading desks' : level === 2 ? 'Lens benches and star charts' : level === 3 ? 'Bell rigging and choir stalls' : 'Wall cabinet and rest bench',
        rewardIntent: index === 1 ? null : 'Optional reward; not instantiated in this geometry candidate', combatIntent: index === 1 ? 'Existing encounter only on the entry floor; later encounters pending' : 'Keep doorway and return passage clear'});
    });
    if (level < floors.length - 1) {
      const sign = level % 2 === 0 ? 1 : -1;
      const ascent = [];
      for (let step = 0; step < 12; step++) {
        const x = sign > 0 ? 256 + step * 192 : width - 416 - step * 192;
        const y = floorY - (step + 1) * 96;
        platforms.push({x, y, width: 160, height: 32});
        ascent.push({x: x + 80, y, launchX: x + 80 - sign * 132});
      }
      routes.push({id: `ascent-${level}`, from: level, to: level + 1, shaft: sign > 0 ? 'west' : 'east', direction: sign, ascent});
    }
  }
  // A narrow central service well makes each upper hall a junction. The base
  // floor stays continuous; upper floor and ceiling courses share the opening.
  // Its 128px gap is deliberately tested with the unupgraded player controller.
  const shaftX = width / 2, shaftWidth = 128;
  const shaftLeft = shaftX - shaftWidth / 2, shaftRight = shaftX + shaftWidth / 2;
  const connectedPlatforms = platforms.flatMap(rect => {
    if (rect.x >= shaftRight || rect.x + rect.width <= shaftLeft) return [rect];
    return [
      {...rect, width: shaftLeft - rect.x},
      {...rect, x: shaftRight, width: rect.x + rect.width - shaftRight},
    ].filter(part => part.width > 0);
  });
  const furnishings = sections.flatMap(section => (FURNISHING_ROLES[section.name] ?? []).map((role, index) => ({
    id: `RegionFurnishing_${section.id}_${index}`, sectionId: section.id, chamberName: section.name,
    asset: `assets/architecture/stormglass/${role === 'lancet_window' ? '' : 'conditions/'}${role}.png`,
    role, x: section.x + section.width * (index === 0 ? 0.35 : 0.65), floorY: section.floorY,
    targetHeight: index === 0 || role === 'lancet_window' ? 224 : 128,
    mounting: ['intact_banner', 'intact_sconce', 'lancet_window'].includes(role) ? 'rear-wall' as const : 'floor' as const,
  })));
  // Visual façade modules occupy the chamber walls, independently of the solid shell.
  // 256px blocks stay on the 32px grid and can be replaced without moving collision.
  const facadeModules = sections.flatMap(section => {
    const modules: Array<{id: string; sectionId: string; x: number; y: number; width: number; height: number; collision: false}> = [];
    const top = section.ceilingY + tileSize;
    for (let y = top; y < section.floorY; y += 256)
      for (let x = section.x; x < section.x + section.width; x += 256)
        modules.push({id: `Facade_${section.id}_${x}_${y}`, sectionId: section.id, x, y,
          width: Math.min(256, section.x + section.width - x), height: Math.min(256, section.floorY - y), collision: false});
    return modules;
  });
  return {version: 1, id: 'stormglass-gallery-central-return-candidate', width, height, tileSize, floors, platforms: connectedPlatforms, partitions, sections, routes, furnishings, facadeModules,
    camera: {viewportWidth, viewportHeight, zoom, worldWidth: viewportWidth / zoom, worldHeight: viewportHeight / zoom, regionWidths: width * zoom / viewportWidth, regionHeights: height * zoom / viewportHeight},
    returnRoute: {shaftX, shaftWidth, floorY: floors[0], targetX: 336, purpose: 'Central service descent connects every upper hall directly to the entry floor; the west service descent remains available'},
    doorsPreserved: true, maximumStairRise: 96, productionReady: false};
}


export type CastleRegionPlan = ReturnType<typeof buildCastleRegionPlan>;

/** The tested plan is opt-in by exact bounds; other sizes keep their existing grammar. */
export function supportsCastleRegionPlan(width: number, height: number, tileSize: number): boolean {
  return width === 16384 && height === 6144 && tileSize === 32;
}
