extends Node2D

## Continuous camera verification: drive the real PlayerController with actual input (held
## move_right + timed jumps) so the player moves under normal physics, advance the real gameplay
## camera (CameraDirector), and record every other frame. Logs, per frame, whether the nearest
## upcoming platform landing / room exit is inside the camera view BEFORE the player reaches it,
## through camera smoothing and movement. No teleporting between sampled positions.

var out_dir := ""
var _rooms := ["room_000", "room_001", "room_002", "room_003", "room_008", "room_009"]  # tutorial, traversal(960w), combat, challenge, save, boss(960w)
var findings := {}

func _ready() -> void:
	DisplayServer.window_set_size(Vector2i(1920, 1080))
	out_dir = OS.get_environment("REC_OUT")
	for rid in _rooms:
		await _run_room(rid)
	var f := FileAccess.open("%s/findings.json" % out_dir, FileAccess.WRITE)
	f.store_string(JSON.stringify(findings, "  "))
	f.close()
	print("REC_DONE")
	get_tree().quit()

func _rooms_json() -> Dictionary:
	var f := FileAccess.open("res://data/rooms/rooms.json", FileAccess.READ)
	if f == null:
		return {}
	var d = JSON.parse_string(f.get_as_text())
	f.close()
	return d.get("rooms", d) if typeof(d) == TYPE_DICTIONARY else {}

func _run_room(rid: String) -> void:
	for c in get_children():
		c.queue_free()
	await get_tree().process_frame
	var packed: PackedScene = load("res://scenes/rooms/%s.tscn" % rid)
	var scene: Node = packed.instantiate()
	add_child(scene)
	await get_tree().process_frame
	var data: Dictionary = _rooms_json().get(rid, {})
	var size := Vector2(float(data.get("width", 800)), float(data.get("height", 600)))
	var player := scene.get_node_or_null("Player") as Node2D
	if player == null:
		return
	var cam: Node = player.get_node_or_null("Camera2D")
	# Real collidable platforms (landings) + transitions (exits) as world rects.
	var floor_top := size.y - 64.0
	var floor_node: Node = scene.get_node_or_null("Floor")
	if floor_node:
		var fcs := floor_node.get_node_or_null("CollisionShape2D") as CollisionShape2D
		if fcs and fcs.shape is RectangleShape2D:
			floor_top = fcs.global_position.y - (fcs.shape as RectangleShape2D).size.y * 0.5
	var targets := []
	for child in scene.get_children():
		if child is StaticBody2D and String(child.name).begins_with("Platform"):
			var cs := child.get_node_or_null("CollisionShape2D") as CollisionShape2D
			if cs and cs.shape is RectangleShape2D:
				var sz: Vector2 = (cs.shape as RectangleShape2D).size
				targets.append({"name": String(child.name), "rect": Rect2(cs.global_position - sz * 0.5, sz)})
		elif child is Area2D and String(child.name).begins_with("Transition"):
			var n2 := child as Node2D
			targets.append({"name": String(child.name), "rect": Rect2(n2.global_position - Vector2(24, 60), Vector2(48, 120))})
	# Band camera (same as gameplay)
	var top := floor_top
	for t in targets:
		if String(t["name"]).begins_with("Platform"):
			top = minf(top, float(t["rect"].position.y))
	var band_top := minf(maxf(0.0, top - 140.0), size.y * 0.45)
	if cam and cam.has_method("apply_room_bounds"):
		cam.apply_room_bounds(size, "", String(data.get("archetype", "")), band_top, size.y)
	var log_rows := []
	var frames := 260
	var jump_phase := 0
	for f in range(frames):
		Input.action_press("move_right")
		# timed jump: a 1-frame press edge every ~40 frames
		if f % 40 == 6:
			Input.action_press("jump")
		else:
			Input.action_release("jump")
		await get_tree().physics_frame
		if f % 2 != 0:
			continue
		await RenderingServer.frame_post_draw
		var vp := get_viewport().get_visible_rect().size
		var zoom: Vector2 = cam.zoom
		var view_rect := Rect2(cam.global_position - (vp / zoom) * 0.5, vp / zoom)
		# nearest upcoming target ahead of the player (to the right)
		var best = null
		var best_dx := 1e9
		for t in targets:
			var cx: float = t["rect"].position.x + t["rect"].size.x * 0.5
			var dx: float = cx - player.global_position.x
			if dx > 8.0 and dx < best_dx:
				best_dx = dx
				best = t
		var upcoming_visible := true
		var upcoming_name := ""
		if best != null:
			upcoming_visible = view_rect.intersects(best["rect"])
			upcoming_name = String(best["name"])
		log_rows.append({
			"frame": f, "t_ms": int(f * (1000.0 / 60.0)),
			"player": [round(player.global_position.x), round(player.global_position.y)],
			"upcoming": upcoming_name, "upcoming_visible": upcoming_visible,
		})
		var img := get_viewport().get_texture().get_image()
		img.save_png("%s/%s_%04d.png" % [out_dir, rid, f])
	Input.action_release("move_right")
	Input.action_release("jump")
	# summarize: any frame where an upcoming target was NOT visible
	var misses := 0
	for r in log_rows:
		if r["upcoming"] != "" and not r["upcoming_visible"]:
			misses += 1
	findings[rid] = {"frames_logged": log_rows.size(), "upcoming_not_visible_frames": misses, "log": log_rows}
	print("REC %s frames=%d misses=%d" % [rid, log_rows.size(), misses])
	scene.queue_free()
	await get_tree().process_frame
