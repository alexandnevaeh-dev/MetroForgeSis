using System;
using System.Collections.Generic;

[Serializable] public class InventoryEffect { public string type; public float value; }
[Serializable] public class InventoryItem { public string id; public string name; public string category; public InventoryEffect[] effects; }
[Serializable] public class InventoryCatalog { public InventoryItem[] items; }

[Serializable] public class InventoryCount { public string id; public int count; }
[Serializable] public class InventorySlot { public string slot; public string itemId; }
[Serializable] public class InventorySave { public InventoryCount[] items; public InventorySlot[] slots; }

/// <summary>Runtime ownership and equipment rules, independent of scene lifecycle.</summary>
public sealed class GameplayInventory
{
    public event Action Changed;
    private readonly Dictionary<string, InventoryItem> definitions = new Dictionary<string, InventoryItem>();
    private readonly Dictionary<string, int> counts = new Dictionary<string, int>();
    private readonly Dictionary<string, string> equipped = new Dictionary<string, string>();
    public GameplayInventory(InventoryItem[] items)
    {
        foreach (var item in items ?? Array.Empty<InventoryItem>())
        {
            if (item == null || string.IsNullOrWhiteSpace(item.id) || definitions.ContainsKey(item.id))
                throw new ArgumentException("Inventory contains a missing or duplicate item ID");
            foreach (var effect in item.effects ?? Array.Empty<InventoryEffect>())
                if (effect == null || float.IsNaN(effect.value) || float.IsInfinity(effect.value))
                    throw new ArgumentException("Inventory contains an invalid effect");
            definitions.Add(item.id, item);
        }
    }
    public string Name(string id) => id != null && definitions.TryGetValue(id, out var item) ? item.name ?? id : id ?? "";
    public string Category(string id) => id != null && definitions.TryGetValue(id, out var item) ? item.category : "";
    public int Count(string id) => id != null && counts.TryGetValue(id, out var count) ? count : 0;
    public string Equipped(string slot) => slot != null && equipped.TryGetValue(slot, out var id) ? id : "";
    public bool Grant(string id, int amount)
    {
        if (id == null || amount <= 0 || !definitions.TryGetValue(id, out var item)) return false;
        var total = (long)Count(id) + amount;
        if (total > int.MaxValue) return false;
        counts[id] = (int)total;
        if (IsSlot(item.category) && string.IsNullOrEmpty(Equipped(item.category))) equipped[item.category] = id;
        Changed?.Invoke();
        return true;
    }
    public bool TryConsumeHealing(string id, float missingHealth, out float healed)
    {
        healed = 0f;
        if (id == null || missingHealth <= 0f || float.IsNaN(missingHealth) || float.IsInfinity(missingHealth)
            || Count(id) <= 0 || !definitions.TryGetValue(id, out var item) || item.category != "consumable") return false;
        double healing = 0;
        foreach (var effect in item.effects ?? Array.Empty<InventoryEffect>())
        {
            // Do not consume mixed-effect items until every authored effect is supported.
            if (effect.type != "heal" || effect.value < 0f) return false;
            healing += effect.value;
        }
        if (healing <= 0) return false;
        healed = (float)Math.Min(healing, missingHealth);
        var remaining = Count(id) - 1;
        if (remaining == 0) counts.Remove(id); else counts[id] = remaining;
        Changed?.Invoke();
        return true;
    }
    public bool Equip(string id)
    {
        if (id == null || Count(id) <= 0 || !definitions.TryGetValue(id, out var item) || !IsSlot(item.category)) return false;
        equipped[item.category] = id;
        Changed?.Invoke();
        return true;
    }
    public bool Unequip(string slot)
    {
        if (!IsSlot(slot)) return false;
        equipped[slot] = "";
        Changed?.Invoke();
        return true;
    }
    public float Effect(string type)
    {
        double total = 0;
        foreach (var owned in counts)
        {
            var item = definitions[owned.Key];
            var copies = IsSlot(item.category) ? (Equipped(item.category) == item.id ? 1 : 0)
                : item.category == "relic" ? owned.Value : 0;
            foreach (var effect in item.effects ?? Array.Empty<InventoryEffect>())
                if (effect.type == type) total += (double)effect.value * copies;
        }
        return (float)Math.Max(-float.MaxValue, Math.Min(float.MaxValue, total));
    }
    public InventorySave Capture()
    {
        var owned = new List<InventoryCount>();
        foreach (var entry in counts) owned.Add(new InventoryCount { id = entry.Key, count = entry.Value });
        owned.Sort((a,b) => string.CompareOrdinal(a.id,b.id));
        var slots = new List<InventorySlot>();
        foreach (var slot in new[] { "weapon", "armor", "charm" })
            slots.Add(new InventorySlot { slot = slot, itemId = Equipped(slot) });
        return new InventorySave { items = owned.ToArray(), slots = slots.ToArray() };
    }
    public void Restore(InventorySave save)
    {
        var restoredCounts = new Dictionary<string,int>();
        var restoredSlots = new Dictionary<string,string>();
        if (save != null)
        {
            foreach (var item in save.items ?? Array.Empty<InventoryCount>())
            {
                if (item == null || string.IsNullOrEmpty(item.id) || item.count <= 0 || restoredCounts.ContainsKey(item.id))
                    throw new ArgumentException("Invalid saved inventory count");
                // Removed authored items cannot supply effects in the current catalog.
                if (definitions.ContainsKey(item.id)) restoredCounts.Add(item.id,item.count);
            }
            foreach (var slot in save.slots ?? Array.Empty<InventorySlot>())
            {
                if (slot == null || !IsSlot(slot.slot) || restoredSlots.ContainsKey(slot.slot))
                    throw new ArgumentException("Invalid saved inventory slot");
                var id = slot.itemId ?? "";
                if (id != "" && (!restoredCounts.ContainsKey(id) || definitions[id].category != slot.slot)) id = "";
                restoredSlots.Add(slot.slot,id);
            }
        }
        counts.Clear(); equipped.Clear();
        foreach (var entry in restoredCounts) counts.Add(entry.Key,entry.Value);
        foreach (var entry in restoredSlots) equipped.Add(entry.Key,entry.Value);
        Changed?.Invoke();
    }
    private static bool IsSlot(string category) => category == "weapon" || category == "armor" || category == "charm";
}
