extends Node
## Headless check: lethal hit plays death for clip length, ignores further hits, then victory.
## Does not capture frames. Combat damage values are not modified.

const TELEMETRY_PATH := "user://boss_death_lifecycle_telemetry.json"

var telemetry: Dictionary = {}

func _ready() -> void:
	telemetry = {
		"test_passed": false,
		"failure_stage": "",
		"death_anim_frames": 0,
		"hurt_after_lethal": false,
		"defeated_delay_ms": -1,
		"expected_death_ms": -1,
		"boss_freed_before_clip": false,
		"victory": false,
	}
	GameManager.start_new_game()
	GameManager.current_state = GameManager.GameState.PLAYING
	await get_tree().process_frame
	await _run()
	_finish()


func _run() -> void:
	var packed := load("res://scenes/bosses/Boss.tscn") as PackedScene
	if packed == null:
		_fail("BOSS_SCENE_MISSING")
		return
	var boss := packed.instantiate()
	boss.boss_id = "boss_final"
	add_child(boss)
	await get_tree().process_frame
	await get_tree().process_frame

	var health: HealthComponent = boss.get_node_or_null("HealthComponent")
	var sprite: AnimatedSprite2D = boss.get_node_or_null("Sprite")
	if health == null or sprite == null:
		_fail("BOSS_NODES_MISSING")
		return
	if sprite.sprite_frames == null or not sprite.sprite_frames.has_animation("death"):
		_fail("DEATH_ANIM_MISSING")
		return

	var fps := sprite.sprite_frames.get_animation_speed("death")
	var count := sprite.sprite_frames.get_frame_count("death")
	var expected_ms := int((float(count) / fps) * 1000.0) if fps > 0.0 else 0
	telemetry["expected_death_ms"] = expected_ms

	var defeated_at := [-1]
	EventBus.boss_defeated.connect(func(_id: String) -> void:
		defeated_at[0] = Time.get_ticks_msec()
	, CONNECT_ONE_SHOT)

	var lethal_at := Time.get_ticks_msec()
	health.take_damage(health.current_health)

	# A follow-up hit must not replace death with hurt or deal more damage.
	if boss.has_method("_on_hit_received"):
		boss.call("_on_hit_received", 10.0, Vector2.ZERO)

	var death_frames := 0
	var deadline := Time.get_ticks_msec() + expected_ms + 400
	while Time.get_ticks_msec() < deadline:
		if not is_instance_valid(boss):
			if defeated_at[0] < 0:
				telemetry["boss_freed_before_clip"] = true
			break
		var anim := String(sprite.animation) if is_instance_valid(sprite) else ""
		if anim == "death":
			death_frames += 1
		elif anim == "hurt":
			telemetry["hurt_after_lethal"] = true
		await get_tree().process_frame

	telemetry["death_anim_frames"] = death_frames
	if defeated_at[0] >= 0:
		telemetry["defeated_delay_ms"] = defeated_at[0] - lethal_at

	if death_frames < 8:
		_fail("DEATH_ANIM_TOO_SHORT")
		return
	if bool(telemetry["hurt_after_lethal"]):
		_fail("HURT_INTERRUPTED_DEATH")
		return
	if bool(telemetry["boss_freed_before_clip"]):
		_fail("FREED_BEFORE_DEATH_CLIP")
		return
	if defeated_at[0] < 0:
		_fail("BOSS_DEFEATED_NOT_EMITTED")
		return
	# Clip is ~1000ms; allow the 50ms pad, reject a long extra hold.
	var delay: int = int(telemetry["defeated_delay_ms"])
	if delay < int(expected_ms * 0.7):
		_fail("DEFEATED_TOO_EARLY")
		return
	if delay > expected_ms + 250:
		_fail("DEFEATED_TOO_LATE")
		return
	if GameManager.current_state != GameManager.GameState.VICTORY or not GameManager.game_complete:
		_fail("VICTORY_NOT_SET")
		return
	telemetry["victory"] = true
	telemetry["test_passed"] = true


func _fail(stage: String) -> void:
	telemetry["failure_stage"] = stage
	telemetry["test_passed"] = false


func _finish() -> void:
	print("BOSS_DEATH_LIFECYCLE_PATH: %s" % ProjectSettings.globalize_path(TELEMETRY_PATH))
	var file := FileAccess.open(TELEMETRY_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(telemetry, "\t"))
		file.close()
	print("BOSS_DEATH_LIFECYCLE: %s" % JSON.stringify(telemetry))
	get_tree().quit(0 if bool(telemetry["test_passed"]) else 1)
