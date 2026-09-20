extends Area2D

## Submerged volume — swim ability unlocks free movement inside.

@export var zone_width: float = 320.0
@export var zone_height: float = 120.0

func _ready() -> void:
	add_to_group("water_zone")
	collision_layer = 0
	collision_mask = 2
	monitoring = true
	_apply_size()
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)


func _apply_size() -> void:
	var shape_node := get_node_or_null("CollisionShape2D") as CollisionShape2D
	if shape_node and shape_node.shape is RectangleShape2D:
		var rect := (shape_node.shape as RectangleShape2D).duplicate() as RectangleShape2D
		rect.size = Vector2(zone_width, zone_height)
		shape_node.shape = rect
		shape_node.position = Vector2(0, zone_height * 0.5)
	var vis := get_node_or_null("Visual") as ColorRect
	if vis:
		vis.offset_left = -zone_width * 0.5
		vis.offset_top = 0.0
		vis.offset_right = zone_width * 0.5
		vis.offset_bottom = zone_height


func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player") and body.has_method("enter_water"):
		body.enter_water()


func _on_body_exited(body: Node2D) -> void:
	if body.is_in_group("player") and body.has_method("exit_water"):
		body.exit_water()
