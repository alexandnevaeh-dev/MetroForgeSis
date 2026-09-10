import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterVisualDNA, GameDNA } from '@metroforge/schemas';
import {
  isTopDownArchetype,
  packageDirFromMeta,
  type GenerationProfile,
} from '@metroforge/shared';

export const AUTHORED_COURIER_PROVIDER = 'authored-original';
export const AUTHORED_COURIER_LICENSE = 'Original-MetroForge (commercial OK)';

export function authoredCourierDir(): string {
  return join(packageDirFromMeta(import.meta.url), '..', 'authored', 'foundry-courier');
}

export function authoredMasonryDir(): string {
  return join(packageDirFromMeta(import.meta.url), '..', 'authored', 'foundry-masonry');
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

/** The hand-authored courier kit is a SIDE-VIEW foundry-courier design (visor/pack/blade,
 *  foundry-tender). It ships for the side-view Foundry visual slice and for any side-view gen
 *  whose theme is explicitly foundry/courier/wanderer. It must never apply to a top-down game
 *  (wrong genre) or to an unrelated side-view theme just because the profile is the slice. */
export function shouldUseFoundryCourierKit(input: {
  profile: GenerationProfile;
  gameDna: GameDNA;
  characterVisualDna?: CharacterVisualDNA;
}): boolean {
  if (isTopDownArchetype(input.gameDna.archetype)) return false;
  const hay = [
    input.gameDna.identity.title,
    input.gameDna.identity.tagline,
    input.gameDna.narrative.premise,
    input.gameDna.narrative.protagonist,
    input.characterVisualDna?.silhouette,
    input.characterVisualDna?.clothing,
    input.characterVisualDna?.prompt,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\bfoundry\b|\bcourier\b|\bwanderer\b/.test(hay);
}
