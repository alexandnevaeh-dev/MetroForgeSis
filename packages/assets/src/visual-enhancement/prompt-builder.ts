import type { BiomeVisualDNA, VisualCategory, VisualDNA } from '@metroforge/schemas';
import { compileVisualPrompt, animationPoseGuidance } from '@metroforge/procedural';
import { sanitizeImagePromptText } from '../sanitize-image-prompt.js';
import type { AssetReplacementPlan, VisualAssetFamily } from './types.js';

/** VisualAssetFamily has strictly more members than VisualCategory (pickup/checkpoint/gate/
 *  macro-architecture/tileset-material don't exist there) — map onto the nearest compiler
 *  category so P0 families still get the richer VisualDNA-aware prompt when it's available. */
const FAMILY_TO_CATEGORY: Record<VisualAssetFamily, VisualCategory> = {
  player: 'player',
  enemy: 'enemy',
  boss: 'boss',
  background: 'background',
  'macro-architecture': 'decoration',
  prop: 'prop',
  pickup: 'prop',
  checkpoint: 'prop',
  gate: 'prop',
  'tileset-material': 'tileset',
  'ui-icon': 'icon',
  portrait: 'portrait',
  'vfx-texture': 'vfx',
};

const FAMILY_CONSTRAINTS: Record<VisualAssetFamily, string> = {
  player: 'single character, side view facing right, feet planted on canvas bottom, no extra limbs, no extra heads',
  enemy: 'single creature, side view facing right, feet planted on canvas bottom, no extra limbs, no extra heads',
  boss: 'single large creature, side view, imposing silhouette, no extra limbs, no extra heads',
  background: 'environment only, no characters, no UI, no logos, no readable text',
  'macro-architecture': 'architectural element only, no characters, no UI, no readable text',
  prop: 'single isolated object, no characters, no readable text',
  pickup: 'single small isolated collectible icon, glowing accent, no characters, no readable text',
  checkpoint: 'single small isolated shrine/beacon icon, no characters, no readable text',
  gate: 'single isolated locked-gate marker icon, no characters, no readable text',
  'tileset-material': 'tileable material, orthographic, no characters, no UI, no readable text',
  'ui-icon': 'flat UI icon, no baked readable text, no photographs',
  portrait: 'bust portrait, face readable, no readable text',
  'vfx-texture': 'isolated VFX sprite, transparent background, no characters',
};

export interface PromptBuilderContext {
  gameStyleLabel?: string;
  tone?: string;
  visualDNA?: VisualDNA;
  biomeVisualDNA?: BiomeVisualDNA;
}

function transparencyClause(transparent: boolean): string {
  return transparent
    ? 'transparent background, isolated subject, no scene backdrop'
    : 'full-frame composition, no letterboxing';
}

/**
 * Builds the edit instruction (edit-from-procedural-base / multi-reference-edit) or generation
 * prompt (generate-from-spec) for one AssetReplacementPlan. Grounded in VisualDNA/BiomeVisualDNA
 * when the caller has them; otherwise falls back to a family-aware template so the builder is
 * usable without requiring the full art-bible pipeline to be threaded through every call site.
 * Never a bare "generate a fantasy X" string — always carries family/role/dimension/transparency/
 * no-text/preserve-silhouette constraints, and always runs through sanitizeImagePromptText so
 * vendor brand tokens never reach the hosted API (see sanitize-image-prompt.ts's doc comment).
 */
export function buildReplacementPrompt(plan: AssetReplacementPlan, context: PromptBuilderContext = {}): string {
  const dims = `${plan.dimensions.width}x${plan.dimensions.height}`;
  const preserve: string[] = [];
  if (plan.preserveSilhouette) preserve.push('preserve the original silhouette');
  if (plan.preservePose) preserve.push('preserve the original pose');
  if (plan.preserveScale) preserve.push('preserve gameplay scale');
  if (plan.preserveOrientation) preserve.push('preserve orientation');

  if (context.visualDNA) {
    const compiled = compileVisualPrompt({
      visualDNA: context.visualDNA,
      biomeVisualDNA: context.biomeVisualDNA,
      category: FAMILY_TO_CATEGORY[plan.family],
      subject: `Re-render this ${plan.role} in a more polished, appealing modern-Metroidvania art style${preserve.length ? `, ${preserve.join(', ')}` : ''}.`,
      role: plan.role,
      animationState: plan.animationState,
      technicalSpec: {
        width: plan.dimensions.width,
        height: plan.dimensions.height,
        transparentBackground: plan.transparentBackground,
      },
    });
    return sanitizeImagePromptText(compiled.prompt);
  }

  const style = context.gameStyleLabel?.trim() || 'polished original 2D game art';
  const tone = context.tone ? `, ${context.tone} tone` : '';
  const biome = context.biomeVisualDNA
    ? `, ${context.biomeVisualDNA.displayName} biome, ${context.biomeVisualDNA.atmosphere}`
    : '';
  const parts = [
    style,
    plan.role,
    tone,
    biome,
    plan.animationState && plan.animationState !== 'idle'
      ? FAMILY_CONSTRAINTS[plan.family].replace('feet planted on canvas bottom', animationPoseGuidance(plan.animationState))
      : FAMILY_CONSTRAINTS[plan.family],
    transparencyClause(plan.transparentBackground),
    preserve.length ? preserve.join(', ') : '',
    dims,
    'no text, no watermark, no UI chrome unless the asset is a UI icon',
  ]
    .filter((part) => part && part.trim())
    .join(', ');

  return sanitizeImagePromptText(parts);
}
