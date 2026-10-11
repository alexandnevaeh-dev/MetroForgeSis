import type { GameContent } from '@metroforge/procedural';
import type { GameDNA } from '@metroforge/schemas';

const ARCHIVE_LORE = {
  lost_echo_001: {
    name: "Scribe's Margin",
    description: 'A note from the reading loft: each storm warning was copied twice, for the keepers above and the families sheltering below. The final margin asks them to leave the service landing clear for the next messenger.',
  },
  lost_echo_002: {
    name: 'Vault Evacuation Ledger',
    description: 'A brass-bound record of lamp oil and bread carried into the lower shelter. Its final column lists no debts: when the stormglass cracked, the keepers opened the stores to everyone. A smudged signature remembers the last ledger keeper.',
  },
} as const;

/** Fresh archive generation enriches existing collectibles; saved projects are never migrated. */
export function bindStormglassArchiveLore(content: GameContent, dna: GameDNA, layout: string | undefined): GameContent {
  if (!['stormglass-archive-wing','stormglass-record-halls'].includes(String(layout)) || dna.archetype !== 'SIDE_VIEW_METROIDVANIA') return content;
  return { ...content, items: content.items.map(item => {
    const brief = ARCHIVE_LORE[item.id as keyof typeof ARCHIVE_LORE];
    return brief && item.category === 'collectible' ? { ...item, ...brief } : item;
  }) };
}
