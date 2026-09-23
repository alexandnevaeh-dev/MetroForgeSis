import type { GameArchetype } from '@metroforge/schemas';
import { isTopDownArchetype } from '@metroforge/shared';

/** Research synthesis: docs/METROIDVANIA_DESIGN_STUDY.md.
 * This guides schema-supported DNA choices; it does not create runtime capabilities.
 * Explicit user direction has priority over these defaults.
 */
export function buildGenreDesignBrief(archetype: GameArchetype): string {
  const spatial = isTopDownArchetype(archetype)
    ? 'Top-down adventure: readable floor routes, distinct room landmarks, directional combat and dungeon tools; do not design platform jumps or side-view-only routes.'
    : 'Metroidvania: an interconnected world with ability-gated return routes, memorable landmarks, varied long halls and vertical chambers. Movement and combat should complement exploration.';
  return [
    'Design guidance (honor explicit user preferences):',
    spatial,
    'Use a coherent original visual language: consistent materials, palette, silhouette and lighting across environments, characters, equipment and effects. Preserve the requested rendering medium; painterly art must not silently become pixel art.',
    'Favor responsive movement and readable combat over spectacle that obscures enemies or terrain. Express distinct combat roles, not a list of interchangeable damage upgrades.',
    'Use the existing JSON schema only. Do not claim that prose creates spells, weapon behaviors, inventory systems or new runtime abilities. Do not add unsupported fields or rename registered ability identifiers.',
  ].join('\n');
}
