extends Node

var checks: Array = []

func check(label: String, passed: bool) -> void:
	checks.append({"label": label, "passed": passed})
	print("FEEDBACK_CHECK " + JSON.stringify(checks.back()))

func _ready() -> void:
	var actor := Node2D.new()
	var sprite := Sprite2D.new()
	sprite.name = "Sprite"
	sprite.modulate = Color(0.7, 0.8, 0.9, 0.65)
	actor.add_child(sprite)
	var camera := Camera2D.new()
	camera.name = "Camera2D"
	camera.offset = Vector2(8, 12)
	actor.add_child(camera)
	add_child(actor)
	var original := sprite.modulate
	CombatFeedback.flash_ms = 90
	CombatFeedback._flash_sprite(actor)
	check("first hit changes the sprite", sprite.modulate != original)
	CombatFeedback._flash_sprite(actor)
	await get_tree().create_timer(0.15, true, false, true).timeout
	check("overlapping flashes restore the original tint and alpha", sprite.modulate == original)
	var original_offset := camera.offset
	seed(20261005)
	CombatFeedback._nudge_camera(actor, 1.0)
	CombatFeedback._nudge_camera(actor, 1.0)
	await get_tree().create_timer(0.1, true, false, true).timeout
	check("overlapping shakes restore the original camera offset", camera.offset == original_offset)
	CombatFeedback.hitstop_ms = 20
	CombatFeedback._hitstop()
	check("hit-stop starts", is_equal_approx(Engine.time_scale, 0.15))
	await get_tree().create_timer(0.1, true, false, true).timeout
	check("hit-stop restores normal time", is_equal_approx(Engine.time_scale, 1.0))
	CombatFeedback._flash_sprite(actor)
	CombatFeedback._nudge_camera(actor, 1.0)
	actor.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	check("effect target can be freed while effects are pending", not is_instance_valid(actor))
	check("removed targets leave no feedback records", CombatFeedback._flashes.is_empty() and CombatFeedback._shakes.is_empty())
	check("removed targets leave no timer children", CombatFeedback.get_child_count() == 0)
	var temporary: Node = load("res://scripts/combat/CombatFeedback.gd").new()
	add_child(temporary)
	temporary._hitstop()
	temporary.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	check("removing the feedback service restores its hit-stop", is_equal_approx(Engine.time_scale, 1.0))
	CombatFeedback._hitstop()
	Engine.time_scale = 0.0
	CombatFeedback._finish_hitstop()
	check("ending hit-stop preserves an external pause", Engine.time_scale == 0.0)
	Engine.time_scale = 1.0
	var passed := checks.all(func(item): return item.passed)
	var file := FileAccess.open("res://feedback-proof.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed": passed, "checks": checks, "scope": "Controlled production feedback overlap and target-removal regression; no gameplay feel or artistic acceptance."}, "\t"))
	file.close()
	AudioManager.request_quit(0 if passed else 1)
