extends Node
## Normal-speed courier sequence + live clamp-mite. Not a feel verdict.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")
const QA := "res://qa/visual-polish/foundry-pass2"
const MOTION := "res://qa/visual-polish/foundry-pass2/motion"

var _recording_clip: String = ""
var _clip_max: int = 280
var _clip_frames: Array[Image] = []
var _mite_cam: Camera2D = null

func _ready() -> void:
	if CaptureGuard.refuse_if_visual_unsupported():
		get_tree().quit(CaptureGuard.EXIT_DUMMY)
		return
	process_mode = Node.PROCESS_MODE_ALWAYS
	GameManager.start_new_game()
	await get_tree().process_frame
	var packed := load("res://scenes/world/World.tscn") as PackedScene
	if packed == null:
		print("FOUNDRY_MOTION_FAIL world")
		get_tree().quit(1)
		return
	add_child(packed.instantiate())
	if not await CaptureGuard.await_physics_frames(self, 4, 4.0):
		get_tree().quit(CaptureGuard.EXIT_TIMEOUT)
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(QA))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(MOTION))
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	if player:
		var health := player.get_node_or_null("HealthComponent")
		if health:
			health.set("invulnerable", true)
	await _courier_sequence(player)
	player = get_tree().get_first_node_in_group("player") as CharacterBody2D
	await _combo_sequence(player)
	player = get_tree().get_first_node_in_group("player") as CharacterBody2D
	await _npc_sequence(player)
	await _room_stills()
	player = get_tree().get_first_node_in_group("player") as CharacterBody2D
	await _mite_sequence()
	print("FOUNDRY_MOTION_OK")
	get_tree().quit(0)


func _process(_delta: float) -> void:
	if _recording_clip == "" or _clip_frames.size() >= _clip_max:
		return
	if CaptureGuard.is_dummy_renderer():
		return
	var img := get_viewport().get_texture().get_image()
	if img == null or img.is_empty():
		return
	img.convert(Image.FORMAT_RGBA8)
	img.resize(960, 540, Image.INTERPOLATE_NEAREST)
	_clip_frames.append(img)


func _courier_sequence(player: CharacterBody2D) -> void:
	if player == null:
		return
	await _record_clip("courier_start_walk_stop_reverse_run_jump_land_attack", func():
		for _idle in 16:
			await get_tree().physics_frame
		Input.action_press("move_right")
		for _walk in 28:
			await get_tree().physics_frame
		Input.action_release("move_right")
		for _stop in 14:
			await get_tree().physics_frame
		Input.action_press("move_left")
		for _rev in 24:
			await get_tree().physics_frame
		Input.action_release("move_left")
		Input.action_press("move_down")
		Input.action_press("move_right")
		for _run in 20:
			await get_tree().physics_frame
		Input.action_release("move_down")
		Input.action_press("jump")
		await get_tree().physics_frame
		Input.action_release("jump")
		for _air in 22:
			await get_tree().physics_frame
		Input.action_release("move_right")
		for _land in 10:
			await get_tree().physics_frame
		Input.action_press("attack")
		await get_tree().physics_frame
		Input.action_release("attack")
		for _atk in 18:
			await get_tree().physics_frame
	)
	await _shot("after/courier_sequence_end")


func _combo_sequence(player: CharacterBody2D) -> void:
	if player == null:
		return
	await _record_clip("courier_attack_combo_123", func():
		Input.action_press("attack")
		await get_tree().physics_frame
		Input.action_release("attack")
		for _a in 22:
			await get_tree().physics_frame
		Input.action_press("attack")
		await get_tree().physics_frame
		Input.action_release("attack")
		for _b in 28:
			await get_tree().physics_frame
		Input.action_press("attack")
		await get_tree().physics_frame
		Input.action_release("attack")
		for _c in 24:
			await get_tree().physics_frame
	)
	await _shot("after/courier_combo_end")


func _npc_sequence(player: CharacterBody2D) -> void:
	await _load_room("room_006")
	player = get_tree().get_first_node_in_group("player") as CharacterBody2D
	var npc := _find_npc()
	if npc == null:
		print("FOUNDRY_MOTION_NPC_MISSING")
		return
	_lock_camera_on(npc)
	if player:
		player.global_position = npc.global_position + Vector2(-70, 0)
		player.velocity = Vector2.ZERO
	await _record_clip("npc_idle", func():
		for _i in 28:
			await get_tree().physics_frame
	)
	await _shot("after/npc_idle")
	if player:
		player.global_position = npc.global_position + Vector2(20, 0)
	await _record_clip("npc_listen", func():
		for _l in 24:
			await get_tree().physics_frame
	)
	await _shot("after/npc_listen")
	Input.action_press("interact")
	await get_tree().physics_frame
	Input.action_release("interact")
	await _record_clip("npc_talk", func():
		for _t in 28:
			await get_tree().physics_frame
	)
	await _shot("after/npc_talk")
	var overlay := _dialogue_overlay()
	if overlay and overlay.has_method("close_dialogue"):
		overlay.call("close_dialogue")
	await get_tree().process_frame
	var live_player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	_release_camera(live_player)


func _dialogue_overlay() -> Node:
	return get_tree().get_first_node_in_group("dialogue_overlay")


func _room_stills() -> void:
	await _load_room("room_000")
	await _shot("after/biome_0_pouring_bay")
	await _load_room("room_001")
	await _shot("after/biome_1_quench_tunnels")
	await _load_room("room_002")
	await _shot("after/biome_2_cooling_yards")
	await _shot("after/room_002_overlay")


func _mite_sequence() -> void:
	await _load_room("room_002")
	var player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	var mite := _find_enemy()
	if mite == null:
		print("FOUNDRY_MOTION_MITE_MISSING")
		return
	_lock_camera_on(mite)
	if player:
		player.global_position = mite.global_position + Vector2(-80, 0)
		player.velocity = Vector2.ZERO
	await _record_clip("mite_walk_turn", func():
		for _w in 70:
			await get_tree().physics_frame
	)
	await _shot("after/mite_live_walk")
	if player:
		player.global_position = mite.global_position + Vector2(-48, 0)
	await _record_clip("mite_attack_recover", func():
		for _a in 50:
			await get_tree().physics_frame
	)
	await _shot("after/mite_live_attack")
	if mite.has_method("_on_hit_received"):
		mite.call("_on_hit_received", 10.0, Vector2(-40, 0))
	await _record_clip("mite_hurt", func():
		for _h in 20:
			await get_tree().physics_frame
	)
	await _shot("after/mite_live_hurt")
	var health := mite.get_node_or_null("HealthComponent")
	if health and health.has_method("take_damage"):
		health.call("take_damage", 10000.0)
	await _record_clip("mite_death", func():
		for _d in 10:
			await get_tree().physics_frame
		await _shot("after/mite_live_death")
		for _d2 in 24:
			await get_tree().physics_frame
			if not is_instance_valid(mite):
				break
	)
	var live_player := get_tree().get_first_node_in_group("player") as CharacterBody2D
	_release_camera(live_player)


func _lock_camera_on(target: Node2D) -> void:
	if _mite_cam and is_instance_valid(_mite_cam):
		_mite_cam.queue_free()
	_mite_cam = Camera2D.new()
	_mite_cam.name = "MiteCam"
	_mite_cam.position = Vector2(-36, -12)
	_mite_cam.zoom = Vector2(3.0, 3.0)
	target.add_child(_mite_cam)
	_mite_cam.make_current()


func _release_camera(player: CharacterBody2D) -> void:
	if player and is_instance_valid(player):
		var cam := player.get_node_or_null("Camera2D") as Camera2D
		if cam:
			cam.make_current()
	if _mite_cam and is_instance_valid(_mite_cam):
		_mite_cam.queue_free()
		_mite_cam = null


func _load_room(room_id: String) -> void:
	var wm := get_tree().get_first_node_in_group("world_manager")
	if wm and wm.has_method("transition_to_room"):
		wm.transition_to_room(room_id, "left")
		await get_tree().create_timer(0.45).timeout


func _record_clip(name: String, work: Callable) -> void:
	_recording_clip = name
	_clip_frames.clear()
	await work.call()
	_recording_clip = ""
	var dir := "%s/%s" % [MOTION, name]
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var saved := 0
	for i in _clip_frames.size():
		var img: Image = _clip_frames[i]
		img.save_png(ProjectSettings.globalize_path("%s/f%03d.png" % [dir, i]))
		saved += 1
	_clip_frames.clear()
	print("FOUNDRY_MOTION_CLIP %s frames=%d" % [name, saved])


func _shot(name: String) -> void:
	if not await CaptureGuard.await_frames(self, 2, 2.0):
		return
	var tex := get_viewport().get_texture()
	if tex == null:
		return
	var img := tex.get_image()
	if img and not img.is_empty():
		img.save_png(ProjectSettings.globalize_path("%s/%s.png" % [QA, name]))
		print("FOUNDRY_MOTION_SHOT %s" % name)


func _find_enemy() -> Node2D:
	var grouped := get_tree().get_nodes_in_group("enemies")
	if grouped.size() > 0:
		return grouped[0] as Node2D
	return null


func _find_npc() -> Node2D:
	for n in get_tree().get_nodes_in_group("npcs"):
		if is_instance_valid(n):
			return n as Node2D
	var room := get_tree().get_first_node_in_group("current_room")
	if room == null:
		var wm := get_tree().get_first_node_in_group("world_manager")
		if wm:
			room = wm.get("current_room") as Node
	if room:
		var named := room.get_node_or_null("NPC_0")
		if named:
			return named as Node2D
		for child in room.get_children():
			if String(child.name).begins_with("NPC") and child is Node2D:
				return child as Node2D
	return null
