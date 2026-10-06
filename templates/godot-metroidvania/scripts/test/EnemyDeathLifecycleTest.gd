extends Node
## Real hurtbox route: death must survive lethal and repeated hits, then notify once.
## Functional lifecycle evidence; captures and visual quality are separate.
var checks: Array[Dictionary] = []
var rows: Array[Dictionary] = []
func check(label: String, value: bool) -> void:
	checks.append({"label": label, "passed": value})
	print("%s: %s" % ["PASS" if value else "FAIL", label])

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	GameManager.start_new_game()
	var enemies: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/enemies/enemies.json"))
	var all_defs: Array = enemies.get("enemies", [])
	if OS.get_environment("METROFORGE_DEATH_BASELINE") == "1":
		all_defs = all_defs.slice(0, 1)
	for definition in all_defs:
		await run_enemy(String(definition["id"]))
	if OS.get_environment("METROFORGE_DEATH_BASELINE") != "1":
		await run_enemy("enemy_000", true)
		await run_enemy("enemy_000", false, true)
		await run_missing_clip()
	var passed := checks.all(func(row: Dictionary) -> bool: return bool(row["passed"]))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://qa/actor-animation"))
	var file := FileAccess.open("res://qa/actor-animation/enemy-death.json", FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed": passed, "checks": checks, "rows": rows, "scope": "Real enemy hurtbox lifecycle across the generated roster; direct test hits, not input-driven combat or visual acceptance."}, "  "))
	get_tree().quit(0 if passed else 1)

func run_enemy(id: String, weighted: bool = false, pause: bool = false) -> void:
	var packed := load("res://scenes/enemies/Enemy.tscn") as PackedScene
	var enemy := packed.instantiate() as CharacterBody2D
	enemy.process_mode = Node.PROCESS_MODE_PAUSABLE
	enemy.set("enemy_id", id)
	var sprite := enemy.get_node("Sprite") as AnimatedSprite2D
	for pair in [["sheet_path", "walk"], ["run_sheet_path", "run"], ["hurt_sheet_path", "hurt"], ["death_sheet_path", "death"], ["attack_sheet_path", "attack"]]:
		sprite.set(String(pair[0]), "assets/enemies/%s_%s.png" % [id, pair[1]])
	sprite.set("extra_animation_sheets", {"idle": "assets/enemies/%s_idle.png" % id})
	enemy.position = Vector2(360, 600)
	add_child(enemy)
	enemy.set_physics_process(false)
	await get_tree().process_frame
	var health := enemy.get_node("HealthComponent") as HealthComponent
	var hurtbox := enemy.get_node("HurtboxComponent") as HurtboxComponent
	var frames := sprite.sprite_frames
	if weighted:
		frames.set_frame("death", 0, frames.get_frame_texture("death", 0), 2.0)
	sprite.speed_scale = 2.8
	var count := frames.get_frame_count("death")
	var duration := 0.0
	for index in range(count):
		duration += frames.get_frame_duration("death", index) / frames.get_animation_speed("death")
	var killed_at := [-1, 0]
	var callback := func(event_id: String) -> void:
		if event_id == id:
			killed_at[0] = Time.get_ticks_msec()
			killed_at[1] += 1
	EventBus.enemy_killed.connect(callback)
	var started := Time.get_ticks_msec()
	hurtbox.receive_hit(health.current_health, 20.0, null)
	check(id + " lethal hit starts death rather than hurt", sprite.animation == "death")
	check(id + " terminal clip resets locomotion speed scaling", is_equal_approx(sprite.speed_scale, 1.0))
	hurtbox.receive_hit(5.0, 20.0, null)
	check(id + " further hit cannot interrupt death", sprite.animation == "death")
	var seen: Dictionary = {}
	var wrong_clip := false
	var pause_ms := 0
	if pause:
		var frame_before := sprite.frame
		get_tree().paused = true
		var pause_start := Time.get_ticks_msec()
		while Time.get_ticks_msec() < pause_start + 150:
			await get_tree().process_frame
		pause_ms = Time.get_ticks_msec() - pause_start
		check("paused death retains its frame and does not notify", sprite.frame == frame_before and killed_at[1] == 0)
		get_tree().paused = false
	while is_instance_valid(enemy) and Time.get_ticks_msec() < started + int(duration * 1000.0) + pause_ms + 500:
		if sprite.animation == "death":
			seen[sprite.frame] = true
		else:
			wrong_clip = true
		await get_tree().process_frame
	var elapsed := int(killed_at[0]) - started if killed_at[0] >= 0 else -1
	check(id + " completes the entire death frame sequence", not wrong_clip and seen.size() == count)
	check(id + " kill event follows the authored clip once", killed_at[1] == 1 and elapsed >= int(duration * 1000.0) + pause_ms - 30 and elapsed <= int(duration * 1000.0) + pause_ms + 250)
	check(id + " dead actor is removed", not is_instance_valid(enemy))
	rows.append({"enemy": id, "weighted": weighted, "pauseMs": pause_ms, "expectedMs": duration * 1000.0 + pause_ms, "observedMs": elapsed, "deathFramesSeen": seen.size(), "expectedFrames": count, "killEvents": killed_at[1]})
	EventBus.enemy_killed.disconnect(callback)
	if is_instance_valid(enemy):
		enemy.queue_free()
		await get_tree().process_frame

func run_missing_clip() -> void:
	var enemy := (load("res://scenes/enemies/Enemy.tscn") as PackedScene).instantiate()
	enemy.enemy_id = "enemy_000"
	add_child(enemy)
	enemy.set_physics_process(false)
	var sprite := enemy.get_node("Sprite") as AnimatedSprite2D
	sprite.sprite_frames.remove_animation("death")
	var events := [0]
	var callback := func(id: String) -> void:
		if id == "enemy_000":
			events[0] += 1
	EventBus.enemy_killed.connect(callback)
	var health := enemy.get_node("HealthComponent") as HealthComponent
	(enemy.get_node("HurtboxComponent") as HurtboxComponent).receive_hit(health.current_health, 0, null)
	await get_tree().process_frame
	check("missing death clip still notifies once", events[0] == 1)
	check("missing death clip cannot leave a dead enemy in the world", not is_instance_valid(enemy))
	EventBus.enemy_killed.disconnect(callback)
