extends RefCounted
## Shared loot semantics: each item rolls independently, quantities include both endpoints.
static func validate(entries: Array, known_items: Dictionary) -> String:
 if entries.size() > 1000:
  return "Loot table exceeds 1000 entries"
 var seen: Dictionary = {}
 for entry in entries:
  if not entry is Dictionary:
   return "Loot entry must be a dictionary"
  var id = entry.get("itemId", "")
  var chance = entry.get("chance", -1)
  var low = entry.get("minQuantity", 0)
  var high = entry.get("maxQuantity", 0)
  if not known_items.has(id) or seen.has(id):
   return "Unknown or duplicate loot item: %s" % str(id)
  if not (chance is float or chance is int) or not is_finite(float(chance)) or chance < 0 or chance > 1:
   return "Chance must be finite and between zero and one"
  if not (low is float or low is int) or not (high is float or high is int):
   return "Quantity bounds must be numbers"
  if not is_finite(float(low)) or not is_finite(float(high)) or low != floor(low) or high != floor(high) or low < 1 or high < low or high > 1000000:
   return "Quantity bounds must be positive integers with maximum at least minimum"
  seen[id] = true
 return ""

static func roll(entries: Array, known_items: Dictionary, rng: RandomNumberGenerator) -> Array:
 var error := validate(entries, known_items)
 if not error.is_empty():
  push_warning("LootRoller: " + error)
  return []
 if rng == null:
  push_warning("LootRoller: Random generator is required")
  return []
 var drops: Array = []
 for entry in entries:
  if entry.chance <= 0:
   continue
  if entry.chance < 1 and rng.randf() >= entry.chance:
   continue
  var amount: int = int(entry.minQuantity)
  if entry.minQuantity != entry.maxQuantity:
   amount = rng.randi_range(int(entry.minQuantity), int(entry.maxQuantity))
  drops.append({"itemId": entry.itemId, "quantity": amount})
 return drops
