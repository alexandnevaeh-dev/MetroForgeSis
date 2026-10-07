extends Node
## Real-world journey: Input actions only; no actor/health/door mutations.
## This scene name deliberately keeps production fades and hit-stop enabled.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")

var agent: PlaytestAgent
var world: Node2D
var samples: Array = []
var captures: Array = []
var room_states: Array = []
var next_sample: int = 0
var capturing: bool = false
var started: int = 0
var death_captures_pending: int = 0

func _ready() -> void:
	if CaptureGuard.refuse_if_visual_unsupported():
		get_tree().quit(2)
		return
	started = Time.get_ticks_msec()
	seed(20261004)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://qa/input-journey"))
	GameManager.start_new_game()
	world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	EventBus.room_entered.connect(_room_entered)
	for _tick in range(6):
		await get_tree().physics_frame
	agent = PlaytestAgent.new()
	_room_entered(GameManager.current_room_id)
	var outcome: Dictionary = await agent.run(world, self)
	while death_captures_pending > 0:
		await get_tree().process_frame
	await _capture("end")
	# Freeze the observer before freeing actors. Otherwise a teardown tick can
	# overwrite the last live status with health=-1 and steps=0 after victory.
	set_process(false)
	_record_progress()
	var result := {"scope": "Actual NVIDIA gameplay with normal fades/hit-stop and Input-only walking, jumping, attacks and dodges. Bot observations are read-only; no human or final art acceptance claim.",
		"passed": bool(outcome.get("ok", false)), "outcome": outcome, "samples": samples, "captures": captures, "roomStates": room_states,
		"renderer": RenderingServer.get_current_rendering_method(), "elapsedMs": Time.get_ticks_msec() - started,
		"bossesDefeated": ProgressionManager.get_defeated_bosses(), "abilities": ProgressionManager.get_unlocked_abilities()}
	_write_json("proof.json", result)
	print("JOURNEY_RESULT " + JSON.stringify({"passed": result.passed, "room": GameManager.current_room_id, "reason": outcome.get("reason"), "stage": outcome.get("failStage", agent._fail_stage), "steps": agent.steps_completed}))
	agent._release_horizontal_input()
	Input.action_release("attack")
	world.queue_free()
	world = null
	agent = null
	await get_tree().process_frame
	await get_tree().process_frame
	AudioManager.request_quit(0 if result.passed else 1)

func _process(_delta: float) -> void:
	if Time.get_ticks_msec() < next_sample:
		return
	next_sample = Time.get_ticks_msec() + 1000
	_record_progress()

func _record_progress() -> void:
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	var health := player.get_node_or_null("HealthComponent") as HealthComponent if player else null
	var row := {"tMs": Time.get_ticks_msec() - started, "room": GameManager.current_room_id,
		"player": [player.position.x, player.position.y] if player else [], "velocity": [player.velocity.x, player.velocity.y] if player else [],
		"health": health.current_health if health else -1.0, "steps": agent.steps_completed if agent else 0,
		"attacks": agent.attacks_performed if agent else 0, "bosses": ProgressionManager.get_defeated_bosses()}
	samples.append(row)
	_write_json("progress.json", row)
	if samples.size() % 5 == 0:
		print("JOURNEY_PROGRESS " + JSON.stringify(row))

func _room_entered(id: String) -> void:
	print("JOURNEY_ROOM " + id)
	var boss := get_tree().get_first_node_in_group("bosses")
	if boss and boss.has_node("HealthComponent"):
		boss.get_node("HealthComponent").died.connect(_capture_death.bind(String(boss.get("boss_id"))), CONNECT_ONE_SHOT)
	# Snapshot synchronously: a legitimate return can leave again within 0.5 seconds.
	# Waiting for the presentation capture first silently loses those room visits.
	var room: Node = world._current_room if world else null
	var current_boss: Node = room.get_node_or_null("Boss") if room else null
	var doors: Array = world._room_transitions(room) if room else []
	room_states.append({"room": id, "tMs": Time.get_ticks_msec() - started,
		"bossPresent": current_boss != null, "defeatedBosses": ProgressionManager.get_defeated_bosses(),
		"exitsOpen": not doors.is_empty() and doors.all(func(door): return door.monitoring),
		"music": AudioManager.get_current_music_id()})
	await get_tree().create_timer(0.5).timeout
	if GameManager.current_room_id == id:
		await _capture(id)

func _capture_death(id: String) -> void:
	death_captures_pending += 1
	for frame in range(18):
		await _capture("%s_death_%02d" % [id, frame])
		await get_tree().create_timer(0.06).timeout
	death_captures_pending -= 1

func _capture(label: String) -> void:
	if capturing:
		return
	capturing = true
	if await CaptureGuard.await_post_draw(self):
		var image := get_viewport().get_texture().get_image()
		var file := "%03d_%s.png" % [captures.size(), label]
		var error := image.save_png("res://qa/input-journey/" + file)
		if error == OK:
			captures.append({"file": file, "room": GameManager.current_room_id, "tMs": Time.get_ticks_msec() - started})
	capturing = false

func _write_json(name: String, value: Variant) -> void:
	var file := FileAccess.open("res://qa/input-journey/" + name, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(value, "\t"))
