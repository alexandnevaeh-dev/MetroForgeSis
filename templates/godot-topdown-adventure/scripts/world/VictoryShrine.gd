class_name VictoryShrine
extends Area2D

func _ready() -> void:
	add_to_group("interactable")
	collision_layer = 32
	collision_mask = 2
	monitoring = true
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(20, 20)
	shape.shape = rect
	add_child(shape)
	var vis := ColorRect.new()
	vis.size = Vector2(20, 20)
	vis.position = Vector2(-10, -10)
	vis.color = Color(0.9, 0.85, 0.3, 1)
	add_child(vis)

func interact(_player: Node) -> void:
	EventBus.boss_defeated.emit("boss_final")
