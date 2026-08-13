class_name AreaPortal
extends Area2D

@export var target_area_id: String = "overworld"

func _ready() -> void:
	collision_layer = 32
	collision_mask = 2
	monitoring = true
	body_entered.connect(_on_body_entered)
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(20, 20)
	shape.shape = rect
	add_child(shape)
	var vis := ColorRect.new()
	vis.size = Vector2(20, 20)
	vis.position = Vector2(-10, -10)
	vis.color = Color(0.35, 0.2, 0.55, 1)
	add_child(vis)

func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return
	var world := get_tree().get_first_node_in_group("world_manager")
	if world and world.has_method("load_area"):
		world.load_area(target_area_id)
