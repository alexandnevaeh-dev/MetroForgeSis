extends Node
## Loads generated dialogue data and resolves lines / branching choices for NPC interaction.

const DIALOGUES_PATH := "res://data/dialogues/dialogues.json"

var _dialogues_by_id: Dictionary = {}

func _ready() -> void:
	_load_dialogues()

func _load_dialogues() -> void:
	if not FileAccess.file_exists(DIALOGUES_PATH):
		return
	var file := FileAccess.open(DIALOGUES_PATH, FileAccess.READ)
	if file == null:
		return
	var text := file.get_as_text()
	file.close()

	var json := JSON.new()
	if json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		return

	for dialogue in json.data.get("dialogues", []):
		if typeof(dialogue) != TYPE_DICTIONARY:
			continue
		var dialogue_id: String = dialogue.get("id", "")
		if dialogue_id.is_empty():
			continue
		_dialogues_by_id[dialogue_id] = dialogue

func has_dialogue(dialogue_id: String) -> bool:
	return _dialogues_by_id.has(dialogue_id)

func get_line_count(dialogue_id: String) -> int:
	var dialogue: Dictionary = _dialogues_by_id.get(dialogue_id, {})
	return dialogue.get("lines", []).size()

func get_line_data(dialogue_id: String, index: int) -> Dictionary:
	var dialogue: Dictionary = _dialogues_by_id.get(dialogue_id, {})
	var lines: Array = dialogue.get("lines", [])
	if index < 0 or index >= lines.size():
		return {}
	var line = lines[index]
	return line if typeof(line) == TYPE_DICTIONARY else {}

func line_has_choices(dialogue_id: String, index: int) -> bool:
	var line := get_line_data(dialogue_id, index)
	return line.get("choices", []).size() > 0

func get_line(dialogue_id: String, index: int) -> String:
	var line := get_line_data(dialogue_id, index)
	var text: String = line.get("text", "")
	return text

func dialogue_id_for_quest(quest_id: String) -> String:
	var state = QuestManager.get_quest_state(quest_id)
	match state:
		QuestManager.QuestState.AVAILABLE:
			return "%s_offer" % quest_id
		QuestManager.QuestState.ACTIVE:
			return "%s_active" % quest_id
		QuestManager.QuestState.COMPLETE:
			return "%s_complete" % quest_id
		_:
			return ""
