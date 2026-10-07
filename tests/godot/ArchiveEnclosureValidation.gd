extends Node
var checks: Array = []
func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("ARCHIVE_CHECK ",JSON.stringify(checks.back()))
func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.3).timeout
	await world._load_room("room_021","left")
	await get_tree().create_timer(0.4).timeout
	var room = world._current_room
	var roofs: Array = []
	for node in room.get_children():
		if String(node.name).begins_with("MasonryRoof_"):
			roofs.append(node)
	check("three solid roof volumes enclose three connected spaces",roofs.size()==3)
	var expected := [Vector2(384,960),Vector2(1280,832),Vector2(384,960)]
	var sized := roofs.size()==3
	for index in range(roofs.size()):
		var shape = roofs[index].get_node("CollisionShape2D").shape
		sized = sized and shape is RectangleShape2D and shape.size==expected[index]
	check("native roof dimensions match the archive enclosure",sized)
	check("two arch piers frame the central archive hall",room.has_node("MasonryPier_1") and room.has_node("MasonryPier_2"))
	var kit = room.find_child("ThemedRoomKit",true,false)
	check("themed archive kit exists",kit!=null)
	if kit:
		check("background clipped to 2048 by 1280",kit.interior_clip.clip_contents and kit.interior_clip.size==Vector2(2048,1280))
	var encounters := 0
	for node in room.get_children():
		if String(node.name)=="Enemy" or String(node.name).begins_with("Enemy_"):
			encounters += 1
	check("all four archive encounters remain enabled",encounters==4)
	var player = room.get_node("Player")
	check("ordinary player damage rules remain enabled",not player.get_node("HealthComponent").invulnerable)
	var camera := Camera2D.new()
	camera.position = Vector2(1024,640)
	camera.zoom = Vector2(0.5,0.5)
	room.add_child(camera)
	camera.make_current()
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://archive-overview.png")
	camera.queue_free()
	var agent := PlaytestAgent.new()
	var walked: bool = await agent._execute_transition(world,self,"room_021","room_022",[])
	check("input-only archive crossing reaches right map exit",walked and GameManager.current_room_id=="room_022")
	if walked:
		var returned: bool = await agent._execute_transition(world,self,"room_022","room_021",[])
		check("ordinary left exit returns to rebuilt archive",returned and GameManager.current_room_id=="room_021")
	# Wait for actual neighbor preload handles before shutting down the renderer.
	for index in range(43):
		var id := "room_%03d" % index
		var path := "res://scenes/rooms/"+id+".tscn"
		if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]:
			await world._ensure_packed(id)
	var passed := true
	for row in checks:
		passed = passed and row.passed
	var file := FileAccess.open("res://archive-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Native archive enclosure and Input-only exit/return from a controlled room021 start. Original four encounters and ordinary damage rules required. App export provenance and full campaign regression must be recorded separately."},"	"))
	file.close()
	print("ARCHIVE_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
