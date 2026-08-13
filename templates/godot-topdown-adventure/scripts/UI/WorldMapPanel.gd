class_name WorldMapPanel
extends Control

const ARCHETYPE_COLORS := {
	"boss": Color(0.85, 0.25, 0.25, 1.0),
	"shop": Color(0.92, 0.72, 0.2, 1.0),
	"save": Color(0.35, 0.85, 0.45, 1.0),
	"ability_shrine": Color(0.35, 0.75, 0.95, 1.0),
	"ability_gate": Color(0.95, 0.55, 0.25, 1.0),
	"treasure": Color(0.95, 0.85, 0.35, 1.0),
	"secret": Color(0.75, 0.55, 0.95, 1.0),
	"npc": Color(0.7, 0.55, 0.9, 1.0),
	"puzzle": Color(0.45, 0.85, 0.75, 1.0),
	"arena": Color(0.9, 0.45, 0.45, 1.0),
	"challenge": Color(0.85, 0.4, 0.55, 1.0),
	"set_piece": Color(0.55, 0.7, 0.95, 1.0),
	"transition": Color(0.5, 0.5, 0.55, 1.0),
	"traversal": Color(0.5, 0.65, 0.75, 1.0),
	"connector": Color(0.42, 0.58, 0.68, 1.0),
	"tutorial": Color(0.6, 0.75, 0.55, 1.0),
	"combat": Color(0.45, 0.55, 0.65, 1.0),
}

func _ready() -> void:
	queue_redraw()

func _archetype_color(archetype: String) -> Color:
	return ARCHETYPE_COLORS.get(archetype, ARCHETYPE_COLORS["combat"])

func _draw() -> void:
	if MapManager.get_graph().is_empty():
		draw_string(ThemeDB.fallback_font, Vector2(8, 20), "Map unavailable", HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
		return

	var positions: Dictionary = MapManager.get_room_positions()
	var current: String = MapManager.get_current_room_id()
	var discovered: Array = MapManager.get_discovered_ids()

	for room_id in positions.keys():
		var pos: Vector2 = positions[room_id]
		var known: bool = (room_id in discovered) or room_id == current
		var rect := Rect2(pos + Vector2(4, 4), Vector2(20, 20))
		var archetype: String = MapManager.get_room_archetype(room_id)
		if room_id == current:
			draw_rect(rect, Color(0.37, 0.64, 0.98, 1.0))
		elif known:
			draw_rect(rect, _archetype_color(archetype))
		else:
			draw_rect(rect, Color(0.15, 0.18, 0.22, 1.0))
		if known:
			var label: String = String(room_id).replace("room_", "")
			if archetype == "shop":
				label = "$"
			elif archetype == "boss":
				label = "B"
			elif archetype == "save":
				label = "S"
			elif archetype == "ability_shrine":
				label = "A"
			elif archetype == "ability_gate":
				label = "G"
			elif archetype == "secret":
				label = "?"
			elif archetype == "puzzle":
				label = "P"
			elif archetype == "arena" or archetype == "challenge":
				label = "!"
			draw_string(ThemeDB.fallback_font, pos + Vector2(6, 18), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 8)

	var edges: Array = MapManager.get_graph().get("edges", [])
	for edge in edges:
		if typeof(edge) != TYPE_DICTIONARY:
			continue
		var a: String = edge.get("from", "")
		var b: String = edge.get("to", "")
		if not positions.has(a) or not positions.has(b):
			continue
		if a not in discovered and b not in discovered and a != current and b != current:
			continue
		var pa: Vector2 = positions[a] + Vector2(14, 14)
		var pb: Vector2 = positions[b] + Vector2(14, 14)
		draw_line(pa, pb, Color(0.35, 0.42, 0.5, 0.8), 1.0)
