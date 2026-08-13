extends Node
## Tracks collected items and applies equipment bonuses. Currency amounts live in QuestManager
## (the one real wallet). Relics permanently raise max health. Weapons and charms occupy
## loadout slots and only apply while equipped (auto-equip on pickup if the slot is empty).

const ITEMS_PATH := "res://data/items/items.json"
const BASE_MAX_HEALTH := 100.0
const BASE_ATTACK := 10.0
const EQUIP_SLOTS := ["weapon", "charm"]

var _item_defs: Dictionary = {}
var _collected_counts: Dictionary = {}
## slot name -> equipped item id (empty string = nothing equipped)
var _equipped: Dictionary = {}

func _ready() -> void:
	_load_item_definitions()

func _load_item_definitions() -> void:
	if not FileAccess.file_exists(ITEMS_PATH):
		return
	var file := FileAccess.open(ITEMS_PATH, FileAccess.READ)
	if file == null:
		return
	var text := file.get_as_text()
	file.close()

	var json := JSON.new()
	if json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		return

	for item in json.data.get("items", []):
		var item_id: String = item.get("id", "")
		if item_id.is_empty():
			continue
		_item_defs[item_id] = item

func get_item_definition(item_id: String) -> Dictionary:
	return _item_defs.get(item_id, {})

func get_owned_count(item_id: String) -> int:
	var def: Dictionary = get_item_definition(item_id)
	if def.get("category", "") == "currency":
		return int(QuestManager.currency.get(item_id, 0))
	return int(_collected_counts.get(item_id, 0))

func get_collectible_total_count() -> int:
	var total := 0
	for item_id in _item_defs.keys():
		if get_item_definition(item_id).get("category", "") == "collectible":
			total += 1
	return total

func get_collectible_found_count() -> int:
	var found := 0
	for item_id in _item_defs.keys():
		if get_item_definition(item_id).get("category", "") != "collectible":
			continue
		if get_owned_count(item_id) > 0:
			found += 1
	return found

func get_equipped(slot: String) -> String:
	return String(_equipped.get(slot, ""))

func is_equipped(item_id: String) -> bool:
	for slot in EQUIP_SLOTS:
		if get_equipped(slot) == item_id:
			return true
	return false

func is_equippable(item_id: String) -> bool:
	var category: String = get_item_definition(item_id).get("category", "")
	return category in EQUIP_SLOTS

func get_display_entries() -> Array:
	var entries: Array = []
	for item_id in _item_defs.keys():
		var def: Dictionary = _item_defs[item_id]
		var category: String = def.get("category", "")
		var count := get_owned_count(item_id)
		if count <= 0:
			continue
		entries.append({
			"id": item_id,
			"name": def.get("name", item_id),
			"category": category,
			"count": count,
			"equipped": is_equipped(item_id),
			"equippable": category in EQUIP_SLOTS,
		})
	entries.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return String(a.get("name", "")) < String(b.get("name", ""))
	)
	return entries

func reset_for_new_game() -> void:
	_collected_counts.clear()
	_equipped.clear()
	apply_stat_bonuses(false)

func get_save_data() -> Dictionary:
	return {
		"collected_counts": _collected_counts.duplicate(),
		"equipped": _equipped.duplicate(),
	}

func restore_save_data(data: Dictionary) -> void:
	_collected_counts = data.get("collected_counts", {}).duplicate()
	_equipped = data.get("equipped", {}).duplicate()
	_ensure_default_loadout()
	apply_stat_bonuses(false)

func _ensure_default_loadout() -> void:
	for slot in EQUIP_SLOTS:
		if not get_equipped(slot).is_empty():
			continue
		for item_id in _collected_counts.keys():
			if int(_collected_counts[item_id]) <= 0:
				continue
			if get_item_definition(item_id).get("category", "") == slot:
				_equipped[slot] = item_id
				break

func grant_item(item_id: String, amount: int = 1) -> bool:
	var def: Dictionary = get_item_definition(item_id)
	if def.is_empty() or amount <= 0:
		return false
	var category: String = def.get("category", "")
	if category == "currency":
		QuestManager.currency[item_id] = int(QuestManager.currency.get(item_id, 0)) + amount
	elif category == "consumable":
		_apply_consumable_effects(def, amount)
	else:
		_collected_counts[item_id] = int(_collected_counts.get(item_id, 0)) + amount
		if category in EQUIP_SLOTS:
			if get_equipped(category).is_empty():
				equip_item(item_id)
			# already holding something in this slot — stays in bags until equipped
		elif category == "relic":
			apply_stat_bonuses(true)
	EventBus.item_collected.emit(item_id)
	return true

func equip_item(item_id: String) -> bool:
	if get_owned_count(item_id) <= 0 or not is_equippable(item_id):
		return false
	var slot: String = get_item_definition(item_id).get("category", "")
	_equipped[slot] = item_id
	apply_stat_bonuses(true)
	EventBus.equipment_changed.emit(slot, item_id)
	return true

func unequip_slot(slot: String) -> bool:
	if slot not in EQUIP_SLOTS:
		return false
	if get_equipped(slot).is_empty():
		return false
	_equipped[slot] = ""
	apply_stat_bonuses(false)
	EventBus.equipment_changed.emit(slot, "")
	return true

func toggle_equip(item_id: String) -> bool:
	if not is_equippable(item_id):
		return false
	var slot: String = get_item_definition(item_id).get("category", "")
	if get_equipped(slot) == item_id:
		return unequip_slot(slot)
	return equip_item(item_id)

func apply_stat_bonuses(heal_on_increase: bool = false, player: Node = null) -> void:
	if player == null:
		player = get_tree().get_first_node_in_group("player") if get_tree() else null
	if player == null:
		return

	var health: HealthComponent = player.get_node_or_null("HealthComponent")
	var hitbox: HitboxComponent = player.get_node_or_null("AttackHitbox")
	var bonus_hp := _sum_effect("max_health")
	var bonus_atk := _sum_effect("attack")

	if health:
		var new_max := BASE_MAX_HEALTH + bonus_hp
		var old_max: float = health.max_health
		health.max_health = new_max
		if heal_on_increase and new_max > old_max:
			health.current_health += new_max - old_max
		elif health.current_health > new_max:
			health.current_health = new_max
		health.health_changed.emit(health.current_health, health.max_health)

	if hitbox:
		hitbox.damage = BASE_ATTACK + bonus_atk

func _apply_consumable_effects(def: Dictionary, amount: int) -> void:
	var player := get_tree().get_first_node_in_group("player") if get_tree() else null
	if player == null:
		return
	var health_component: HealthComponent = player.get_node_or_null("HealthComponent")
	if health_component == null:
		return
	for i in range(amount):
		for effect in def.get("effects", []):
			if effect.get("type", "") == "heal":
				health_component.heal(float(effect.get("value", 0)))

func _sum_effect(effect_type: String) -> float:
	var total := 0.0
	for item_id in _collected_counts.keys():
		var count := int(_collected_counts[item_id])
		if count <= 0:
			continue
		var def: Dictionary = get_item_definition(item_id)
		var category: String = def.get("category", "")
		if category in EQUIP_SLOTS and get_equipped(category) != item_id:
			continue
		for effect in def.get("effects", []):
			if effect.get("type", "") == effect_type:
				total += float(effect.get("value", 0)) * count
	return total
