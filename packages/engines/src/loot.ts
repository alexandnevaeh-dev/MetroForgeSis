import { LootTableSchema, type LootTable } from '@metroforge/schemas';
export interface LootDrop { itemId: string; quantity: number }
/** Independent per-entry rolls, with inclusive integer quantity bounds. Inject a seeded RNG for replay. */
export function rollLoot(table: LootTable, knownItemIds: ReadonlySet<string>, random: () => number): LootDrop[] {
  const parsed = LootTableSchema.parse(table);
  for (const entry of parsed.entries) {
    if (!knownItemIds.has(entry.itemId)) throw new Error(`Unknown loot item: ${entry.itemId}`);
  }
  const sample = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Loot RNG must return a finite value in [0, 1)');
    return value;
  };
  const drops: LootDrop[] = [];
  for (const entry of parsed.entries) {
    if (entry.chance === 0) continue;
    if (entry.chance < 1 && sample() >= entry.chance) continue;
    const quantity = entry.minQuantity === entry.maxQuantity ? entry.minQuantity
      : entry.minQuantity + Math.floor(sample() * (entry.maxQuantity - entry.minQuantity + 1));
    drops.push({ itemId: entry.itemId, quantity });
  }
  return drops;
}
