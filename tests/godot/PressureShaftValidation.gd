extends Node
var checks: Array=[]
func check(label:String,passed:bool)->void:
	checks.append({"label":label,"passed":passed})
	print("PRESSURE_CHECK ",JSON.stringify(checks.back()))
func _ready()->void:
	GameManager.start_new_game()
	var world=load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.3).timeout
	await world._load_room("room_015","left")
	await get_tree().create_timer(0.4).timeout
	var room=world._current_room
	var roofs:=true
	var expected:=[Vector2(256,448),Vector2(576,256),Vector2(960,416)]
	for i in range(3):
		var node=room.get_node_or_null("MasonryRoof_"+str(i))
		roofs=roofs and node!=null
		if node:roofs=roofs and node.get_node("CollisionShape2D").shape.size==expected[i]
	check("three native roofs retain the high pressure chamber",roofs)
	var data:Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://data/rooms/rooms.json")).rooms.room_015
	check("four platforms and three encounters retained",data.platforms.size()==4 and data.enemies.size()==3)
	var original_pit:=false
	var descent_pit:=false
	for pit in data.pits:
		original_pit=original_pit or (pit.x==1344 and pit.width==64)
		descent_pit=descent_pit or (pit.x==832 and pit.width==128)
	check("original pit and graph-owned descent opening coexist",data.pits.size()==2 and original_pit and descent_pit)
	var floor_clear:=true
	for body in room.get_children():
		if body is StaticBody2D and String(body.name).begins_with("Floor"):
			var shape=body.get_node("CollisionShape2D")
			var bounds:=Rect2(body.position+shape.position-shape.shape.size*0.5,shape.shape.size)
			floor_clear=floor_clear and not bounds.intersects(Rect2(832,704,128,64))
	check("physical floor colliders leave descent aperture open",floor_clear)
	var kit=room.find_child("ThemedRoomKit",true,false)
	check("room kit clipped to actual dimensions",kit!=null and kit.interior_clip.clip_contents and kit.interior_clip.size==Vector2(1792,768))
	var camera:=Camera2D.new()
	camera.position=Vector2(896,480)
	camera.zoom=Vector2(0.6,0.6)
	room.add_child(camera)
	camera.make_current()
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://pressure-overview.png")
	camera.queue_free()
	var agent:=PlaytestAgent.new()
	var crossed:bool=await agent._execute_transition(world,self,"room_015","room_016",[])
	check("ordinary input reaches Water Shrine",crossed and GameManager.current_room_id=="room_016")
	if crossed:
		var returned:bool=await agent._execute_transition(world,self,"room_016","room_015",[])
		check("Water Shrine returns to Pressure Shaft",returned and GameManager.current_room_id=="room_015")
		if returned:
			var descended:bool=await agent._execute_transition(world,self,"room_015","room_017",[])
			check("input descent reaches the real cache room",descended and GameManager.current_room_id=="room_017")
			if descended:
				var branch:bool=await agent._execute_transition(world,self,"room_017","room_018",[])
				check("cache branch reconnects to guardian chamber",branch and GameManager.current_room_id=="room_018")
	agent=null
	for i in range(43):
		var id:="room_%03d"%i
		var path:="res://scenes/rooms/"+id+".tscn"
		if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]:await world._ensure_packed(id)
	var passed:=checks.all(func(row):return row.passed)
	var file:=FileAccess.open("res://pressure-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled room015 start; normal encounters, Input-only shrine and optional cache branch. Guardian defeat and full campaign remain separate."},"\t"))
	file.close()
	print("PRESSURE_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
