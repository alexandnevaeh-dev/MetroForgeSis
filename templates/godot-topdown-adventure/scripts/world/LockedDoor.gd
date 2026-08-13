class_name LockedDoor
extends StaticBody2D
## A key-gated inter-area door. Solid and interact-only until unlocked — either the player has
## the required key item (InventoryManager, checked via interact()) or a paired FloorSwitch.gd
## calls unlock() directly, a real alternate puzzle path. Once unlocked it behaves like
## AreaPortal.gd, moving the player to target_area_id on contact. Instantiated programmatically
## via LockedDoor.new() (OverworldManager._spawn_pois()), not from a .tscn — every child node is
## built here in code rather than assumed to already exist in a scene tree.

@export var key_id: String = ""
@export var door_id: String = ""
@export var target_area_id: String = ""

var unlocked: bool = false

var _area: Area2D

func _ready() -> void:
	add_to_group("interactable")
	add_to_group("locked_door")
	collision_layer = 1
	collision_mask = 0

	var body_shape := CollisionShape2D.new()
	body_shape.shape = RectangleShape2D.new()
	body_shape.shape.size = Vector2(16, 16)
	add_child(body_shape)

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
	unlock()

## Real alternate open path — called directly by a paired FloorSwitch.gd, independent of whether
## the player has the key. Public so it also works when this door is unlocked programmatically
## (e.g. a future puzzle chain), not only via interact().
func unlock() -> void:
	if unlocked:
		return
	unlocked = true
	set_collision_layer_value(1, false)
	modulate = Color(0.5, 0.9, 0.6, 1.0)
	AudioManager.play_sfx("pickup")

func _on_body_entered(body: Node2D) -> void:
	if not unlocked or not body.is_in_group("player") or target_area_id.is_empty():
		return
	var world_manager := get_tree().get_first_node_in_group("world_manager")
	if world_manager and world_manager.has_method("transition_to_room"):
		world_manager.transition_to_room(target_area_id, "left")
