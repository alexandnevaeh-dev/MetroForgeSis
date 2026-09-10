class_name AreaPortal
extends Area2D

const GENERATED_TEXTURE_PATH := "res://assets/generated/portal/interactive_portal.png"

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

	if ResourceLoader.exists(GENERATED_TEXTURE_PATH):
		var sprite := Sprite2D.new()
		sprite.texture = load(GENERATED_TEXTURE_PATH)
		add_child(sprite)
		# Restrained ambient loop — a slow, subtle breathing pulse so an active portal reads as
		# "alive" at a glance rather than a static icon, without competing with combat VFX.
		var pulse := create_tween()
		pulse.set_loops()
		pulse.set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
		pulse.tween_property(sprite, "scale", Vector2(1.08, 1.08), 0.9)
		pulse.tween_property(sprite, "scale", Vector2.ONE, 0.9)
	else:
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
