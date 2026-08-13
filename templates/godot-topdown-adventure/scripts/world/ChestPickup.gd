class_name ChestPickup
extends Area2D

@export var item_id: String = "scrap"
@export var chest_id: String = "chest"

func _ready() -> void:
	add_to_group("interactable")
	collision_layer = 32
	collision_mask = 2
	monitoring = true
	if SaveManager.get_world_flag(chest_id):
		queue_free()
		return
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(16, 16)
	shape.shape = rect
	add_child(shape)
	var vis := ColorRect.new()
	vis.size = Vector2(16, 16)
	vis.position = Vector2(-8, -8)
	vis.color = Color(0.72, 0.5, 0.18, 1)
	add_child(vis)

func interact(_player: Node) -> void:
	if SaveManager.get_world_flag(chest_id):
		return
	InventoryManager.grant_item(item_id, 1)
	SaveManager.set_world_flag(chest_id, true)
	AudioManager.play_sfx("pickup")
	queue_free()
