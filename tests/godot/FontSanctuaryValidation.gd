extends Node
var checks: Array = []
func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("FONT_CHECK ",JSON.stringify(checks.back()))
func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.3).timeout
	await world._load_room("room_013","left")
	await get_tree().create_timer(0.4).timeout
	var room = world._current_room
	var expected := [Vector2(640,832),Vector2(768,576),Vector2(640,896)]
	var roofs := true
	for index in range(3):
		var node = room.get_node_or_null("MasonryRoof_"+str(index))
		roofs = roofs and node != null
		if node: roofs = roofs and node.get_node("CollisionShape2D").shape.size==expected[index]
	check("native solid roofs form alcove, practice nave and exit",roofs)
	var platforms := true
	var original := [Rect2(896,1120,128,32),Rect2(1056,1024,128,32)]
	for index in range(2):
		var platform=room.get_node_or_null("Platform_"+str(index))
		if not platform: platforms=false
		else:
			var shape=platform.get_node("CollisionShape2D")
			platforms=platforms and Rect2(platform.position+shape.position-shape.shape.size*0.5,shape.shape.size)==original[index]
	check("both original practice platforms retain their colliders",platforms)
	check("both threshold piers exist",room.has_node("MasonryPier_1") and room.has_node("MasonryPier_2"))
	var kit=room.find_child("ThemedRoomKit",true,false)
	check("room kit clipped to room dimensions",kit!=null and kit.interior_clip.clip_contents and kit.interior_clip.size==Vector2(2048,1280))
	var infill = kit.interior_clip.get_node_or_null("VaultInfill_MasonryRoof_1") if kit else null
	check("recessed upper masonry meets central roof and facade",infill!=null and infill.position==Vector2(640,576) and infill.dimensions==Vector2(768,224))
	check("upper wall infill is visual only",infill!=null and not infill is CollisionObject2D and infill.get_child_count()==0)
	var player=get_tree().get_first_node_in_group("player")
	check("fresh player has not been granted font abilities",not GameManager.has_ability("double_jump") and not GameManager.has_ability("wall_slide") and not GameManager.has_ability("wall_jump"))
	Input.action_press("move_right")
	var deadline:=Time.get_ticks_msec()+3000
	while is_instance_valid(player) and player.global_position.x<350 and Time.get_ticks_msec()<deadline: await get_tree().physics_frame
	Input.action_release("move_right")
	check("ordinary movement collects all three real pickups",GameManager.has_ability("double_jump") and GameManager.has_ability("wall_slide") and GameManager.has_ability("wall_jump"))
	var camera:=Camera2D.new()
	camera.position=Vector2(1024,960)
	camera.zoom=Vector2(0.5,0.5)
	room.add_child(camera)
	camera.make_current()
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://font-overview.png")
	camera.queue_free()
	var agent:=PlaytestAgent.new()
	var crossed: bool=await agent._execute_transition(world,self,"room_013","room_014",[])
	check("Input-only exit reaches the library",crossed and GameManager.current_room_id=="room_014")
	if crossed:
		var returned: bool=await agent._execute_transition(world,self,"room_014","room_013",[])
		check("library return reaches the font",returned and GameManager.current_room_id=="room_013")
	agent = null
	# Settle the world's real asynchronous room preloads before fixture teardown.
	for index in range(43):
		var id := "room_%03d" % index
		var path := "res://scenes/rooms/"+id+".tscn"
		if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]: await world._ensure_packed(id)
	var passed:=checks.all(func(row):return row.passed)
	var file:=FileAccess.open("res://font-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled room013 start; unchanged pickups and platforms, Input-only pickup and exit/return. Full campaign and finished art remain separate."},"\t"))
	file.close()
	print("FONT_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
