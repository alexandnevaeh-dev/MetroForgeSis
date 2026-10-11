import type { GeneratedAsset } from './asset-pipeline.js';
import { enemyVisualPlan, type EnemyVisualDefinition } from './enemy-visual-plan.js';

export function namedEnemyArtworkPlans(definitions: readonly EnemyVisualDefinition[] | undefined, sideView: boolean) {
  return (sideView ? definitions ?? [] : []).map(definition => ({ definition, ...enemyVisualPlan(definition.id, definition, true) }));
}
type Plans = ReturnType<typeof namedEnemyArtworkPlans>;

/** Technical animation metrics cannot approve generic art for a named actor. */
export function retainEnemyFamilyReview(asset: GeneratedAsset, plans: Plans): GeneratedAsset {
  const member = plans.find(({ definition: { id } }) =>
    asset.path === `assets/enemies/${id}.png` ||
    ['walk', 'run', 'hurt', 'death', 'attack', 'idle', 'fly', 'idle_pose'].some(clip => asset.path === `assets/enemies/${id}_${clip}.png`));
  if (!member || !asset.fallbackGenerated) return asset;
  return { ...asset, proceduralProduction: false, maturity: 'PLACEHOLDER', productionReady: false, productionAllowed: false };
}

/** Refuse stale identity caches before emitting artifacts; never relabel existing pixels. */
export function assertCachedEnemyIdentities(assets: GeneratedAsset[], plans: Plans): void {
  for (const plan of plans) {
    const root = assets.find(asset => asset.id === plan.definition.id && asset.path === `assets/enemies/${plan.definition.id}.png`);
    const identity = root?.executionMetadata?.enemyVisualIdentity as Record<string, unknown> | undefined;
    if (!identity || identity.id !== plan.definition.id || identity.name !== plan.definition.name ||
      identity.movement !== plan.definition.movement || identity.combatType !== plan.definition.combat.type ||
      identity.archetype !== plan.archetype || identity.subject !== plan.subject) {
      throw new Error(`Cached artwork identity does not match ${plan.definition.id}; generate a fresh candidate or explicitly review its artwork`);
    }
  }
}
