/**
 * MODERN_METROIDVANIA_GATE
 * ------------------------
 * A first-class, provider-independent, data-driven presentation-readiness gate.
 *
 * A generated game MUST NOT be treated as production-ready / export-ready simply because it
 * compiles and launches (that is what `godot_imports` / `godot_runtime` already prove). This
 * gate scores the *visual slice* of a generated project across several deterministic dimensions
 * and produces explicit, per-dimension PASS/FAIL reasons so failures are legible rather than
 * hidden behind a green "it ran" result.
 *
 * Design rules honoured here:
 *  - Provider-independent: the gate reads generated artifacts/rooms/composition/screenshots, never
 *    a specific model/provider id. It works identically whether art came from NVIDIA, a local
 *    model, or the procedural fallback.
 *  - No threshold gaming: thresholds are fixed, principled defaults. Procedural-placeholder builds
 *    are *supposed* to fail this gate — that is the correct, honest outcome, not something to tune
 *    away.
 *  - Pure core + thin IO wrapper: `evaluateModernMetroidvaniaGate()` is pure over already-parsed
 *    inputs (unit-testable with fixtures); `runModernMetroidvaniaGate()` reads a project directory.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isNonProductionMaturity } from '@metroforge/shared';
import { critiqueGameplayScreenshot } from '@metroforge/assets';

export const MODERN_METROIDVANIA_GATE = 'modern_metroidvania_gate' as const;

/** Default pass bar for a single dimension (0-100). */
export const DIMENSION_PASS_THRESHOLD = 70;

export interface ModernGateDimension {
  /** Human-facing dimension name, e.g. "PlayerIdentity". */
  dimension: string;
  /** Normalized 0-100 score. */
  score: number;
  /** Pass bar this dimension must clear. */
  threshold: number;
  passed: boolean;
  /**
   * Whether this dimension applies to the project's archetype. Side-view-only dimensions
   * (parallax depth, side-view room composition/readability) are marked N/A for top-down
   * projects instead of hard-failing them on absent side-view data. Non-applicable dimensions
   * do not count toward the gate verdict or overall score.
   */
  applicable: boolean;
  /** Explicit, human-readable reasons — always populated on FAIL, optionally on PASS. */
  reasons: string[];
  /** Raw measured values behind the score, for debugging / provenance. */
  metrics: Record<string, number | string | boolean>;
}

export interface ModernMetroidvaniaGateResult {
  gate: typeof MODERN_METROIDVANIA_GATE;
  passed: boolean;
  state: 'PASS' | 'FAIL';
  /** Mean of dimension scores. */
  overallScore: number;
  /** One-line headline, e.g. "MODERN_METROIDVANIA_GATE: FAIL — 3/8 dimensions passed". */
  message: string;
  /** Multi-line report in the documented gate format (headline + per-dimension + verdict). */
  summary: string;
  dimensions: ModernGateDimension[];
}

/** Minimal shape of a `generation_manifest.json` artifact entry the gate cares about. */
export interface ManifestArtifactLike {
  id?: string;
  path?: string;
  type?: string;
  provider?: string;
  fallbackGenerated?: boolean;
  fakeAnimation?: boolean;
  critiquePassed?: boolean;
  critiqueScore?: number;
  maturity?: string;
  productionReady?: boolean;
  sourceType?: string;
  promptHash?: string;
  seed?: number | null;
}

/** Per-room `layoutMetrics` block written by the assembler into rooms.json. */
export interface RoomLayoutMetricsLike {
  silhouetteHash?: string;
  platformCount?: number;
  pitCount?: number;
  elevationChanges?: number;
  uniquePlatformHeights?: number;
  traversableAreaRatio?: number;
  verticality?: number;
  hazardDensity?: number;
  decorationDensity?: number;
  combatSpacePx?: number;
  silhouetteFilled?: number;
}

export interface RoomRecordLike {
  id?: string;
  layoutMetrics?: RoomLayoutMetricsLike;
}

export interface CompositionLayerLike {
  id?: string;
  zIndex?: number;
  motionScale?: [number, number] | number[];
  assetPath?: string;
  required?: boolean;
}

export interface CompositionRoomLike {
  layers?: CompositionLayerLike[];
  foregroundCoverage?: number;
  ambientParticles?: boolean;
}

export interface TerrainSetLike {
  tileSize?: number;
  roles?: Array<{ role?: string }>;
  missingRoles?: string[];
  seamIssues?: string[];
  passed?: boolean;
}

/** Deterministic screenshot critique stats (a subset of GameplayScreenshotCritique). */
export interface ScreenshotStatLike {
  name?: string;
  score?: number;
  passed?: boolean;
  blank?: boolean;
  uniqueColors?: number;
  occupancy?: number;
  lumaStdDev?: number;
}

export interface ModernGateInputs {
  profile?: string;
  archetype?: string;
  artifacts?: ManifestArtifactLike[];
  rooms?: RoomRecordLike[];
  composition?: Record<string, CompositionRoomLike>;
  terrainSets?: TerrainSetLike[];
  screenshots?: ScreenshotStatLike[];
  /** Whether a character_visual_dna.json identity contract exists. */
  hasCharacterVisualDna?: boolean;
}

/** Scorers return this; the evaluator finalizes `applicable` (archetype-aware) afterwards. */
type RawDimension = Omit<ModernGateDimension, 'applicable'>;

function isTopDown(archetype: string | undefined): boolean {
  return /top.?down/i.test(archetype ?? '');
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function isArtAsset(a: ManifestArtifactLike): boolean {
  const p = (a.path ?? '').replace(/\\/g, '/');
  if (!p.startsWith('assets/')) return false;
  // Exclude audio; keep textures/sprites/tilesets/backgrounds/vfx/icons.
  if (p.startsWith('assets/audio/')) return false;
  return true;
}

function isPlaceholderArt(a: ManifestArtifactLike): boolean {
  if (isNonProductionMaturity(a.maturity)) return true;
  if (a.fallbackGenerated === true) return true;
  if ((a.sourceType ?? '').toLowerCase() === 'procedural') return true;
  if ((a.provider ?? '').toLowerCase() === 'procedural') return true;
  return false;
}

// --- Dimension evaluators -------------------------------------------------------------------

function scoreAssetProduction(artifacts: ManifestArtifactLike[]): RawDimension {
  const art = artifacts.filter(isArtAsset);
  const reasons: string[] = [];
  if (art.length === 0) {
    return {
      dimension: 'AssetProduction',
      score: 0,
      threshold: DIMENSION_PASS_THRESHOLD,
      passed: false,
      reasons: ['No art assets found in generation_manifest.json'],
      metrics: { artAssetCount: 0 },
    };
  }
  const placeholders = art.filter(isPlaceholderArt);
  const aiGenerated = art.filter(
    (a) => !isPlaceholderArt(a) && (a.sourceType ?? '') === 'ai_generated',
  );
  const missingProvenance = art.filter((a) => !a.promptHash).length;
  const eligibleRatio = (art.length - placeholders.length) / art.length;
  const score = clamp(eligibleRatio * 100);
  if (placeholders.length > 0) {
    reasons.push(
      `${placeholders.length}/${art.length} art assets are procedural placeholders (non-production maturity); real art-directed assets require a working image provider`,
    );
  }
  if (missingProvenance > 0) {
    reasons.push(
      `${missingProvenance}/${art.length} art assets are missing promptHash provenance (provider/model/seed/promptHash lineage incomplete)`,
    );
  }
  return {
    dimension: 'AssetProduction',
    score,
    threshold: DIMENSION_PASS_THRESHOLD,
    passed: score >= DIMENSION_PASS_THRESHOLD,
    reasons,
    metrics: {
      artAssetCount: art.length,
      placeholderCount: placeholders.length,
      aiGeneratedCount: aiGenerated.length,
      productionEligibleRatio: Number(eligibleRatio.toFixed(3)),
      missingPromptHash: missingProvenance,
    },
  };
}

const MATURITY_BASE_SCORE: Record<string, number> = {
  PLACEHOLDER: 20,
  REJECTED: 10,
  BLOCKOUT: 30,
  GENERATED_SOURCE: 60,
  COMPILED: 55,
  QA_REVIEW: 78,
  PRODUCTION_READY: 95,
};

function scorePlayerIdentity(
  artifacts: ManifestArtifactLike[],
  hasCharacterVisualDna: boolean,
): RawDimension {
  const player = artifacts.find(
    (a) => a.id === 'player' || (a.path ?? '').includes('characters/player'),
  );
  const reasons: string[] = [];
  if (!player) {
    return {
      dimension: 'PlayerIdentity',
      score: 0,
      threshold: DIMENSION_PASS_THRESHOLD,
      passed: false,
      reasons: ['No player sprite artifact found'],
      metrics: { hasPlayerArtifact: false },
    };
  }
  let score = MATURITY_BASE_SCORE[player.maturity ?? ''] ?? 50;
  if (isPlaceholderArt(player)) {
    score = Math.min(score, 30);
    reasons.push(
      `Player sprite is a procedural placeholder (sourceType=${player.sourceType ?? 'unknown'}, maturity=${player.maturity ?? 'unknown'}); facial identity, costume, silhouette and palette cannot be preserved across animation states`,
    );
  }
  if (!hasCharacterVisualDna) {
    score = Math.max(0, score - 10);
    reasons.push('No character_visual_dna.json identity contract to anchor cross-state identity');
  } else {
    score = Math.min(100, score + 5);
  }
  return {
    dimension: 'PlayerIdentity',
    score: clamp(score),
    threshold: DIMENSION_PASS_THRESHOLD,
    passed: clamp(score) >= DIMENSION_PASS_THRESHOLD,
    reasons,
    metrics: {
      playerMaturity: player.maturity ?? 'unknown',
      playerSourceType: player.sourceType ?? 'unknown',
      playerProvider: player.provider ?? 'unknown',
      hasCharacterVisualDna,
    },
  };
}

function scoreEnemyAnimation(artifacts: ManifestArtifactLike[]): RawDimension {
  const anim = artifacts.filter((a) => {
    const p = (a.path ?? '').replace(/\\/g, '/');
    return (
      (p.includes('enemies/') || p.includes('bosses/')) &&
      /(sheet|walk|attack|hurt|death|_anim)/i.test(p)
    );
  });
  const reasons: string[] = [];
  if (anim.length === 0) {
    return {
      dimension: 'EnemyAnimation',
      score: 40,
      threshold: DIMENSION_PASS_THRESHOLD,
      passed: false,
      reasons: ['No enemy/boss animation sheets found to evaluate'],
      metrics: { animationSheetCount: 0 },
    };
  }
  const fake = anim.filter((a) => a.fakeAnimation === true).length;
  const placeholder = anim.filter(isPlaceholderArt).length;
  const coherent = anim.length - Math.max(fake, placeholder);
  const score = clamp((coherent / anim.length) * 100);
  if (fake > 0) {
    reasons.push(
      `${fake}/${anim.length} enemy/boss animation sheets are deterministic pose substitutes (fakeAnimation), not genuine coherent frames`,
    );
  }
  if (placeholder > 0) {
    reasons.push(
      `${placeholder}/${anim.length} enemy/boss animation sheets are procedural placeholders`,
    );
  }
  return {
    dimension: 'EnemyAnimation',
    score,
    threshold: DIMENSION_PASS_THRESHOLD,
    passed: score >= DIMENSION_PASS_THRESHOLD,
    reasons,
    metrics: {
      animationSheetCount: anim.length,
      fakeAnimationCount: fake,
      placeholderCount: placeholder,
    },
  };
}

function scoreTilesetIntegrity(
  terrainSets: TerrainSetLike[],
  artifacts: ManifestArtifactLike[],
): RawDimension {
  const reasons: string[] = [];
  if (terrainSets.length === 0) {
    return {
      dimension: 'TilesetIntegrity',
      score: 0,
      threshold: DIMENSION_PASS_THRESHOLD,
      passed: false,
      reasons: ['No terrain.json tileset metadata found'],
      metrics: { terrainSetCount: 0 },
    };
  }
  let missingRoleTotal = 0;
  let seamIssueTotal = 0;
  let roleTotal = 0;
  let nonCanonicalTile = 0;
  for (const t of terrainSets) {
    missingRoleTotal += (t.missingRoles ?? []).length;
    seamIssueTotal += (t.seamIssues ?? []).length;
    roleTotal += (t.roles ?? []).length;
    if (t.tileSize && t.tileSize !== 16) nonCanonicalTile++;
  }
  // Structural integrity: complete roles, no seams, canonical tile size.
  let score = 100;
  if (missingRoleTotal > 0) {
    score -= Math.min(40, missingRoleTotal * 8);
    reasons.push(`${missingRoleTotal} required tile role(s) missing across atlases`);
  }
  if (seamIssueTotal > 0) {
    score -= Math.min(40, seamIssueTotal * 10);
    reasons.push(`${seamIssueTotal} adjacent-tile seam incompatibility issue(s) detected`);
  }
  if (nonCanonicalTile > 0) {
    score -= 10;
    reasons.push(`${nonCanonicalTile} atlas(es) use a non-canonical tile size`);
  }
  const tilesetArt = artifacts.filter((a) => (a.path ?? '').includes('tilesets/'));
  const proceduralTilesets = tilesetArt.filter(isPlaceholderArt).length;
  if (tilesetArt.length > 0 && proceduralTilesets === tilesetArt.length) {
    reasons.push(
      'Tileset atlases are procedurally generated (structurally valid but not art-directed source art)',
    );
  }
  return {
    dimension: 'TilesetIntegrity',
    score: clamp(score),
    threshold: DIMENSION_PASS_THRESHOLD,
    passed: clamp(score) >= DIMENSION_PASS_THRESHOLD,
    reasons,
    metrics: {
      terrainSetCount: terrainSets.length,
      totalRoles: roleTotal,
      missingRoles: missingRoleTotal,
      seamIssues: seamIssueTotal,
      proceduralTilesets,
    },
  };
}

function scoreRoomComposition(rooms: RoomRecordLike[]): RawDimension {
  const metrics = rooms.map((r) => r.layoutMetrics ?? {}).filter(Boolean);
  const reasons: string[] = [];
  if (metrics.length === 0) {
    return {
      dimension: 'RoomComposition',
      score: 0,
      threshold: DIMENSION_PASS_THRESHOLD,
      passed: false,
      reasons: ['No room layoutMetrics found'],
      metrics: { roomCount: 0 },
    };
  }
  const avg = (sel: (m: RoomLayoutMetricsLike) => number): number =>
    metrics.reduce((s, m) => s + (sel(m) || 0), 0) / metrics.length;
  const avgDecoration = avg((m) => m.decorationDensity ?? 0);
  const avgPlatforms = avg((m) => m.platformCount ?? 0);
  const roomsWithPits = metrics.filter((m) => (m.pitCount ?? 0) > 0).length;
  const roomsWithVerticality = metrics.filter((m) => (m.verticality ?? 0) > 0.15).length;
  const avgElevation = avg((m) => m.elevationChanges ?? 0);

  // Decoration density is the strongest "is this art-directed vs blockout" signal.
  let score = 0;
  score += Math.min(35, avgDecoration * 700); // 0.05 density → 35
  score += Math.min(20, avgPlatforms * 8); // platform presence
  score += (roomsWithPits / metrics.length) * 15;
  score += (roomsWithVerticality / metrics.length) * 15;
  score += Math.min(15, avgElevation * 6);
  if (avgDecoration <= 0.001) {
    reasons.push(
      'Rooms have ~zero decoration density — geometry is blockout only, with no environmental art props/detail',
    );
  }
  if (avgPlatforms < 0.5) {
    reasons.push('Rooms contain almost no platforming geometry');
  }
  return {
    dimension: 'RoomComposition',
    score: clamp(score),
    threshold: DIMENSION_PASS_THRESHOLD,
    passed: clamp(score) >= DIMENSION_PASS_THRESHOLD,
    reasons,
    metrics: {
      roomCount: metrics.length,
      avgDecorationDensity: Number(avgDecoration.toFixed(4)),
      avgPlatformCount: Number(avgPlatforms.toFixed(2)),
      roomsWithPits,
      roomsWithVerticality,
    },
  };
}

function scoreRoomReadability(rooms: RoomRecordLike[]): RawDimension {
  const metrics = rooms.map((r) => r.layoutMetrics ?? {});
  const reasons: string[] = [];
  if (metrics.length === 0) {
    return {
      dimension: 'RoomReadability',
      score: 0,
      threshold: DIMENSION_PASS_THRESHOLD,
      passed: false,
      reasons: ['No room layoutMetrics found'],
      metrics: { roomCount: 0 },
    };
  }
  const hashes = metrics.map((m) => m.silhouetteHash ?? '').filter(Boolean);
  const distinct = new Set(hashes).size;
  const uniqueRatio = hashes.length > 0 ? distinct / hashes.length : 0;
  // Healthy traversable ratio band: not so cramped it's unreadable, not so open it's an empty box.
  const inBand = metrics.filter((m) => {
    const t = m.traversableAreaRatio ?? 0;
    return t >= 0.35 && t <= 0.85;
  }).length;
  const bandRatio = inBand / metrics.length;
  const roomsWithCombatSpace = metrics.filter((m) => (m.combatSpacePx ?? 0) > 10000).length;

  // Traversable-area readability is weighted highest; silhouette uniqueness is a softer signal
  // (the current silhouetteHash is truncated/low-entropy, so it is not the sole failure driver).
  let score = 0;
  score += bandRatio * 45; // readable traversable space (not an empty box, not cramped)
  score += (roomsWithCombatSpace / metrics.length) * 25;
  score += uniqueRatio * 30; // distinct silhouettes → not wallpaper/copy-paste
  if (uniqueRatio < 0.6) {
    reasons.push(
      `Only ${distinct}/${hashes.length} rooms have distinct silhouettes — repeated room shapes read as copy-paste`,
    );
  }
  if (bandRatio < 0.6) {
    reasons.push(
      'Many rooms fall outside a readable traversable-area band (too open/empty or too cramped)',
    );
  }
  return {
    dimension: 'RoomReadability',
    score: clamp(score),
    threshold: DIMENSION_PASS_THRESHOLD,
    passed: clamp(score) >= DIMENSION_PASS_THRESHOLD,
    reasons,
    metrics: {
      roomCount: metrics.length,
      distinctSilhouettes: distinct,
      silhouetteUniqueRatio: Number(uniqueRatio.toFixed(3)),
      traversableBandRatio: Number(bandRatio.toFixed(3)),
    },
  };
}

function scoreParallaxDepth(
  composition: Record<string, CompositionRoomLike>,
  artifacts: ManifestArtifactLike[],
): RawDimension {
  const rooms = Object.values(composition);
  const reasons: string[] = [];
  if (rooms.length === 0) {
    return {
      dimension: 'ParallaxDepth',
      score: 0,
      threshold: DIMENSION_PASS_THRESHOLD,
      passed: false,
      reasons: ['No environment composition data found'],
      metrics: { compositionRoomCount: 0 },
    };
  }
  // Real parallax = multiple layers with a bound art asset AND a distinct horizontal scroll ratio.
  const perRoomRealLayers = rooms.map((room) => {
    const layers = room.layers ?? [];
    const withAsset = layers.filter((l) => Boolean(l.assetPath));
    const scrolls = new Set(
      withAsset.map((l) => (Array.isArray(l.motionScale) ? l.motionScale[0] : 0)),
    );
    return Math.min(withAsset.length, scrolls.size);
  });
  const avgRealLayers =
    perRoomRealLayers.reduce((s, n) => s + n, 0) / Math.max(1, perRoomRealLayers.length);

  // Cross-reference: how many bound background layers are real art vs procedural strips?
  const bgArt = artifacts.filter((a) => (a.path ?? '').includes('backgrounds/'));
  const proceduralBg = bgArt.filter(isPlaceholderArt).length;
  const artDirectedBg = bgArt.length - proceduralBg;

  // Structural depth (up to 60) + art-directed depth (up to 40).
  let score = Math.min(60, (avgRealLayers / 4) * 60);
  score += bgArt.length > 0 ? (artDirectedBg / bgArt.length) * 40 : 0;
  if (avgRealLayers < 3) {
    reasons.push(
      `Only ~${avgRealLayers.toFixed(1)} distinct-scroll background layers per room; genuine far/mid/near depth is incomplete`,
    );
  }
  if (bgArt.length > 0 && artDirectedBg / bgArt.length < 0.5) {
    reasons.push(
      `${proceduralBg}/${bgArt.length} background layers are procedural strips (only the far layer attempts real generation) — parallax lacks art-directed depth`,
    );
  }
  return {
    dimension: 'ParallaxDepth',
    score: clamp(score),
    threshold: DIMENSION_PASS_THRESHOLD,
    passed: clamp(score) >= DIMENSION_PASS_THRESHOLD,
    reasons,
    metrics: {
      compositionRoomCount: rooms.length,
      avgRealParallaxLayers: Number(avgRealLayers.toFixed(2)),
      backgroundArtifacts: bgArt.length,
      proceduralBackgrounds: proceduralBg,
    },
  };
}

function scoreSceneReadability(screenshots: ScreenshotStatLike[]): RawDimension {
  const reasons: string[] = [];
  const usable = screenshots.filter((s) => !s.blank);
  if (screenshots.length === 0) {
    return {
      dimension: 'SceneReadability',
      score: 0,
      threshold: DIMENSION_PASS_THRESHOLD,
      passed: false,
      reasons: [
        'No gameplay screenshots captured — visual readability cannot be verified (a launch is not evidence of visual quality)',
      ],
      metrics: { screenshotCount: 0 },
    };
  }
  if (usable.length === 0) {
    return {
      dimension: 'SceneReadability',
      score: 10,
      threshold: DIMENSION_PASS_THRESHOLD,
      passed: false,
      reasons: [`All ${screenshots.length} gameplay screenshots are blank/near-empty frames`],
      metrics: { screenshotCount: screenshots.length, blankCount: screenshots.length },
    };
  }
  const avgScore =
    usable.reduce((s, x) => s + (x.score ?? 0), 0) / usable.length;
  const avgColors =
    usable.reduce((s, x) => s + (x.uniqueColors ?? 0), 0) / usable.length;
  const sparse = usable.filter((s) => (s.uniqueColors ?? 0) <= 8).length;
  let score = avgScore;
  if (sparse > 0) {
    score -= Math.min(30, (sparse / usable.length) * 40);
    reasons.push(
      `${sparse}/${usable.length} gameplay frames have <=8 unique colors — scenes read as sparse/placeholder rather than art-directed`,
    );
  }
  return {
    dimension: 'SceneReadability',
    score: clamp(score),
    threshold: DIMENSION_PASS_THRESHOLD,
    passed: clamp(score) >= DIMENSION_PASS_THRESHOLD,
    reasons,
    metrics: {
      screenshotCount: screenshots.length,
      usableCount: usable.length,
      avgCritiqueScore: Number(avgScore.toFixed(1)),
      avgUniqueColors: Number(avgColors.toFixed(1)),
      sparseFrames: sparse,
    },
  };
}

/**
 * Pure evaluator. Every dimension is required — the gate PASSES only when all dimensions clear
 * their threshold, matching the documented "any dimension fails → gate fails, export blocked".
 */
export function evaluateModernMetroidvaniaGate(
  inputs: ModernGateInputs,
): ModernMetroidvaniaGateResult {
  const artifacts = inputs.artifacts ?? [];
  const rooms = inputs.rooms ?? [];
  const composition = inputs.composition ?? {};
  const terrainSets = inputs.terrainSets ?? [];
  const screenshots = inputs.screenshots ?? [];
  const topDown = isTopDown(inputs.archetype);

  // Side-view-only dimensions rely on the side-view room layoutMetrics / parallax composition,
  // which top-down projects (overworld model) do not produce. Mark them N/A there rather than
  // hard-failing top-down on absent side-view data.
  const roomsHaveMetrics = rooms.some((r) => r.layoutMetrics && Object.keys(r.layoutMetrics).length > 0);
  const sideViewRoomsApplicable = !topDown && (rooms.length > 0 || roomsHaveMetrics ? true : false);
  const parallaxApplicable = !topDown;

  const raw: Array<{ raw: RawDimension; applicable: boolean; naReason: string }> = [
    { raw: scoreAssetProduction(artifacts), applicable: true, naReason: '' },
    { raw: scorePlayerIdentity(artifacts, inputs.hasCharacterVisualDna === true), applicable: true, naReason: '' },
    { raw: scoreEnemyAnimation(artifacts), applicable: true, naReason: '' },
    { raw: scoreTilesetIntegrity(terrainSets, artifacts), applicable: true, naReason: '' },
    {
      raw: scoreRoomComposition(rooms),
      applicable: sideViewRoomsApplicable,
      naReason: 'Side-view room composition metrics are not produced for top-down (overworld) projects',
    },
    {
      raw: scoreRoomReadability(rooms),
      applicable: sideViewRoomsApplicable,
      naReason: 'Side-view room readability metrics are not produced for top-down (overworld) projects',
    },
    {
      raw: scoreParallaxDepth(composition, artifacts),
      applicable: parallaxApplicable,
      naReason: 'Horizontal parallax depth does not apply to the top-down archetype',
    },
    { raw: scoreSceneReadability(screenshots), applicable: true, naReason: '' },
  ];

  const dimensions: ModernGateDimension[] = raw.map(({ raw: d, applicable, naReason }) => {
    const reasons = [...d.reasons];
    // Guarantee an explicit reason whenever an applicable dimension fails.
    if (applicable && !d.passed && reasons.length === 0) {
      reasons.push(`Score ${d.score} is below the ${d.threshold} pass bar`);
    }
    if (!applicable && naReason) reasons.unshift(`N/A: ${naReason}`);
    return {
      ...d,
      applicable,
      reasons,
      // Non-applicable dimensions never block the verdict.
      passed: applicable ? d.passed : true,
    };
  });

  const applicableDims = dimensions.filter((d) => d.applicable);
  const passedCount = applicableDims.filter((d) => d.passed).length;
  const overallScore = applicableDims.length
    ? clamp(applicableDims.reduce((s, d) => s + d.score, 0) / applicableDims.length)
    : 0;
  const passed = applicableDims.every((d) => d.passed);
  const state: 'PASS' | 'FAIL' = passed ? 'PASS' : 'FAIL';

  const summaryLines = [`MODERN_METROIDVANIA_GATE: ${state}`];
  for (const d of dimensions) {
    const verdict = !d.applicable ? 'N/A' : d.passed ? 'PASS' : 'FAIL';
    summaryLines.push(`${d.dimension}: ${d.score} ${verdict}`);
  }
  summaryLines.push(passed ? 'Export allowed.' : 'Export blocked.');

  return {
    gate: MODERN_METROIDVANIA_GATE,
    passed,
    state,
    overallScore,
    message: `MODERN_METROIDVANIA_GATE: ${state} — ${passedCount}/${applicableDims.length} applicable dimensions passed (overall ${overallScore})`,
    summary: summaryLines.join('\n'),
    dimensions,
  };
}

// --- File IO wrapper ------------------------------------------------------------------------

function readJsonSafe(path: string): unknown {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function collectTerrainSets(projectPath: string): TerrainSetLike[] {
  const tilesetRoot = join(projectPath, 'assets', 'tilesets');
  const out: TerrainSetLike[] = [];
  if (!existsSync(tilesetRoot)) return out;
  let entries: string[] = [];
  try {
    entries = readdirSync(tilesetRoot);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const terrainPath = join(tilesetRoot, entry, 'terrain.json');
    const parsed = readJsonSafe(terrainPath) as TerrainSetLike | null;
    if (parsed) out.push(parsed);
  }
  return out;
}

function collectScreenshots(projectPath: string): ScreenshotStatLike[] {
  const qaDir = join(projectPath, 'qa');
  const out: ScreenshotStatLike[] = [];
  if (!existsSync(qaDir)) return out;
  let files: string[] = [];
  try {
    files = readdirSync(qaDir).filter((f) => /^screenshot_.*\.png$/.test(f));
  } catch {
    return out;
  }
  for (const f of files) {
    try {
      const png = readFileSync(join(qaDir, f));
      const c = critiqueGameplayScreenshot(png);
      out.push({
        name: f,
        score: c.score,
        passed: c.passed,
        blank: c.blank,
        uniqueColors: c.uniqueColors,
        occupancy: c.occupancy,
        lumaStdDev: c.lumaStdDev,
      });
    } catch {
      // Undecodable screenshot — treat as blank evidence.
      out.push({ name: f, score: 0, passed: false, blank: true, uniqueColors: 0 });
    }
  }
  return out;
}

export interface RunModernGateOptions {
  profile?: string;
}

/**
 * Read a generated project directory and evaluate the MODERN_METROIDVANIA_GATE. Missing inputs
 * degrade gracefully (the affected dimension reports the gap as a failure reason) rather than
 * throwing, so the gate can run on any assembled project.
 */
export function runModernMetroidvaniaGate(
  projectPath: string,
  options: RunModernGateOptions = {},
): ModernMetroidvaniaGateResult {
  const manifest = readJsonSafe(join(projectPath, 'generation_manifest.json')) as {
    artifacts?: ManifestArtifactLike[];
  } | null;
  const roomsJson = readJsonSafe(join(projectPath, 'data', 'rooms', 'rooms.json')) as {
    rooms?: Record<string, RoomRecordLike>;
  } | null;
  const compositionJson = readJsonSafe(
    join(projectPath, 'data', 'environment', 'composition.json'),
  ) as { rooms?: Record<string, CompositionRoomLike> } | null;
  const gameDna = readJsonSafe(join(projectPath, 'game_dna.json')) as {
    archetype?: string;
  } | null;

  const rooms = roomsJson?.rooms ? Object.values(roomsJson.rooms) : [];
  const composition = compositionJson?.rooms ?? {};

  return evaluateModernMetroidvaniaGate({
    profile: options.profile,
    archetype: gameDna?.archetype,
    artifacts: manifest?.artifacts ?? [],
    rooms,
    composition,
    terrainSets: collectTerrainSets(projectPath),
    screenshots: collectScreenshots(projectPath),
    hasCharacterVisualDna: existsSync(join(projectPath, 'character_visual_dna.json')),
  });
}

/** Adapt a gate result to the generic QAGateResult shape used by the pipeline's QA report. */
export function modernGateToQAGateResult(result: ModernMetroidvaniaGateResult): {
  gate: string;
  passed: boolean;
  message: string;
  state: 'PASS' | 'FAIL';
  details: Record<string, unknown>;
} {
  return {
    gate: MODERN_METROIDVANIA_GATE,
    passed: result.passed,
    state: result.state,
    message: result.message,
    details: {
      overallScore: result.overallScore,
      summary: result.summary,
      dimensions: result.dimensions,
    },
  };
}
