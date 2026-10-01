class_name ActorSockets
extends Node2D
## Named attachment points for VFX / hitboxes / projectiles.
## Children are Marker2D nodes named after socket ids (weapon_tip, feet, …).

const SOCKET_IDS := [
	"hand_left",
	"hand_right",
	"hand_main",
	"hand_off",
	"weapon_root",
	"weapon_tip",
	"weapon_center",
	"projectile_origin",
	"spell_origin",
	"shield_anchor",
	"chest",
	"head",
	"feet",
	"ground_contact",
	"body_center",
	"impact_origin",
]

## Side-view default local offsets (feet at origin-ish; sprite pivot mid-body).
const SIDE_VIEW_DEFAULTS := {
	"feet": Vector2(0, 0),
	"ground_contact": Vector2(0, 2),
	"body_center": Vector2(0, -24),
	"chest": Vector2(0, -28),
	"head": Vector2(0, -44),
	"hand_right": Vector2(14, -22),
	"hand_left": Vector2(-10, -22),
	"hand_main": Vector2(14, -22),
	"hand_off": Vector2(-10, -22),
	"weapon_root": Vector2(12, -20),
	"weapon_center": Vector2(22, -18),
	"weapon_tip": Vector2(30, -16),
	"projectile_origin": Vector2(18, -26),
	"spell_origin": Vector2(0, -30),
	"shield_anchor": Vector2(-12, -22),
	"impact_origin": Vector2(20, -20),
}

## Top-down / three-quarter defaults (body centered on CharacterBody2D).
const TOP_DOWN_DEFAULTS := {
	"feet": Vector2(0, 6),
	"ground_contact": Vector2(0, 8),
	"body_center": Vector2(0, 0),
	"chest": Vector2(0, -2),
	"head": Vector2(0, -8),
	"hand_right": Vector2(10, 2),
	"hand_left": Vector2(-10, 2),
	"hand_main": Vector2(10, 2),
	"hand_off": Vector2(-10, 2),
	"weapon_root": Vector2(8, 0),
	"weapon_center": Vector2(14, 0),
	"weapon_tip": Vector2(20, 0),
	"projectile_origin": Vector2(12, 0),
	"spell_origin": Vector2(0, -4),
	"shield_anchor": Vector2(-10, 0),
	"impact_origin": Vector2(16, 0),
}

@export_enum("side_view", "top_down") var layout: String = "side_view"
## When true, rotate weapon_* / hand_* / projectile_* sockets to match facing each frame.
@export var mirror_weapon_with_facing: bool = true

var _facing: Vector2 = Vector2.RIGHT

func _ready() -> void:
	_ensure_markers()

func _ensure_markers() -> void:
	var defaults: Dictionary = SIDE_VIEW_DEFAULTS if layout == "side_view" else TOP_DOWN_DEFAULTS
	for id in SOCKET_IDS:
		var node := get_node_or_null(id) as Marker2D
		if node == null:
			node = Marker2D.new()
			node.name = id
			add_child(node)
		if not node.has_meta("authored"):
			node.position = defaults.get(id, Vector2.ZERO)

func set_facing(dir: Vector2) -> void:
	if dir.length_squared() < 0.0001:
		return
	_facing = dir.normalized()
	if not mirror_weapon_with_facing:
		return
	var flip := -1.0 if _facing.x < -0.01 else 1.0
	if layout == "top_down":
		# Rotate planar sockets around body so tip tracks attack/move facing.
		var angle := _facing.angle()
		for id in ["weapon_root", "weapon_center", "weapon_tip", "projectile_origin", "hand_main", "hand_right", "impact_origin"]:
			var marker := get_node_or_null(id) as Marker2D
			if marker == null:
				continue
			var defaults: Dictionary = TOP_DOWN_DEFAULTS
			var base: Vector2 = defaults.get(id, Vector2.RIGHT * 16.0)
			var len := base.length()
			marker.position = Vector2(cos(angle), sin(angle)) * len
	else:
		for id in ["weapon_root", "weapon_center", "weapon_tip", "projectile_origin", "hand_main", "hand_right", "impact_origin", "hand_left", "hand_off", "shield_anchor"]:
			var marker := get_node_or_null(id) as Marker2D
			if marker == null:
				continue
			var defaults: Dictionary = SIDE_VIEW_DEFAULTS
			var base: Vector2 = defaults.get(id, Vector2.ZERO)
			marker.position = Vector2(absf(base.x) * flip if absf(base.x) > 0.01 else base.x, base.y)

func global_socket(id: String, fallback: Vector2 = Vector2.ZERO) -> Vector2:
	var marker := get_node_or_null(id) as Marker2D
	if marker:
		return marker.global_position
	# Aliases
	if id == "hand_main":
		return global_socket("hand_right", fallback)
	if id == "weapon_center":
		return global_socket("weapon_tip", fallback)
	return fallback if fallback != Vector2.ZERO else global_position

func has_socket(id: String) -> bool:
	return get_node_or_null(id) is Marker2D
