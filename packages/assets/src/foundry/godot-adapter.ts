import type { AssetRequest } from '@metroforge/schemas';

/** Canonical foundry asset → Godot 4 destination. Unity/Unreal adapters can be added later. */
export function godotDestinationFor(request: AssetRequest): string {
  const file = `${request.id}.png`;
  switch (request.assetType) {
    case 'player':
      return `assets/characters/${file}`;
    case 'npc':
      return `assets/npcs/${file}`;
    case 'enemy':
      return `assets/enemies/${file}`;
    case 'boss':
      return `assets/bosses/${file}`;
    case 'tileset':
    case 'terrain':
    case 'platform':
      return `assets/tilesets/${file}`;
    case 'background':
    case 'parallax':
      return `assets/backgrounds/${file}`;
    case 'prop':
    case 'door':
    case 'portal':
      return `assets/props/${file}`;
    case 'weapon':
    case 'armor':
      return `assets/weapons/${file}`;
    case 'item':
    case 'pickup':
      return `assets/items/${file}`;
    case 'ui':
    case 'hud':
      return `assets/ui/${file}`;
    case 'icon':
      return `assets/ui/icons/${file}`;
    case 'portrait':
      return `assets/ui/portraits/${file}`;
    case 'vfx':
      return `assets/vfx/${file}`;
    case 'animation':
      return `assets/characters/${file}`;
    default:
      return `assets/${request.assetType}/${file}`;
  }
}

export function godotImportHints(request: AssetRequest): Record<string, string | boolean | number> {
  const pixel = request.style.pixelArt !== false;
  return {
    filter: pixel ? 'nearest' : 'linear',
    mipmaps: false,
    pixelSnap: pixel,
    engine: request.output.engine,
  };
}
