class_name FloorSwitch
extends Area2D

## No dedicated "switch" asset family exists — the ability-pickup medallion (a real, always-
## generated round disc/glow icon) reads reasonably as a floor-mounted pressure plate once
## recolored and flattened against the ground (no offset, unlike a stand-up icon), distinct from
## the checkpoint/gate/chest/portal icons used elsewhere so it isn't confused with any of them.
const GENERATED_TEXTURE_PATH := "res://assets/generated/pickup/interactive_ability_pickup.png"
const UNPRESSED_MODULATE := Color(0.85, 0.95, 0.6, 1.0)
const PRESSED_MODULATE := Color(0.5, 0.5, 0.5, 1.0)

@export var opens_door_id: String = ""

var _sprite: CanvasItem

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

	if ResourceLoader.exists(GENERATED_TEXTURE_PATH):
		var sprite := Sprite2D.new()
		sprite.texture = load(GENERATED_TEXTURE_PATH)
		sprite.scale = Vector2(0.7, 0.5)
		sprite.modulate = UNPRESSED_MODULATE
		add_child(sprite)
		_sprite = sprite
	else:
		var vis := ColorRect.new()
		vis.size = Vector2(18, 18)
		vis.position = Vector2(-9, -9)
		vis.color = Color(0.75, 0.7, 0.2, 1)
		add_child(vis)
		_sprite = vis

func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return
	if _sprite:
		# A real press-down beat (a quick flatten-and-settle) instead of an instant tint swap.
		var tween := create_tween()
		tween.tween_property(_sprite, "modulate", PRESSED_MODULATE, 0.15)
		tween.parallel().tween_property(_sprite, "scale:y", _sprite.scale.y * 0.6, 0.15)
	for door in get_tree().get_nodes_in_group("locked_door"):
		if door is LockedDoor and door.door_id == opens_door_id:
			door.unlock()
