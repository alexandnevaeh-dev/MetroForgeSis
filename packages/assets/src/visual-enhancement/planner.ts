import type { AssetReplacementPlan, VisualAssetFamily } from './types.js';

export interface PlannerBaselineAsset {
  id: string;
  path: string;
  /** Absolute path to the file on disk, when known — planner never reads bytes itself. */
  absolutePath?: string;
  width?: number;
  height?: number;
}

export interface PlanReplacementsInput {
  projectSlug: string;
  generationId: string;
  baselineAssets: PlannerBaselineAsset[];
  biomeCount: number;
  /** Set to restrict enemy replacement to specific ids; defaults to the first 3 discovered. */
  enemyIds?: string[];
}

const CHAR_DIMENSIONS = { width: 64, height: 64 };
const BG_DIMENSIONS = { width: 640, height: 360 };
const INTERACTIVE_DIMENSIONS = { width: 32, height: 32 };

function findAsset(assets: PlannerBaselineAsset[], id: string): PlannerBaselineAsset | undefined {
  return assets.find((a) => a.id === id);
}

function basePlan(input: {
  projectSlug: string;
  generationId: string;
  family: VisualAssetFamily;
  assetId: string;
  role: string;
  dimensions: { width: number; height: number };
  transparentBackground: boolean;
}): Omit<AssetReplacementPlan, 'sourceAssetPath' | 'sourceAssetKind' | 'references' | 'biomeId' | 'entityId'> {
  return {
    projectSlug: input.projectSlug,
    generationId: input.generationId,
    assetId: input.assetId,
    family: input.family,
    role: input.role,
    dimensions: input.dimensions,
    transparentBackground: input.transparentBackground,
    preserveSilhouette: true,
    preservePose: true,
    preserveScale: true,
    preserveOrientation: true,
    priority: 'P0',
    replacementStrategy: 'edit-from-procedural-base',
    animationState: 'idle',
    requiredCapabilities: input.transparentBackground
      ? ['transparent_sprite', 'alpha_output', 'fixed_dimensions']
      : ['full_frame_image', 'fixed_dimensions'],
  };
}

/**
 * P0 vertical slice only: 1 player, up to 3 enemy archetypes, 1 boss, up to 3 biome backgrounds
 * (far layer — the most visually dominant parallax layer; mid/near/overlay/foreground are a
 * disclosed follow-up, not enhanced this pass), 1 checkpoint, 1 ability pickup, 1 ability gate.
 * Macro architecture, props, locked doors, UI icons (P1) and tiles/portraits/VFX (P2) are typed
 * in VisualAssetFamily but intentionally not planned here — see the pass report for why.
 */
export function planAssetReplacements(input: PlanReplacementsInput): AssetReplacementPlan[] {
  const plans: AssetReplacementPlan[] = [];
  const assets = input.baselineAssets;

  const player = findAsset(assets, 'player');
  if (player) {
    plans.push({
      ...basePlan({
        projectSlug: input.projectSlug,
        generationId: input.generationId,
        family: 'player',
        assetId: player.id,
        role: 'player character',
        dimensions: { width: player.width ?? CHAR_DIMENSIONS.width, height: player.height ?? CHAR_DIMENSIONS.height },
        transparentBackground: true,
      }),
      sourceAssetPath: player.path,
      sourceAssetKind: 'procedural-production',
      references: player.absolutePath ? [player.absolutePath] : [],
    });
  }

  const enemyIds = input.enemyIds ?? assets.filter((a) => /^enemy_\d+$/.test(a.id)).slice(0, 3).map((a) => a.id);
  for (const enemyId of enemyIds.slice(0, 3)) {
    const enemy = findAsset(assets, enemyId);
    if (!enemy) continue;
    plans.push({
      ...basePlan({
        projectSlug: input.projectSlug,
        generationId: input.generationId,
        family: 'enemy',
        assetId: enemy.id,
        role: `enemy archetype ${enemyId}`,
        dimensions: { width: enemy.width ?? CHAR_DIMENSIONS.width, height: enemy.height ?? CHAR_DIMENSIONS.height },
        transparentBackground: true,
      }),
      sourceAssetPath: enemy.path,
      sourceAssetKind: 'procedural-production',
      entityId: enemyId,
      references: enemy.absolutePath ? [enemy.absolutePath] : [],
    });
  }

  const boss = assets.find((a) => /^boss/.test(a.id) && !/_(walk|hurt|death|attack|pose)/.test(a.id));
  if (boss) {
    plans.push({
      ...basePlan({
        projectSlug: input.projectSlug,
        generationId: input.generationId,
        family: 'boss',
        assetId: boss.id,
        role: 'boss',
        dimensions: { width: boss.width ?? CHAR_DIMENSIONS.width * 2, height: boss.height ?? CHAR_DIMENSIONS.height * 2 },
        transparentBackground: true,
      }),
      sourceAssetPath: boss.path,
      sourceAssetKind: 'procedural-production',
      entityId: boss.id,
      references: boss.absolutePath ? [boss.absolutePath] : [],
    });
  }

  for (let b = 0; b < Math.min(3, Math.max(0, input.biomeCount)); b++) {
    const bg = findAsset(assets, `bg_biome_${b}_far`);
    if (!bg) continue;
    plans.push({
      ...basePlan({
        projectSlug: input.projectSlug,
        generationId: input.generationId,
        family: 'background',
        assetId: bg.id,
        role: 'biome far-layer background',
        dimensions: { width: bg.width ?? BG_DIMENSIONS.width, height: bg.height ?? BG_DIMENSIONS.height },
        transparentBackground: false,
      }),
      // Backgrounds are conceptual/compositional, not a small procedural gradient worth editing —
      // generate-from-spec, per the user's own guidance ("Best for: backgrounds, macro
      // architecture sheets..."). sourceAssetPath is still set so a successful candidate activates
      // onto the *canonical* Godot-referenced path (assets/backgrounds/biome_N/far.png) instead of
      // a assets/generated/... path nothing would ever reference — see replace.ts's generate-from-
      // spec activation logic.
      replacementStrategy: 'generate-from-spec',
      sourceAssetPath: bg.path,
      sourceAssetKind: 'procedural-production',
      biomeId: `biome_${b}`,
      references: bg.absolutePath ? [bg.absolutePath] : [],
      requiredCapabilities: ['full_frame_image', 'fixed_dimensions'],
    });
  }

  // Checkpoint / ability pickup / ability gate have deterministic production baselines at their
  // canonical generated paths. Providers may replace them, but failure preserves those baselines.
  const interactiveFamilies: Array<{ family: VisualAssetFamily; assetId: string; role: string }> = [
    { family: 'checkpoint', assetId: 'interactive_checkpoint', role: 'save point / checkpoint shrine icon' },
    { family: 'pickup', assetId: 'interactive_ability_pickup', role: 'ability pickup relic icon' },
    { family: 'gate', assetId: 'interactive_ability_gate', role: 'ability-locked gate marker' },
  ];
  for (const spec of interactiveFamilies) {
    plans.push({
      projectSlug: input.projectSlug,
      generationId: input.generationId,
      assetId: spec.assetId,
      family: spec.family,
      role: spec.role,
      sourceAssetKind: 'procedural-production',
      sourceAssetPath: `assets/generated/${spec.family}/${spec.assetId}.png`,
      references: [],
      dimensions: INTERACTIVE_DIMENSIONS,
      transparentBackground: true,
      preserveSilhouette: false,
      preservePose: false,
      preserveScale: true,
      preserveOrientation: false,
      priority: 'P0',
      replacementStrategy: 'generate-from-spec',
      requiredCapabilities: ['transparent_sprite', 'alpha_output', 'fixed_dimensions'],
    });
  }

  return plans;
}
