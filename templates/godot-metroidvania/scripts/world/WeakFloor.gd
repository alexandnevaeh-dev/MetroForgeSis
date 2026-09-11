extends StaticBody2D
## Breakable floor segment — destroyed when the player lands with an active ground slam.

@export var floor_width: float = 128.0
## The room this WeakFloor gates access to — set by room-assembler.ts at instancing time.
## Combined with the owning room's node name into a save-key unique enough to identify this exact
## obstacle across a same-session room re-entry — see SaveManager.gd's
## mark_floor_broken/is_floor_broken.
@export var target_room_id: String = ""

var _broken: bool = false
var _save_key: String = ""

func _ready() -> void:
	add_to_group("weak_floor")
	# The owning room's node name, not GameManager.current_room_id: room-assembler.ts names each
	# room scene's root after its room id and instances WeakFloor directly under it, so the parent
	# name is correct the instant this node enters the tree. current_room_id is only correct once
	# WorldManager has finished swapping rooms, which is not guaranteed to have happened by the
	# time a freshly instantiated room's children run _ready() — reading it here produced a
	# different key on re-entry than the one written when the floor broke, so a floor that had
	# already been destroyed silently came back solid.
	var owning_room := get_parent()
	_save_key = "%s:%s" % [owning_room.name if owning_room != null else GameManager.current_room_id, target_room_id]
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
