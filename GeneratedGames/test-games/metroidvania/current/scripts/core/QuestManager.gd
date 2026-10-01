extends Node
## Quest tracking driven by real gameplay signals — Reach, BossKill, Kill, Collect, Talk,
## AbilityAcquire, Discover, Activate, Interact, Choice. Generator rotates intermediate types;
## the final quest in every profile is always BossKill.

const QUESTS_PATH := "res://data/quests/quests.json"

enum QuestState { LOCKED, AVAILABLE, ACTIVE, COMPLETE }

var _quests_by_id: Dictionary = {}
var _state: Dictionary = {}
var _objective_progress: Dictionary = {}
## Not exclusively quest income — this is the one real currency store in the project, and
## ItemPickup.gd (currency-category item pickups) adds to it directly rather than starting a
## second, competing wallet.
var currency: Dictionary = {"scrap": 0}

func _ready() -> void:
	_load_quest_definitions()
	EventBus.room_entered.connect(_on_room_entered)
	EventBus.boss_defeated.connect(_on_boss_defeated)
	EventBus.enemy_killed.connect(_on_enemy_killed)
	EventBus.item_collected.connect(_on_item_collected)
	EventBus.npc_talked.connect(_on_npc_talked)
	EventBus.ability_acquired.connect(_on_ability_acquired)
	EventBus.room_discovered.connect(_on_room_discovered)
	EventBus.object_activated.connect(_on_object_activated)
	EventBus.object_interacted.connect(_on_object_interacted)
	EventBus.dialogue_choice_made.connect(_on_dialogue_choice_made)

func _load_quest_definitions() -> void:
	if not FileAccess.file_exists(QUESTS_PATH):
		return
	var file := FileAccess.open(QUESTS_PATH, FileAccess.READ)
	if file == null:
		return
	var text := file.get_as_text()
	file.close()

	var json := JSON.new()
	if json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		push_warning("QuestManager: quests.json is corrupt or unreadable")
		return

	var quests: Array = json.data.get("quests", [])
	for quest in quests:
		var quest_id: String = quest.get("id", "")
		if quest_id.is_empty():
			continue
		_quests_by_id[quest_id] = quest
		var prereqs: Array = quest.get("prerequisites", [])
		_state[quest_id] = QuestState.AVAILABLE if prereqs.is_empty() else QuestState.LOCKED

func get_quest_name(quest_id: String) -> String:
	return _quests_by_id.get(quest_id, {}).get("name", quest_id)

func get_quest_state(quest_id: String) -> QuestState:
	return _state.get(quest_id, QuestState.LOCKED)

func is_quest_available(quest_id: String) -> bool:
	return get_quest_state(quest_id) == QuestState.AVAILABLE

func accept_quest(quest_id: String) -> bool:
	if not is_quest_available(quest_id):
		return false
	_state[quest_id] = QuestState.ACTIVE
	EventBus.quest_updated.emit(quest_id)
	return true

func _on_room_entered(room_id: String) -> void:
	_advance_objectives("Reach", room_id)

func _on_boss_defeated(boss_id: String) -> void:
	_advance_objectives("BossKill", boss_id)

func _on_enemy_killed(enemy_id: String) -> void:
	_advance_objectives("Kill", enemy_id)

func _on_item_collected(item_id: String) -> void:
	_advance_objectives("Collect", item_id)

func _on_npc_talked(npc_id: String) -> void:
	_advance_objectives("Talk", npc_id)

func _on_ability_acquired(ability_id: String) -> void:
	_advance_objectives("AbilityAcquire", ability_id)

func _on_room_discovered(room_id: String) -> void:
	_advance_objectives("Discover", room_id)

func _on_object_activated(object_id: String) -> void:
	_advance_objectives("Activate", object_id)

func _on_object_interacted(object_id: String) -> void:
	_advance_objectives("Interact", object_id)

func _on_dialogue_choice_made(choice_id: String) -> void:
	_advance_objectives("Choice", choice_id)

func _advance_objectives(objective_type: String, target: String) -> void:
	for quest_id in _quests_by_id.keys():
		if get_quest_state(quest_id) != QuestState.ACTIVE:
			continue

		var quest: Dictionary = _quests_by_id[quest_id]
		var objectives: Array = quest.get("objectives", [])
		var progressed := false
		for objective in objectives:
			if objective.get("type", "") == objective_type and objective.get("target", "") == target:
				var key := "%s:%s" % [quest_id, objective.get("id", "")]
				var count: int = int(objective.get("count", 1))
				_objective_progress[key] = min(int(_objective_progress.get(key, 0)) + 1, count)
				progressed = true

		if not progressed:
			continue

		var all_complete := true
		for objective in objectives:
			var key2 := "%s:%s" % [quest_id, objective.get("id", "")]
			var target_count: int = int(objective.get("count", 1))
			if int(_objective_progress.get(key2, 0)) < target_count:
				all_complete = false
				break
		if all_complete:
			_complete_quest(quest_id)
		else:
			EventBus.quest_updated.emit(quest_id)

func _complete_quest(quest_id: String) -> void:
	_state[quest_id] = QuestState.COMPLETE

	var quest: Dictionary = _quests_by_id[quest_id]
	for reward in quest.get("rewards", []):
		var reward_type: String = reward.get("type", "")
		if reward_type == "currency":
			var currency_id: String = reward.get("id", "")
			currency[currency_id] = int(currency.get(currency_id, 0)) + int(reward.get("amount", 0))
		elif reward_type == "item":
			InventoryManager.grant_item(String(reward.get("id", "")), int(reward.get("amount", 1)))

	_unlock_dependents(quest_id)
	EventBus.quest_updated.emit(quest_id)
	EventBus.save_triggered.emit()

func _unlock_dependents(completed_quest_id: String) -> void:
	for quest_id in _quests_by_id.keys():
		if get_quest_state(quest_id) != QuestState.LOCKED:
			continue
		var prereqs: Array = _quests_by_id[quest_id].get("prerequisites", [])
		if prereqs.is_empty() or not prereqs.has(completed_quest_id):
			continue
		var all_met := true
		for p in prereqs:
			if get_quest_state(p) != QuestState.COMPLETE:
				all_met = false
				break
		if all_met:
			_state[quest_id] = QuestState.AVAILABLE
			EventBus.quest_updated.emit(quest_id)

func get_save_data() -> Dictionary:
	return {
		"state": _state.duplicate(),
		"progress": _objective_progress.duplicate(),
		"currency": currency.duplicate(),
	}

func restore_save_data(data: Dictionary) -> void:
	var saved_state: Dictionary = data.get("state", {})
	for quest_id in saved_state.keys():
		if _quests_by_id.has(quest_id):
			_state[quest_id] = int(saved_state[quest_id])
	_objective_progress = data.get("progress", {}).duplicate()
	currency = data.get("currency", {"scrap": 0}).duplicate()

func _state_label(state: QuestState) -> String:
	match state:
		QuestState.AVAILABLE:
			return "Available"
		QuestState.ACTIVE:
			return "Active"
		QuestState.COMPLETE:
			return "Complete"
		_:
			return "Locked"

func get_display_entries() -> Array:
	var entries: Array = []
	for quest_id in _quests_by_id.keys():
		var state: QuestState = get_quest_state(quest_id)
		if state == QuestState.LOCKED:
			continue
		var quest: Dictionary = _quests_by_id[quest_id]
		var objectives_out: Array = []
		for objective in quest.get("objectives", []):
			if typeof(objective) != TYPE_DICTIONARY:
				continue
			var key := "%s:%s" % [quest_id, objective.get("id", "")]
			objectives_out.append({
				"type": objective.get("type", ""),
				"description": objective.get("description", objective.get("type", "")),
				"progress": int(_objective_progress.get(key, 0)),
				"count": int(objective.get("count", 1)),
			})
		entries.append({
			"id": quest_id,
			"name": quest.get("name", quest_id),
			"status": _state_label(state),
			"objectives": objectives_out,
		})

	entries.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var order := {"Active": 0, "Available": 1, "Complete": 2}
		return int(order.get(a.get("status", ""), 9)) < int(order.get(b.get("status", ""), 9))
	)
	return entries

## Compact HUD list — active quests only, so the overlay stays small during play.
func get_hud_entries() -> Array:
	var entries: Array = []
	for entry in get_display_entries():
		if typeof(entry) == TYPE_DICTIONARY and String(entry.get("status", "")) == "Active":
			entries.append(entry)
	return entries
