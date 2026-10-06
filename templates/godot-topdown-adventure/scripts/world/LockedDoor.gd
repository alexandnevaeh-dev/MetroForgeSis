class_name LockedDoor
extends StaticBody2D
## A key-gated inter-area door. Solid and interact-only until unlocked — either the player has
## the required key item (InventoryManager, checked via interact()) or a paired FloorSwitch.gd
## calls unlock() directly, a real alternate puzzle path. Once unlocked it behaves like
## AreaPortal.gd, moving the player to target_area_id on contact. Instantiated programmatically
## via LockedDoor.new() (OverworldManager._spawn_pois()), not from a .tscn — every child node is
## built here in code rather than assumed to already exist in a scene tree.

## Real, always-generated "ability-locked gate marker" art (see packages/assets/src/
## visual-enhancement/planner.ts) — shared with ItemGate.gd, which is the same "locked until you
## own the right item" concept gated by a different rule (any owned item vs. specifically a key).
const GENERATED_TEXTURE_PATH := "res://assets/generated/gate/interactive_ability_gate.png"

@export var key_id: String = ""
@export var door_id: String = ""
@export var target_area_id: String = ""

signal opened(method: String)

var unlocked: bool = false

var _area: Area2D
var _sprite: Sprite2D

func _ready() -> void:
	add_to_group("interactable")
	add_to_group("locked_door")
	collision_layer = 1
	collision_mask = 0

	var body_shape := CollisionShape2D.new()
	body_shape.shape = RectangleShape2D.new()
	body_shape.shape.size = Vector2(16, 16)
	add_child(body_shape)

	if ResourceLoader.exists(GENERATED_TEXTURE_PATH):
		_sprite = Sprite2D.new()
		_sprite.texture = load(GENERATED_TEXTURE_PATH)
		_sprite.offset = Vector2(0, -_sprite.texture.get_height() / 2.0)
		_sprite.scale = Vector2(0.5, 0.5)
		add_child(_sprite)
	else:
		var visual := ColorRect.new()
		visual.color = Color(0.55, 0.35, 0.2, 1.0)
		visual.position = Vector2(-8, -8)
		visual.size = Vector2(16, 16)
		add_child(visual)

	_area = Area2D.new()
	_area.collision_layer = 0
	_area.collision_mask = 2
	var area_shape := CollisionShape2D.new()
	area_shape.shape = RectangleShape2D.new()
	area_shape.shape.size = Vector2(16, 16)
	_area.add_child(area_shape)
	add_child(_area)
	_area.body_entered.connect(_on_body_entered)

func interact(_player: Node) -> void:
	if unlocked:
		return
	if key_id != "" and InventoryManager.get_owned_count(key_id) <= 0:
		return
	unlock("key" if not key_id.is_empty() else "interaction")

## Real alternate open path — called directly by a paired FloorSwitch.gd, independent of whether
## the player has the key. Public so it also works when this door is unlocked programmatically
## (e.g. a future puzzle chain), not only via interact().
func unlock(method: String = "script") -> void:
	if unlocked:
		return
	unlocked = true
	opened.emit(method)
	set_collision_layer_value(1, false)
	modulate = Color(0.5, 0.9, 0.6, 1.0)
	AudioManager.play_sfx("pickup")
	# Real motion instead of an instant tint swap — the panel visibly retracts (slides up, fades
	# toward translucent) rather than just changing color in place, giving the unlock a readable
	# "parting" beat.
	if _sprite:
		var tween := create_tween()
		tween.set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
		tween.tween_property(_sprite, "position:y", _sprite.position.y - 14.0, 0.35)
		tween.parallel().tween_property(_sprite, "modulate:a", 0.4, 0.35)

func _on_body_entered(body: Node2D) -> void:
	if not unlocked or not body.is_in_group("player") or target_area_id.is_empty():
		return
	var world_manager := get_tree().get_first_node_in_group("world_manager")
	if world_manager and world_manager.has_method("transition_to_room"):
		world_manager.transition_to_room(target_area_id, "left")
