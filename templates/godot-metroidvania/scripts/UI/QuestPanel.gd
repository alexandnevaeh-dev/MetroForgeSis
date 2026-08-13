extends Control

func _ready() -> void:
	if not EventBus.quest_updated.is_connected(_on_quest_updated):
		EventBus.quest_updated.connect(_on_quest_updated)
	queue_redraw()

func _on_quest_updated(_quest_id: String) -> void:
	queue_redraw()

func _draw() -> void:
	var entries: Array = QuestManager.get_display_entries()
	if entries.is_empty():
		draw_string(ThemeDB.fallback_font, Vector2(8, 24), "No quests yet", HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
		return

	var y := 16.0
	for entry in entries:
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var name: String = entry.get("name", "?")
		var status: String = entry.get("status", "")
		draw_string(ThemeDB.fallback_font, Vector2(8, y), "%s [%s]" % [name, status], HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
		y += 18.0
		for objective in entry.get("objectives", []):
			if typeof(objective) != TYPE_DICTIONARY:
				continue
			var line := "  - %s (%d/%d)" % [
				objective.get("description", objective.get("type", "?")),
				int(objective.get("progress", 0)),
				int(objective.get("count", 1)),
			]
			draw_string(ThemeDB.fallback_font, Vector2(8, y), line, HORIZONTAL_ALIGNMENT_LEFT, -1, 12)
			y += 16.0
