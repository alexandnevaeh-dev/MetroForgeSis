extends Node
const Bounds := preload("res://scripts/test/RoomKitBounds.gd")
var checks: Array = []
func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("BOUNDS_CHECK ",JSON.stringify(checks.back()))
func _ready() -> void:
	check("updated smoke script compiles",load("res://scripts/test/RuntimeSmokeCandidate.gd")!=null)
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.3).timeout
	var graph: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://world_graph.json"))
	var count := 0
	for node in graph.nodes:
		if node.type != "room":
			continue
		await world._load_room(node.id,"left")
		await get_tree().process_frame
		await get_tree().process_frame
		count += 1
		var room: Node = world._current_room
		check(node.id+" native background clipped to room dimensions",Bounds.matches(room))
		if node.id=="room_014":
			var kit = room.find_child("ThemedRoomKit",true,false)
			var clip: Control = kit.get_node("RoomInteriorClip")
			var wall = clip.get_node("RoomBrickBackwall")
			var size := clip.size
			clip.size.x += 32
			check("reject oversized background",not Bounds.matches(room))
			clip.size = size
			clip.clip_contents = false
			check("reject disabled clipping",not Bounds.matches(room))
			clip.clip_contents = true
			wall.position.x = 32
			check("reject shifted brick background",not Bounds.matches(room))
			wall.position = Vector2.ZERO
			var dimensions: Vector2 = wall.dimensions
			wall.dimensions.y -= 32
			check("reject short brick background",not Bounds.matches(room))
			wall.dimensions = dimensions
			check("restored background passes",Bounds.matches(room))
	check("all 43 authored rooms covered",count==43)
	for index in range(43):
		var id := "room_%03d" % index
		var path := "res://scenes/rooms/"+id+".tscn"
		if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]:
			await world._ensure_packed(id)
	var passed := true
	for row in checks:
		passed = passed and row.passed
	var file := FileAccess.open("res://bounds-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"roomCount":count,"scope":"Controlled native loads and malformed-background rejection. No full smoke, gameplay, or art approval claim."},"	"))
	file.close()
	print("BOUNDS_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
