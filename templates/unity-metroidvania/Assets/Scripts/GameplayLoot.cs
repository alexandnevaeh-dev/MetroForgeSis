using System;
using System.Collections.Generic;
[Serializable] public class LootEntry { public string itemId; public double chance; public int minQuantity; public int maxQuantity; }
[Serializable] public class LootTable { public string id; public string name; public LootEntry[] entries; }
[Serializable] public class LootCatalog { public LootTable[] tables; }
public struct LootDrop { public string itemId; public int quantity; }
public static class GameplayLoot
{
    public static List<LootDrop> Roll(LootTable table, ISet<string> knownItems, Func<double> random)
    {
        if (table == null || string.IsNullOrWhiteSpace(table.id) || string.IsNullOrWhiteSpace(table.name) || table.entries == null || table.entries.Length > 1000 || knownItems == null || random == null)
            throw new ArgumentException("Invalid loot table or dependencies");
        var ids = new HashSet<string>();
        // Validate every entry before consuming random values or delivering any rewards.
        foreach (var entry in table.entries)
        {
            if (entry == null || string.IsNullOrEmpty(entry.itemId) || !knownItems.Contains(entry.itemId) || !ids.Add(entry.itemId))
                throw new ArgumentException("Loot contains unknown or duplicate item");
            if (double.IsNaN(entry.chance) || double.IsInfinity(entry.chance) || entry.chance < 0 || entry.chance > 1 || entry.minQuantity < 1 || entry.maxQuantity < entry.minQuantity || entry.maxQuantity > 1000000)
                throw new ArgumentException("Invalid loot probability or quantity");
        }
        var drops = new List<LootDrop>();
        foreach (var entry in table.entries)
        {
            if (entry.chance == 0 || (entry.chance < 1 && Sample(random) >= entry.chance)) continue;
            var quantity = entry.minQuantity == entry.maxQuantity ? entry.minQuantity
                : entry.minQuantity + (int)Math.Floor(Sample(random) * (entry.maxQuantity - entry.minQuantity + 1));
            drops.Add(new LootDrop { itemId = entry.itemId, quantity = quantity });
        }
        return drops;
    }
    private static double Sample(Func<double> random)
    {
        var value = random();
        if (double.IsNaN(value) || double.IsInfinity(value) || value < 0 || value >= 1)
            throw new ArgumentException("Loot RNG must return a finite value in [0, 1)");
        return value;
    }
}
