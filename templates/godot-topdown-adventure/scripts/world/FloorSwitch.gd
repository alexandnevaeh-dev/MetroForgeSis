class_name FloorSwitch
extends Area2D

@export var opens_door_id: String = ""

func _ready() -> void:
	collision_layer = 32
	collision_mask = 2
	monitoring = true
	body_entered.connect(_on_body_entered)
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(18, 18)
	shape.shape = rect
	add_child(shape)
	var vis := ColorRect.new()
	vis.size = Vector2(18, 18)
	vis.position = Vector2(-9, -9)
	vis.color = Color(0.75, 0.7, 0.2, 1)
	add_child(vis)

func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return
	for door in get_tree().get_nodes_in_group("locked_door"):
		if door is LockedDoor and door.door_id == opens_door_id:
			door.unlock()
