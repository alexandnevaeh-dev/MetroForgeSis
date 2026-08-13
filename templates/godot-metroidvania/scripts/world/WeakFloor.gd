extends StaticBody2D
## Breakable floor segment — destroyed when the player lands with an active ground slam.

@export var floor_width: float = 128.0

var _broken: bool = false

func _ready() -> void:
	add_to_group("weak_floor")
	collision_layer = 1
	collision_mask = 0
	$CollisionShape2D.shape.size.x = floor_width
	$Visual.size.x = floor_width
	$Visual.position.x = -floor_width / 2.0

func break_from_slam() -> void:
	if _broken:
		return
	_broken = true
	collision_layer = 0
	set_deferred("monitorable", false)
	var tween := create_tween()
	tween.tween_property($Visual, "modulate:a", 0.0, 0.18)
	tween.tween_callback(queue_free)
	VFXManager.play("hit_spark", global_position, 1.2)
	AudioManager.play_sfx("hit")
