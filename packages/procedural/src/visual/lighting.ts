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

export interface BiomeLightingProfile {
  biomeId: string;
  ambientColor: string;
  ambientIntensity: number;
  keyLightColor: string;
  keyLightIntensity: number;
  accentLightColor: string;
  fogColor: string;
  fogStrength: number;
  emissiveAccent: string;
  foregroundDarkening: number;
  bossArenaModifier: number;
  roomSeed: number;
}

function hexToColor(hex: string): string {
  return hex.startsWith('#') ? hex : `#${hex}`;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    hash ^= code;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeColor(hex: string | undefined, fallback: string): string {
  const value = (hex ?? fallback).trim();
  return value.startsWith('#') ? value : `#${value}`;
}

export function buildDeterministicBiomeLightingProfile(input: {
  biome: BiomeVisualDNA;
  seed: number;
  roomId?: string;
}): BiomeLightingProfile {
  const roomHash = hashString(`${input.biome.biomeId}|${input.seed}|${input.roomId ?? 'default'}`);
  const toneShift = ((roomHash % 17) - 8) / 100;
  const accentShift = ((roomHash % 23) - 11) / 100;
  const baseAmbient = normalizeColor(input.biome.lighting.ambient, input.biome.paletteOverrides.shadows[0] ?? '#0f172a');
  const baseKey = normalizeColor(input.biome.lighting.key, input.biome.paletteOverrides.highlights[0] ?? '#dfeaf4');
  const baseAccent = normalizeColor(input.biome.lighting.accent, input.biome.paletteOverrides.accents[0] ?? '#c89d60');
  const fogColor = normalizeColor(input.biome.fog.color, input.biome.paletteOverrides.shadows[0] ?? '#08131b');
  const ambientIntensity = 0.74 + ((roomHash % 9) / 30) + toneShift;
  const keyLightIntensity = 0.84 + ((roomHash % 11) / 25) + accentShift;
  const fogStrength = Math.max(0.09, Math.min(0.38, 0.14 + ((roomHash % 13) / 50)));
  const emissiveAccent = normalizeColor(input.biome.paletteOverrides.accents[1] ?? input.biome.lighting.accent ?? '#f5d28d', '#f5d28d');
  const foregroundDarkening = 0.18 + ((roomHash % 7) / 60);
  const bossArenaModifier = 0.9 + ((roomHash % 5) / 18);
  return {
    biomeId: input.biome.biomeId,
    ambientColor: baseAmbient,
    ambientIntensity,
    keyLightColor: baseKey,
    keyLightIntensity,
    accentLightColor: baseAccent,
    fogColor,
    fogStrength,
    emissiveAccent,
    foregroundDarkening,
    bossArenaModifier,
    roomSeed: roomHash,
  };
}

export function lightingDirectiveForRoom(input: {
  visualDNA: VisualDNA;
  biome: BiomeVisualDNA;
  archetype: string;
}): RoomLightingDirective {
  const boss = input.archetype === 'boss' || input.archetype === 'miniboss';
  const safe = input.archetype === 'save' || input.archetype === 'npc' || input.archetype === 'shop';
  const ability = input.archetype === 'ability_shrine' || input.archetype === 'ability_gate';
  const energy = boss ? 1.35 : safe ? 0.95 : ability ? 1.15 : 1.05;
  const profile = buildDeterministicBiomeLightingProfile({ biome: input.biome, seed: input.visualDNA.seed, roomId: `room:${input.archetype}` });
  const lights = [
    { id: 'key', xNorm: 0.22, yNorm: 0.26, color: hexToColor(profile.keyLightColor), energy: profile.keyLightIntensity * energy, scale: 2.1 },
    { id: 'fill', xNorm: 0.62, yNorm: 0.74, color: hexToColor(profile.accentLightColor), energy: profile.keyLightIntensity * energy * 0.62, scale: 1.7 },
  ];
  if (boss) {
    lights.push({ id: 'arena', xNorm: 0.5, yNorm: 0.35, color: hexToColor(profile.emissiveAccent), energy: profile.bossArenaModifier * 0.8, scale: 2.4 });
  }
  if (safe) {
    lights[0]!.energy = 0.85;
    lights[1]!.energy = 0.55;
  }
  return {
    biomeId: input.biome.biomeId,
    archetype: input.archetype,
    ambient: profile.ambientColor,
    key: profile.keyLightColor,
    accent: profile.accentLightColor,
    energy,
    lights,
    darkness: boss,
  };
}
