class_name LockedDoor
extends Area2D

@export var key_id: String = "rusted_key"
@export var target_area_id: String = ""
@export var door_id: String = "door"
var unlocked := false

func _ready() -> void:
	add_to_group("interactable")
	add_to_group("locked_door")
	collision_layer = 32
	collision_mask = 2
	monitoring = true
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(24, 16)
	shape.shape = rect
	add_child(shape)
	_paint()

func unlock() -> void:
	unlocked = true
	_paint()

func interact(_player: Node) -> void:
	if unlocked or InventoryManager.get_owned_count(key_id) > 0:
		unlocked = true
		var world := get_tree().get_first_node_in_group("world_manager")
		if world and world.has_method("load_area") and not target_area_id.is_empty():
			world.load_area(target_area_id)

func _paint() -> void:
	for child in get_children():
		if child is ColorRect:
			child.color = Color(0.4, 0.7, 0.35, 1) if unlocked else Color(0.45, 0.22, 0.18, 1)
			return
	var vis := ColorRect.new()
	vis.size = Vector2(24, 16)
	vis.position = Vector2(-12, -8)
	vis.color = Color(0.45, 0.22, 0.18, 1)
	add_child(vis)
