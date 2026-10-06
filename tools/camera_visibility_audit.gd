extends Node2D

## Camera-visibility audit: for each room, place the player at the approach / jump-apex / landing
## of every required target (room transition, elevated platform landing, hazard/weak-floor) and
## capture the REAL gameplay camera (the player's CameraDirector). Records, per room+target+phase,
## whether the target is inside the camera view before the player commits. Windowed capture only.

var out_dir := ""
var report := {}
var _overlay: Marker

class Marker extends Node2D:
	var rect := Rect2()
	var inview := false
	func _draw() -> void:
		if rect.size == Vector2.ZERO:
			return
		var col := Color(0.25, 1.0, 0.55, 1.0) if inview else Color(1.0, 0.35, 0.3, 1.0)
		draw_rect(rect, Color(col.r, col.g, col.b, 0.25), true)
		draw_rect(rect, col, false, 4.0)

func _ready() -> void:
	DisplayServer.window_set_size(Vector2i(1920, 1080))
	out_dir = OS.get_environment("VIS_OUT")
	_overlay = Marker.new()
	_overlay.z_index = 5000
	add_child(_overlay)
	for i in range(10):
		await _audit_room("room_%03d" % i)
	_write_report()
	get_tree().quit()

func _rooms_json() -> Dictionary:
	var f := FileAccess.open("res://data/rooms/rooms.json", FileAccess.READ)
	if f == null:
		return {}
	var d = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(d) == TYPE_DICTIONARY:
		return d.get("rooms", d)
	return {}

func _band(size: Vector2, data: Dictionary, floor_top: float, plats: Array) -> Vector2:
	var top := floor_top
	for p in plats:
		top = minf(top, float(p["rect"].position.y))
	var conns = data.get("connections", [])
	if conns is Array:
		for c in conns:
			if typeof(c) == TYPE_DICTIONARY and String(c.get("direction", "")) == "up":
				return Vector2(0.0, size.y)
	return Vector2(minf(maxf(0.0, top - 140.0), size.y * 0.45), size.y)

func _collect(node: Node, arr: Array) -> void:
	for c in node.get_children():
		if c is CollisionShape2D and c.shape is RectangleShape2D:
			arr.append(c)
		_collect(c, arr)

func _audit_room(rid: String) -> void:
	for c in get_children():
		if c != _overlay:
			c.queue_free()
	await get_tree().process_frame
	var packed: PackedScene = load("res://scenes/rooms/%s.tscn" % rid)
	var scene: Node = packed.instantiate()
	add_child(scene)
	await get_tree().process_frame
	await get_tree().process_frame
	var data: Dictionary = _rooms_json().get(rid, {})
	var size := Vector2(float(data.get("width", 800)), float(data.get("height", 600)))
	var player := scene.get_node_or_null("Player") as Node2D
	if player == null:
		return
	player.set_physics_process(false)
	player.set_process(false)
	var cam: Node = player.get_node_or_null("Camera2D")
	# Floor top from the Floor body's collision shape
	var floor_top := size.y - 64.0
	var floor_node: Node = scene.get_node_or_null("Floor")
	if floor_node:
		var fcs := floor_node.get_node_or_null("CollisionShape2D") as CollisionShape2D
		if fcs and fcs.shape is RectangleShape2D:
			floor_top = fcs.global_position.y - (fcs.shape as RectangleShape2D).size.y * 0.5
	# Targets: platforms (landings) + transitions (destinations) + weak floors (hazards)
	var plats := []
	for child in scene.get_children():
		if child is StaticBody2D and String(child.name).begins_with("Platform"):
			var cs := child.get_node_or_null("CollisionShape2D") as CollisionShape2D
			if cs and cs.shape is RectangleShape2D:
				var sz: Vector2 = (cs.shape as RectangleShape2D).size
				plats.append({"name": String(child.name), "rect": Rect2(cs.global_position - sz * 0.5, sz)})
	var band := _band(size, data, floor_top, plats)
	if cam and cam.has_method("apply_room_bounds"):
		cam.apply_room_bounds(size, "", String(data.get("archetype", "")), band.x, band.y)
	await _frames(4)
	report[rid] = []
	# Platform landings
	for p in plats:
		var r: Rect2 = p["rect"]
		var needs_jump := r.position.y < floor_top - 40.0
		var approach := Vector2(clampf(r.position.x + r.size.x * 0.5, 24.0, size.x - 24.0), floor_top - 24.0)
		await _check(rid, cam, player, p["name"], r, approach, "approach")
		if needs_jump:
			var apex := Vector2((approach.x + r.position.x + r.size.x * 0.5) * 0.5, r.position.y - 40.0)
			await _check(rid, cam, player, p["name"], r, apex, "apex")
			var landing := Vector2(r.position.x + r.size.x * 0.5, r.position.y - 24.0)
			await _check(rid, cam, player, p["name"], r, landing, "landing")
	# Transitions (destinations / exits)
	for child in scene.get_children():
		if child is Area2D and String(child.name).begins_with("Transition"):
			var node2d := child as Node2D
			var zr := Rect2(node2d.global_position - Vector2(28, 70), Vector2(56, 120))
			var ax := clampf(node2d.global_position.x, 40.0, size.x - 40.0)
			# approach from inside the room
			if ax < size.x * 0.5:
				ax += 48.0
			else:
				ax -= 48.0
			var approach2 := Vector2(ax, floor_top - 24.0)
			await _check(rid, cam, player, String(child.name), zr, approach2, "approach")
	# Weak floors (hazards)
	for child in scene.get_children():
		if String(child.name).begins_with("WeakFloor") and child is Node2D:
			var wr := Rect2((child as Node2D).global_position - Vector2(48, 24), Vector2(96, 48))
			var a3 := Vector2(clampf((child as Node2D).global_position.x - 80.0, 24.0, size.x - 24.0), floor_top - 24.0)
			await _check(rid, cam, player, String(child.name), wr, a3, "approach_hazard")
	scene.queue_free()
	await get_tree().process_frame

func _check(rid: String, cam: Node, player: Node2D, tname: String, trect: Rect2, ppos: Vector2, phase: String) -> void:
	player.global_position = ppos
	await _frames(6)
	var vp := get_viewport().get_visible_rect().size
	var zoom: Vector2 = cam.zoom
	var view_size := vp / zoom
	var view_rect := Rect2(cam.global_position - view_size * 0.5, view_size)
	var intersects := view_rect.intersects(trect)
	var fully := view_rect.encloses(trect)
	_overlay.rect = trect
	_overlay.inview = intersects
	_overlay.queue_redraw()
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var fn := "%s/%s__%s__%s.png" % [out_dir, rid, tname, phase]
	img.save_png(fn)
	report[rid].append({
		"target": tname, "phase": phase,
		"target_rect": [trect.position.x, trect.position.y, trect.size.x, trect.size.y],
		"view_rect": [view_rect.position.x, view_rect.position.y, view_rect.size.x, view_rect.size.y],
		"intersects": intersects, "fully_in_view": fully,
	})
	print("VIS %s %s %s intersects=%s fully=%s" % [rid, tname, phase, intersects, fully])

func _frames(n: int) -> void:
	for i in range(n):
		await get_tree().process_frame

func _write_report() -> void:
	var f := FileAccess.open("%s/audit.json" % out_dir, FileAccess.WRITE)
	f.store_string(JSON.stringify(report, "  "))
	f.close()
	print("VIS_AUDIT_WRITTEN")
