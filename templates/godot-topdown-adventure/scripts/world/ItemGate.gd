class_name ItemGate
extends StaticBody2D

@export var item_id: String = "wind_disc"

func _ready() -> void:
	add_to_group("interactable")
	collision_layer = 1
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(24, 48)
	shape.shape = rect
	add_child(shape)
	var vis := ColorRect.new()
	vis.size = Vector2(24, 48)
	vis.position = Vector2(-12, -24)
	vis.color = Color(0.25, 0.45, 0.7, 1)
	add_child(vis)
	var area := Area2D.new()
	area.collision_layer = 32
	area.collision_mask = 2
	area.monitoring = true
	var ashape := CollisionShape2D.new()
	ashape.shape = rect
	area.add_child(ashape)
	area.body_entered.connect(_on_body)
	add_child(area)

func interact(_player: Node) -> void:
	_try_open()

func _on_body(body: Node2D) -> void:
	if body.is_in_group("player"):
		_try_open()

func _try_open() -> void:
	if InventoryManager.get_owned_count(item_id) <= 0 and not GameManager.has_ability(item_id):
		return
	queue_free()
