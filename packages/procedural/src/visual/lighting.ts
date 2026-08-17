import type { BiomeVisualDNA, VisualDNA } from '@metroforge/schemas';

export interface RoomLightingDirective {
  biomeId: string;
  archetype: string;
  ambient: string;
  key: string;
  accent: string;
  energy: number;
  lights: Array<{
    id: string;
    xNorm: number;
    yNorm: number;
    color: string;
    energy: number;
    scale: number;
  }>;
  darkness: boolean;
}

function hexToColor(hex: string): string {
  return hex.startsWith('#') ? hex : `#${hex}`;
}

export function lightingDirectiveForRoom(input: {
  visualDNA: VisualDNA;
  biome: BiomeVisualDNA;
  archetype: string;
}): RoomLightingDirective {
  const lighting = input.biome.lighting;
  const boss = input.archetype === 'boss' || input.archetype === 'miniboss';
  const safe = input.archetype === 'save' || input.archetype === 'npc' || input.archetype === 'shop';
  const ability = input.archetype === 'ability_shrine' || input.archetype === 'ability_gate';
  const energy = boss ? 1.35 : safe ? 0.95 : ability ? 1.15 : 1.05;
  const lights = [
    { id: 'key', xNorm: 0.22, yNorm: 0.26, color: hexToColor(input.visualDNA.palette.highlights[0] ?? '#b8d4e8'), energy, scale: 2.1 },
    { id: 'fill', xNorm: 0.62, yNorm: 0.74, color: hexToColor(input.visualDNA.palette.accents[0] ?? '#c8a878'), energy: energy * 0.6, scale: 1.7 },
  ];
  if (boss) {
    lights.push({ id: 'arena', xNorm: 0.5, yNorm: 0.35, color: hexToColor(input.visualDNA.palette.accents[1] ?? lighting.accent), energy: 0.8, scale: 2.4 });
  }
  if (safe) {
    lights[0]!.energy = 0.85;
    lights[1]!.energy = 0.55;
  }
  return {
    biomeId: input.biome.biomeId,
    archetype: input.archetype,
    ambient: lighting.ambient,
    key: lighting.key,
    accent: lighting.accent,
    energy,
    lights,
    darkness: boss,
  };
}
