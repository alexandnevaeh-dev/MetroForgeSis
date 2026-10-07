extends Node
var checks: Array = []
func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("DROWNED_CHECK ",JSON.stringify(checks.back()))
func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.3).timeout
	await world._load_room("room_011","left")
	await get_tree().create_timer(0.4).timeout
	var room = world._current_room
	var roofs: Array = []
	for node in room.get_children():
		if String(node.name).begins_with("MasonryRoof_"):
			roofs.append(node)
	check("three solid roof volumes enclose three connected spaces",roofs.size()==3)
	var expected := [Vector2(640,832),Vector2(768,704),Vector2(640,832)]
	var sized := roofs.size()==3
	for index in range(roofs.size()):
		var shape = roofs[index].get_node("CollisionShape2D").shape
		sized = sized and shape is RectangleShape2D and shape.size==expected[index]
	check("native roof dimensions match the drowned enclosure",sized)
	var platforms := true
	for index in range(2):
		var platform = room.get_node_or_null("Platform_"+str(index))
		var expected_rect := Rect2(224,1120,192,32) if index==0 else Rect2(1472,1120,128,32)
		if platform == null:
			platforms = false
		else:
			var collision = platform.get_node("CollisionShape2D")
			platforms = platforms and Rect2(platform.position+collision.position-collision.shape.size*0.5,collision.shape.size)==expected_rect
	check("both original low platforms retain exact colliders",platforms)
	check("two arch piers frame the central drowned hall",room.has_node("MasonryPier_1") and room.has_node("MasonryPier_2"))
	var kit = room.find_child("ThemedRoomKit",true,false)
	check("themed drowned kit exists",kit!=null)
	if kit:
		check("background clipped to 2048 by 1280",kit.interior_clip.clip_contents and kit.interior_clip.size==Vector2(2048,1280))
	var encounters := 0
	for node in room.get_children():
		if String(node.name)=="Enemy" or String(node.name).begins_with("Enemy_"):
			encounters += 1
	check("all six drowned encounters remain enabled",encounters==6)
	var player = room.get_node("Player")
	check("ordinary player damage rules remain enabled",not player.get_node("HealthComponent").invulnerable)
	var camera := Camera2D.new()
	camera.position = Vector2(1024,640)
	camera.zoom = Vector2(0.5,0.5)
	room.add_child(camera)
	camera.make_current()
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://drowned-overview.png")
	camera.queue_free()
	var agent := PlaytestAgent.new()
	var walked: bool = await agent._execute_transition(world,self,"room_011","room_012",[])
	check("input-only drowned crossing reaches right map exit",walked and GameManager.current_room_id=="room_012")
	if walked:
		var returned: bool = await agent._execute_transition(world,self,"room_012","room_011",[])
		check("ordinary left exit returns to rebuilt drowned",returned and GameManager.current_room_id=="room_011")
	# Wait for actual neighbor preload handles before shutting down the renderer.
	for index in range(43):
		var id := "room_%03d" % index
		var path := "res://scenes/rooms/"+id+".tscn"
		if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]:
			await world._ensure_packed(id)
	var passed := true
	for row in checks:
		passed = passed and row.passed
	var file := FileAccess.open("res://drowned-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Native drowned enclosure and Input-only exit/return from a controlled room011 start. Original six encounters and ordinary damage rules required. App export provenance and full campaign regression must be recorded separately."},"	"))
	file.close()
	print("DROWNED_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
