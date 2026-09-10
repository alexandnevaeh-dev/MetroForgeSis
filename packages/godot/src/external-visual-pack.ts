import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const EXTERNAL_VISUAL_PACKS = [
  'industrial-transit',
  'metroforge-foundry-v3',
  // Top-down-native pack (research-facility milestone): unlike the two packs above, whose
  // destinations use side-view naming (e.g. `_locomotion.png`, matching side-view
  // AnimatedAssetSprite.gd's `run_sheet_path` convention), this one's manifest destinations
  // match the top-down template's own filenames (`_walk.png`, `assets/enemies/<family>_*.png`)
  // so it plugs into TopDownPlayerController/TopDownEnemyController/BossController exactly as a
  // real generated-and-enhanced project's own assets would. See
  // test-packs/metroforge-research-facility/manifest.json and docs/debug/TOPDOWN_GENRE_MILESTONE.md.
  'metroforge-research-facility',
  // v2 (asset-quality overhaul pass): same manifest shape and destination-naming convention as
  // the v1 pack above, in its own sibling directory (test-packs/metroforge-research-facility-v2/)
  // per this pass's explicit "use a separate versioned asset directory" instruction — v1 is left
  // completely untouched and still selectable. Higher-frame-count character animation (real
  // computeFrameQualityMetrics-verified, not just higher numbers), a deliberately-constructed
  // (not generic-noise) tile atlas, and 8 props (4 new, reusing existing shape families with new
  // palettes). See test-packs/metroforge-research-facility-v2/manifest.json and
  // docs/debug/TOPDOWN_GENRE_MILESTONE.md's overhaul-pass section.
  'metroforge-research-facility-v2',
] as const;
export type ExternalVisualPackId = (typeof EXTERNAL_VISUAL_PACKS)[number];

export interface ExternalVisualPackAsset {
  id: string;
  family: 'tile' | 'architecture' | 'background' | 'prop' | 'landmark' | 'interactive' | 'character' | 'vfx';
  role: string;
  source: string;
  destination: string;
  nativeDimensions: { width: number; height: number };
  anchor: 'floor' | 'wall' | 'ceiling' | 'opening' | 'free';
  allowedArchetypes: string[];
  collision: 'none' | 'gameplay-owned';
  layer: 'far' | 'mid' | 'near' | 'gameplay' | 'foreground';
  maxInstancesPerRoom: number;
}

export interface ExternalVisualPackManifest {
  id: ExternalVisualPackId;
  visualTheme: string;
  playerReferenceHeight: number;
  sourceLicense: string;
  assets: ExternalVisualPackAsset[];
}

/** Loads only shipped test-pack files; callers must not manufacture a procedural fallback. */
export function loadExternalVisualPack(root: string, id: ExternalVisualPackId): ExternalVisualPackManifest {
  const manifestPath = join(root, 'test-packs', id, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`External visual pack manifest missing: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ExternalVisualPackManifest;
  if (manifest.id !== id || manifest.playerReferenceHeight <= 0 || !Array.isArray(manifest.assets) || !manifest.assets.length) {
    throw new Error(`External visual pack manifest is invalid: ${manifestPath}`);
  }
  for (const asset of manifest.assets) {
    if (!asset.id || !asset.destination || !asset.source || !existsSync(join(root, 'test-packs', id, asset.source))) {
      throw new Error(`External visual pack asset is missing or invalid: ${asset.id}`);
    }
  }
  return manifest;
}