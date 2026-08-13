extends Control
## Compact always-visible HUD quest tracker — active quests from QuestManager.

const MAX_QUESTS := 2
const MAX_OBJECTIVES := 2

func _ready() -> void:
	if not EventBus.quest_updated.is_connected(_on_quest_updated):
		EventBus.quest_updated.connect(_on_quest_updated)
	queue_redraw()

func _on_quest_updated(_quest_id: String) -> void:
	queue_redraw()

func _draw() -> void:
	var entries: Array = QuestManager.get_hud_entries()
	if entries.is_empty():
		draw_string(ThemeDB.fallback_font, Vector2(8, 18), "No active quests", HORIZONTAL_ALIGNMENT_LEFT, -1, 12)
		return

	var y := 16.0
	var shown := 0
	for entry in entries:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if shown >= MAX_QUESTS:
			break
		var name: String = entry.get("name", "?")
		draw_string(ThemeDB.fallback_font, Vector2(8, y), name, HORIZONTAL_ALIGNMENT_LEFT, -1, 13)
		y += 16.0
		var obj_shown := 0
		for objective in entry.get("objectives", []):
			if typeof(objective) != TYPE_DICTIONARY:
				continue
			if obj_shown >= MAX_OBJECTIVES:
				break
			var line := "  %s (%d/%d)" % [
				objective.get("description", objective.get("type", "?")),
				int(objective.get("progress", 0)),
				int(objective.get("count", 1)),
			]
			draw_string(ThemeDB.fallback_font, Vector2(8, y), line, HORIZONTAL_ALIGNMENT_LEFT, -1, 11)
			y += 14.0
			obj_shown += 1
		shown += 1
		y += 4.0
