extends Node
var checks:Array=[]
var saves:=0
func _save_activated(id:String)->void:
	if id=="save_room_016":saves+=1
func check(label:String,passed:bool)->void:
	checks.append({"label":label,"passed":passed})
	print("WATER_SHRINE_CHECK ",JSON.stringify(checks.back()))
func _ready()->void:
	GameManager.start_new_game()
	EventBus.object_activated.connect(_save_activated)
	var world=load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.3).timeout
	await world._load_room("room_016","left")
	await get_tree().create_timer(0.4).timeout
	var room=world._current_room
	var roofs:=true
	var expected:=[Vector2(640,704),Vector2(1088,768),Vector2(1344,832)]
	for i in range(3):
		var node=room.get_node_or_null("MasonryRoof_"+str(i))
		roofs=roofs and node!=null
		if node:roofs=roofs and node.get_node("CollisionShape2D").shape.size==expected[i]
	check("native refuge roofs match alcove, hall and approach",roofs)
	var platform=room.get_node_or_null("Platform_0")
	var landing:=false
	if platform:
		var shape=platform.get_node("CollisionShape2D")
		landing=Rect2(platform.position+shape.position-shape.shape.size*0.5,shape.shape.size)==Rect2(1344,992,96,32)
	check("original hall landing has its exact collider",landing)
	var kit=room.find_child("ThemedRoomKit",true,false)
	check("room dressing is clipped to full refuge dimensions",kit!=null and kit.interior_clip.clip_contents and kit.interior_clip.size==Vector2(3072,1152))
	var player=get_tree().get_first_node_in_group("player")
	Input.action_press("move_right")
	var deadline:=Time.get_ticks_msec()+3000
	while is_instance_valid(player) and player.global_position.x<220 and Time.get_ticks_msec()<deadline:await get_tree().physics_frame
	Input.action_release("move_right")
	await get_tree().create_timer(0.2).timeout
	check("real checkpoint body entry saved this room",saves>0 and SaveManager.get_checkpoint_room_id()=="room_016")
	check("checkpoint records actual maximum health",SaveManager.get_checkpoint_health()==SaveManager.get_checkpoint_max_health() and SaveManager.get_checkpoint_health()>0)
	check("both decorative doors identify real transitions",kit!=null and kit.doorway_views.size()==2 and kit.doorway_views.all(func(pair):return pair.sprite.get_meta("transition_target")==pair.door.target_room_id))
	var camera:=Camera2D.new()
	camera.position=Vector2(1536,896)
	camera.zoom=Vector2(0.35,0.35)
	room.add_child(camera)
	camera.make_current()
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://water-shrine-overview.png")
	camera.queue_free()
	var agent:=PlaytestAgent.new()
	var left:bool=await agent._execute_transition(world,self,"room_016","room_015",[])
	check("ordinary input returns to Pressure Shaft",left and GameManager.current_room_id=="room_015")
	if left:
		var returned:bool=await agent._execute_transition(world,self,"room_015","room_016",[])
		check("Pressure Shaft returns into the refuge",returned and GameManager.current_room_id=="room_016")
		if returned:
			var right:bool=await agent._execute_transition(world,self,"room_016","room_018",[])
			check("guardian approach enters the actual arena",right and GameManager.current_room_id=="room_018")
	agent=null
	await get_tree().create_timer(0.5).timeout
	for i in range(43):
		var id:="room_%03d"%i
		var path:="res://scenes/rooms/"+id+".tscn"
		if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]:await world._ensure_packed(id)
	var passed:=checks.all(func(row):return row.passed)
	var file=FileAccess.open("res://water-shrine-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled refuge arrival, actual checkpoint event and Input-only connected passages. Guardian defeat and whole campaign remain separate."},"\t"))
	file.close()
	EventBus.object_activated.disconnect(_save_activated)
	world.queue_free()
	await get_tree().process_frame
	await get_tree().create_timer(3.0).timeout
	await get_tree().process_frame
	get_tree().quit.call_deferred(0 if passed else 1)
