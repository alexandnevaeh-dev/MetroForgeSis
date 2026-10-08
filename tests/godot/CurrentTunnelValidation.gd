extends Node
var checks: Array = []
func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("CURRENT_CHECK ",JSON.stringify(checks.back()))
func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.3).timeout
	await world._load_room("room_012","left")
	await get_tree().create_timer(0.4).timeout
	var room = world._current_room
	var roofs: Array = []
	for node in room.get_children():
		if String(node.name).begins_with("MasonryRoof_"): roofs.append(node)
	check("three solid roofs enclose asymmetric corridors and crossing chamber",roofs.size()==3)
	var expected := [Vector2(512,960),Vector2(640,704),Vector2(896,928)]
	var sized := roofs.size()==3
	for index in range(roofs.size()):
		var shape = roofs[index].get_node("CollisionShape2D").shape
		sized = sized and shape is RectangleShape2D and shape.size==expected[index]
	check("native roof dimensions match the tunnel enclosure",sized)
	var platform_rects := [Rect2(672,1120,224,32),Rect2(672,1120,96,32),Rect2(768,1024,96,32),Rect2(672,928,96,32)]
	var platforms := true
	for index in range(platform_rects.size()):
		var platform = room.get_node_or_null("Platform_"+str(index))
		if platform == null: platforms=false
		else:
			var collision = platform.get_node("CollisionShape2D")
			platforms = platforms and Rect2(platform.position+collision.position-collision.shape.size*0.5,collision.shape.size)==platform_rects[index]
	check("four original platforms retain exact colliders",platforms)
	check("both threshold piers remain",room.has_node("MasonryPier_1") and room.has_node("MasonryPier_2"))
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/rooms/rooms.json")).rooms.room_012
	check("original pit retained",data.pits.size()==1 and data.pits[0].x==608 and data.pits[0].width==64)
	var kit = room.find_child("ThemedRoomKit",true,false)
	check("tunnel kit clipped to its room",kit!=null and kit.interior_clip.clip_contents and kit.interior_clip.size==Vector2(2048,1280))
	if kit:
		var props := {}
		for view in kit.interior_clip.get_children():
			if view is Sprite2D and view.has_meta("asset_role") and String(view.get_meta("asset_role")) in ["votive_lamp","chain_winch","iron_censer"]:
				props[String(view.get_meta("asset_role"))]=view
		check("service winch and two votive fixtures replace the generic coffin",props.size()==3 and props.has("chain_winch") and props.has("votive_lamp") and props.has("iron_censer"))
		var contained := props.size()==3
		for view in props.values():
			var anchor: Vector2=view.get_meta("anchor")
			var height: float=view.get_meta("display_height")
			var ceiling:=960.0 if anchor.x<512 else (704.0 if anchor.x<1152 else 928.0)
			contained=contained and anchor.y-height>=ceiling and anchor.y<1216 and anchor.x>=0 and anchor.x<=2048
		check("service props stay below the roof and above the walking floor",contained)
	var encounters := 0
	for node in room.get_children():
		if String(node.name)=="Enemy" or String(node.name).begins_with("Enemy_"): encounters+=1
	check("both tunnel encounters remain enabled",encounters==2)
	check("ordinary player damage enabled",not room.get_node("Player/HealthComponent").invulnerable)
	var camera := Camera2D.new()
	camera.position=Vector2(1024,640)
	camera.zoom=Vector2(0.5,0.5)
	room.add_child(camera)
	camera.make_current()
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://current-tunnel-overview.png")
	camera.queue_free()
	var agent := PlaytestAgent.new()
	var crossed: bool = await agent._execute_transition(world,self,"room_012","room_013",[])
	check("input crossing reaches double-jump font",crossed and GameManager.current_room_id=="room_013")
	if crossed:
		var returned: bool = await agent._execute_transition(world,self,"room_013","room_012",[])
		check("ordinary left exit returns to enclosed tunnel",returned and GameManager.current_room_id=="room_012")
	for index in range(43):
		var id := "room_%03d" % index
		var path := "res://scenes/rooms/"+id+".tscn"
		if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]: await world._ensure_packed(id)
	var passed:=checks.all(func(row):return row.passed)
	var file:=FileAccess.open("res://current-tunnel-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled room012 start; original encounters, pit and platform colliders; Input-only exit and return. Full campaign and finished visuals validated separately."},"\t"))
	file.close()
	print("CURRENT_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
