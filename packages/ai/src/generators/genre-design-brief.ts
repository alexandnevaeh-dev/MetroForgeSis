import type { GameArchetype } from '@metroforge/schemas';
import { genreSupports, getGenreDefinition } from '@metroforge/shared';

/** Research synthesis: docs/METROIDVANIA_DESIGN_STUDY.md.
 * This guides schema-supported DNA choices; it does not create runtime capabilities.
 * Explicit user direction has priority over these defaults.
 */
export function buildGenreDesignBrief(archetype: GameArchetype): string {
  const genre = getGenreDefinition(archetype);
  const spatial = genreSupports(archetype, 'supportsFreePlanarMovement')
    ? 'Top-down adventure: readable floor routes, distinct room landmarks, directional combat and dungeon tools; do not design platform jumps or side-view-only routes.'
    : 'Metroidvania: an interconnected world with ability-gated return routes, memorable landmarks, varied long halls and vertical chambers. Movement and combat should complement exploration.';
  return [
    'Design guidance (honor explicit user preferences):',
    spatial,
    `Genre profile: ${genre.displayName} (perspective=${genre.perspective}, progression=${genre.defaultProgression}).`,
    'Use a coherent original visual language: consistent materials, palette, silhouette and lighting across environments, characters, equipment and effects. Preserve the requested rendering medium; painterly art must not silently become pixel art.',
    'Character animation must feel modern and fluid: lifelike locomotion weight, articulated limbs, readable anticipation/follow-through on attacks, and swinging melee arcs — never stiff bob/slide placeholders when posed frames are possible.',
    'Favor responsive movement and readable combat over spectacle that obscures enemies or terrain. Express distinct combat roles, not a list of interchangeable damage upgrades.',
    'Use the existing JSON schema only. Do not claim that prose creates spells, weapon behaviors, inventory systems or new runtime abilities. Do not add unsupported fields or rename registered ability identifiers.',
  ].join('\n');
}
