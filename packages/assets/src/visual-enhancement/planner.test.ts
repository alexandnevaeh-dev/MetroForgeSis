import { describe, expect, it } from 'vitest';
import { planAssetReplacements, type PlannerBaselineAsset } from './planner.js';

function baseline(overrides: Partial<PlannerBaselineAsset> & { id: string; path: string }): PlannerBaselineAsset {
  return { ...overrides };
}

const FULL_BASELINE: PlannerBaselineAsset[] = [
  baseline({ id: 'player', path: 'assets/characters/player.png' }),
  baseline({ id: 'enemy_000', path: 'assets/enemies/enemy_000.png' }),
  baseline({ id: 'enemy_001', path: 'assets/enemies/enemy_001.png' }),
  baseline({ id: 'enemy_002', path: 'assets/enemies/enemy_002.png' }),
  baseline({ id: 'enemy_003', path: 'assets/enemies/enemy_003.png' }),
  baseline({ id: 'boss_final', path: 'assets/bosses/boss_final.png' }),
  baseline({ id: 'boss_final_walk', path: 'assets/bosses/boss_final_walk.png' }),
  baseline({ id: 'bg_biome_0_far', path: 'assets/backgrounds/biome_0/far.png' }),
  baseline({ id: 'bg_biome_1_far', path: 'assets/backgrounds/biome_1/far.png' }),
  baseline({ id: 'bg_biome_2_far', path: 'assets/backgrounds/biome_2/far.png' }),
];

describe('planAssetReplacements', () => {
  it('plans exactly the P0 slice: 1 player, 3 enemies, 1 boss, 3 backgrounds, checkpoint, pickup, gate', () => {
    const plans = planAssetReplacements({
      projectSlug: 'test-slug',
      generationId: 'gen-1',
      baselineAssets: FULL_BASELINE,
      biomeCount: 3,
    });

    const byFamily = (family: string) => plans.filter((p) => p.family === family);
    expect(byFamily('player')).toHaveLength(1);
    expect(byFamily('enemy')).toHaveLength(3);
    expect(byFamily('boss')).toHaveLength(1);
    expect(byFamily('background')).toHaveLength(3);
    expect(byFamily('checkpoint')).toHaveLength(1);
    expect(byFamily('pickup')).toHaveLength(1);
    expect(byFamily('gate')).toHaveLength(1);
    expect(plans).toHaveLength(11);
  });

  it('never plans the boss walk/hurt/death/attack derived sheets, only the master still', () => {
    const plans = planAssetReplacements({
      projectSlug: 'test-slug',
      generationId: 'gen-1',
      baselineAssets: FULL_BASELINE,
      biomeCount: 3,
    });
    const bossPlan = plans.find((p) => p.family === 'boss')!;
    expect(bossPlan.assetId).toBe('boss_final');
  });

  it('caps enemy replacement at 3 even when more baseline enemies exist', () => {
    const manyEnemies: PlannerBaselineAsset[] = [
      ...FULL_BASELINE,
      baseline({ id: 'enemy_004', path: 'assets/enemies/enemy_004.png' }),
      baseline({ id: 'enemy_005', path: 'assets/enemies/enemy_005.png' }),
    ];
    const plans = planAssetReplacements({
      projectSlug: 'test-slug',
      generationId: 'gen-1',
      baselineAssets: manyEnemies,
      biomeCount: 3,
    });
    expect(plans.filter((p) => p.family === 'enemy')).toHaveLength(3);
  });

  it('caps backgrounds at min(3, biomeCount) and skips missing far-layer assets gracefully', () => {
    const plans = planAssetReplacements({
      projectSlug: 'test-slug',
      generationId: 'gen-1',
      baselineAssets: FULL_BASELINE.filter((a) => a.id !== 'bg_biome_2_far'),
      biomeCount: 3,
    });
    expect(plans.filter((p) => p.family === 'background')).toHaveLength(2);
  });

  it('skips a family entirely when its baseline asset is absent, without throwing', () => {
    const noPlayer = FULL_BASELINE.filter((a) => a.id !== 'player');
    const plans = planAssetReplacements({
      projectSlug: 'test-slug',
      generationId: 'gen-1',
      baselineAssets: noPlayer,
      biomeCount: 3,
    });
    expect(plans.some((p) => p.family === 'player')).toBe(false);
  });

  it('interactive families preserve a procedural production baseline during generate-from-spec enhancement', () => {
    const plans = planAssetReplacements({
      projectSlug: 'test-slug',
      generationId: 'gen-1',
      baselineAssets: FULL_BASELINE,
      biomeCount: 3,
    });
    for (const family of ['checkpoint', 'pickup', 'gate'] as const) {
      const plan = plans.find((p) => p.family === family)!;
      expect(plan.replacementStrategy).toBe('generate-from-spec');
      expect(plan.sourceAssetKind).toBe('procedural-production');
      expect(plan.sourceAssetPath).toBe(`assets/generated/${family}/${plan.assetId}.png`);
      expect(plan.references).toHaveLength(0);
    }
  });

  it('character/boss families retain transparent sprite capability requirements and a resolvable reference', () => {
    const plans = planAssetReplacements({
      projectSlug: 'test-slug',
      generationId: 'gen-1',
      baselineAssets: FULL_BASELINE.map((a) => ({ ...a, absolutePath: `/abs/${a.path}` })),
      biomeCount: 3,
    });
      for (const family of ['player', 'enemy', 'boss'] as const) {
      for (const plan of plans.filter((p) => p.family === family)) {
        expect(plan.replacementStrategy).toBe('edit-from-procedural-base');
        expect(plan.requiredCapabilities).toEqual(['transparent_sprite', 'alpha_output', 'fixed_dimensions']);
        expect(plan.sourceAssetKind).toBe('procedural-production');
        expect(plan.sourceAssetPath).toBeTruthy();
        expect(plan.references.length).toBeGreaterThan(0);
      }
    }
  });

  it('backgrounds use generate-from-spec (compositional, not a small procedural gradient worth editing) but still carry a canonical sourceAssetPath so activation lands on the real Godot-referenced file', () => {
    const plans = planAssetReplacements({
      projectSlug: 'test-slug',
      generationId: 'gen-1',
      baselineAssets: FULL_BASELINE.map((a) => ({ ...a, absolutePath: `/abs/${a.path}` })),
      biomeCount: 3,
    });
    for (const plan of plans.filter((p) => p.family === 'background')) {
      expect(plan.replacementStrategy).toBe('generate-from-spec');
      expect(plan.sourceAssetPath).toBeTruthy();
    }
  });

  it('every plan is priority P0 in this pass', () => {
    const plans = planAssetReplacements({
      projectSlug: 'test-slug',
      generationId: 'gen-1',
      baselineAssets: FULL_BASELINE,
      biomeCount: 3,
    });
    expect(plans.every((p) => p.priority === 'P0')).toBe(true);
  });

  it('transparentBackground is true for characters/interactive objects and false for backgrounds', () => {
    const plans = planAssetReplacements({
      projectSlug: 'test-slug',
      generationId: 'gen-1',
      baselineAssets: FULL_BASELINE,
      biomeCount: 3,
    });
    for (const family of ['player', 'enemy', 'boss', 'checkpoint', 'pickup', 'gate'] as const) {
      expect(plans.find((p) => p.family === family)!.transparentBackground).toBe(true);
    }
    for (const plan of plans.filter((p) => p.family === 'background')) {
      expect(plan.transparentBackground).toBe(false);
    }
  });
});
