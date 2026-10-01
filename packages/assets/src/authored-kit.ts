import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterVisualDNA, GameDNA } from '@metroforge/schemas';
import {
  genreSupports,
  packageDirFromMeta,
  type GenerationProfile,
} from '@metroforge/shared';

export const AUTHORED_COURIER_PROVIDER = 'authored-original';
export const AUTHORED_COURIER_LICENSE = 'Original-MetroForge (commercial OK)';

export type AuthoredSideViewKitId = 'foundry-courier' | 'spore-scout';

export function authoredCourierDir(): string {
  return join(packageDirFromMeta(import.meta.url), '..', 'authored', 'foundry-courier');
}

export function authoredMasonryDir(): string {
  return join(packageDirFromMeta(import.meta.url), '..', 'authored', 'foundry-masonry');
}

export function authoredSporeScoutDir(): string {
  return join(packageDirFromMeta(import.meta.url), '..', 'authored', 'spore-scout');
}

function loadAuthoredPng(dir: string, filename: string): Buffer | null {
  const full = join(dir, filename);
  if (!existsSync(full)) return null;
  try {
    return readFileSync(full);
  } catch {
    return null;
  }
}

export function loadAuthoredCourierPng(filename: string): Buffer | null {
  return loadAuthoredPng(authoredCourierDir(), filename);
}

export function loadAuthoredMasonryPng(filename: string): Buffer | null {
  return loadAuthoredPng(authoredMasonryDir(), filename);
}

export function authoredBiomeDir(): string {
  return join(packageDirFromMeta(import.meta.url), '..', 'authored', 'foundry-biomes');
}

export function authoredCastDir(): string {
  return join(packageDirFromMeta(import.meta.url), '..', 'authored', 'foundry-cast');
}

export function loadAuthoredBiomePng(filename: string): Buffer | null {
  return loadAuthoredPng(authoredBiomeDir(), filename);
}

export function loadAuthoredCastPng(filename: string): Buffer | null {
  return loadAuthoredPng(authoredCastDir(), filename);
}

export function loadAuthoredSporePng(filename: string): Buffer | null {
  return loadAuthoredPng(authoredSporeScoutDir(), filename);
}

export function loadAuthoredFoundryTileset(biomeIndex: number, tileSize: number): Buffer | null {
  if (tileSize !== 32) return null;
  if (biomeIndex === 1) return loadAuthoredBiomePng('quench_source.png');
  if (biomeIndex === 2) return loadAuthoredBiomePng('cooling_source.png');
  return loadAuthoredMasonryPng('source.png');
}

export function loadAuthoredSporeTileset(biomeIndex: number, tileSize: number): Buffer | null {
  if (tileSize !== 32) return null;
  if (biomeIndex === 1) return loadAuthoredSporePng('terraces_source.png');
  if (biomeIndex === 2) return loadAuthoredSporePng('depths_source.png');
  return loadAuthoredSporePng('galleries_source.png') ?? loadAuthoredSporePng('source.png');
}

export function foundryBiomeStem(biomeId: string): 'pouring' | 'quench' | 'cooling' {
  if (biomeId.includes('1')) return 'quench';
  if (biomeId.includes('2')) return 'cooling';
  return 'pouring';
}

export function sporeBiomeStem(biomeId: string): 'galleries' | 'terraces' | 'depths' {
  if (biomeId.includes('1') || /terrace|glowcap/i.test(biomeId)) return 'terraces';
  if (biomeId.includes('2') || /depth|mycelium/i.test(biomeId)) return 'depths';
  return 'galleries';
}

function themeHaystack(input: {
  gameDna: GameDNA;
  characterVisualDna?: CharacterVisualDNA;
}): string {
  return [
    input.gameDna.identity.title,
    input.gameDna.identity.tagline,
    input.gameDna.identity.visualStyle,
    input.gameDna.narrative.premise,
    input.gameDna.narrative.protagonist,
    input.characterVisualDna?.silhouette,
    input.characterVisualDna?.clothing,
    input.characterVisualDna?.prompt,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** The hand-authored courier kit is a SIDE-VIEW foundry-courier design (visor/pack/blade,
 *  foundry-tender). It ships for the side-view Foundry visual slice and for any side-view gen
 *  whose theme is explicitly foundry. It must never apply to a top-down game
 *  (wrong genre) or to an unrelated side-view theme just because the profile is the slice. */
export function shouldUseFoundryCourierKit(input: {
  profile: GenerationProfile;
  gameDna: GameDNA;
  characterVisualDna?: CharacterVisualDNA;
}): boolean {
  if (!genreSupports(input.gameDna.archetype, 'supportsPerRoomScenes')) return false;
  return /\bfoundry\b/.test(themeHaystack(input));
}

/** Luminous fungal underdark / spore-scout kit — organic bioluminescent caverns, never foundry. */
export function shouldUseSporeScoutKit(input: {
  profile: GenerationProfile;
  gameDna: GameDNA;
  characterVisualDna?: CharacterVisualDNA;
}): boolean {
  if (!genreSupports(input.gameDna.archetype, 'supportsPerRoomScenes')) return false;
  if (shouldUseFoundryCourierKit(input)) return false;
  const hay = themeHaystack(input);
  return /fungal|underdark|mycelium|bioluminescent|spore.?scout|glowcap|lichen.?cavern|spore.?galleries/.test(
    hay,
  );
}

export function resolveAuthoredSideViewKit(input: {
  profile: GenerationProfile;
  gameDna: GameDNA;
  characterVisualDna?: CharacterVisualDNA;
}): AuthoredSideViewKitId | null {
  if (shouldUseFoundryCourierKit(input)) return 'foundry-courier';
  if (shouldUseSporeScoutKit(input)) return 'spore-scout';
  return null;
}

/** Character stills / cast — foundry courier+cast dirs, or spore-scout monolith dir. */
export function loadAuthoredKitActorPng(
  kit: AuthoredSideViewKitId,
  filename: string,
): Buffer | null {
  if (kit === 'spore-scout') {
    return loadAuthoredSporePng(filename);
  }
  return loadAuthoredCourierPng(filename) ?? loadAuthoredCastPng(filename);
}

export function loadAuthoredKitTileset(
  kit: AuthoredSideViewKitId,
  biomeIndex: number,
  tileSize: number,
): Buffer | null {
  if (kit === 'spore-scout') return loadAuthoredSporeTileset(biomeIndex, tileSize);
  return loadAuthoredFoundryTileset(biomeIndex, tileSize);
}

export function loadAuthoredKitBiomePng(
  kit: AuthoredSideViewKitId,
  filename: string,
): Buffer | null {
  if (kit === 'spore-scout') return loadAuthoredSporePng(filename);
  return loadAuthoredBiomePng(filename);
}

export function loadAuthoredKitAbilityPng(kit: AuthoredSideViewKitId): Buffer | null {
  if (kit === 'spore-scout') return loadAuthoredSporePng('ability.png');
  return loadAuthoredMasonryPng('ability.png');
}

export function authoredKitBiomeStem(
  kit: AuthoredSideViewKitId,
  biomeId: string,
): string {
  if (kit === 'spore-scout') return sporeBiomeStem(biomeId);
  return foundryBiomeStem(biomeId);
}
