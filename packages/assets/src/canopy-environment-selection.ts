import type { GameDNA } from '@metroforge/schemas';

/** Built-in woodland art only applies to compatible pixel-art top-down requests. */
export function shouldUseCanopyEnvironment(game: GameDNA): boolean {
  if (game.archetype !== 'TOP_DOWN_ACTION_ADVENTURE' || game.technical.tileSize !== 32) return false;
  if (!/pixel/i.test(game.identity.visualStyle)) return false;
  const theme=[game.identity.title,game.identity.tagline,game.narrative.premise].filter(Boolean).join(' ');
  return /\bforest\b|\bwoodland\b|\bruined canopy\b/i.test(theme);
}
