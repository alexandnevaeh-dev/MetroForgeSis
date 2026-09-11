extends StaticBody2D
## Breakable floor segment — destroyed when the player lands with an active ground slam.

@export var floor_width: float = 128.0
## The room this WeakFloor gates access to — set by room-assembler.ts at instancing time.
## Combined with GameManager.current_room_id (the room this instance actually lives in, read at
## _ready() since a WeakFloor carries no export of its own owning room) into a save-key unique
## enough to identify this exact obstacle across a same-session room re-entry — see
## SaveManager.gd's mark_floor_broken/is_floor_broken.
@export var target_room_id: String = ""

var _broken: bool = false
var _save_key: String = ""

func _ready() -> void:
	add_to_group("weak_floor")
	_save_key = "%s:%s" % [GameManager.current_room_id, target_room_id]
	if SaveManager.is_floor_broken(_save_key):
		_broken = true
		collision_layer = 0
		visible = false
		queue_free()
		return
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
	if _save_key != "":
		SaveManager.mark_floor_broken(_save_key)
	var tween := create_tween()
	tween.tween_property($Visual, "modulate:a", 0.0, 0.18)
	tween.tween_callback(queue_free)
	VFXManager.play("hit_spark", global_position, 1.2)
	AudioManager.play_sfx("hit")
