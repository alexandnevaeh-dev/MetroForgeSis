extends RefCounted
const Roller = preload("res://scripts/core/LootRoller.gd")
## Called deferred by an enemy; the room owns the pickups after the enemy is freed.
static func spawn_for_enemy(parent: Node, position: Vector2, enemy: Dictionary) -> void:
 if not is_instance_valid(parent):
  return
 var table_id: String = str(enemy.get("lootTableId", ""))
 if table_id.is_empty():
  return
 var path := "res://data/loot/loot_tables.json"
 if not FileAccess.file_exists(path):
  push_warning("Loot catalog missing for table: " + table_id)
  return
 var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
 if not parsed is Dictionary or not parsed.get("tables", []) is Array:
  push_warning("Invalid loot catalog")
  return
 var entries: Array = []
 var matches := 0
 for table in parsed.get("tables", []):
  if table is Dictionary and table.get("id", "") == table_id:
   if not table.get("entries", []) is Array:
    push_warning("Invalid loot entries: " + table_id)
    return
   entries = table.get("entries", [])
   matches += 1
 if matches != 1:
  push_warning("Loot table missing or duplicated: " + table_id)
  return
 var known: Dictionary = {}
 for entry in entries:
  if entry is Dictionary:
   var id: String = str(entry.get("itemId", ""))
   if not InventoryManager.get_item_definition(id).is_empty():
    known[id] = true
 var rng := RandomNumberGenerator.new()
 rng.randomize()
 var drops: Array = Roller.roll(entries, known, rng)
 if drops.is_empty():
  return
 var scene = load("res://scenes/world/ItemPickup.tscn") as PackedScene
 if scene == null:
  push_warning("Loot pickup scene missing")
  return
 for index in range(drops.size()):
  var pickup = scene.instantiate()
  pickup.item_id = drops[index].itemId
  pickup.amount = drops[index].quantity
  parent.add_child(pickup)
  pickup.global_position = position + Vector2((index - (drops.size() - 1) / 2.0) * 24.0, 0)
