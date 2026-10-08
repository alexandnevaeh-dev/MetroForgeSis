extends Node
var checks:Array=[]
func check(label:String,passed:bool)->void:
 checks.append({"label":label,"passed":passed});print("VESTIBULE_CHECK ",JSON.stringify(checks.back()))
func _ready()->void:
 GameManager.start_new_game()
 var world=load("res://scenes/world/World.tscn").instantiate();add_child(world)
 await get_tree().create_timer(0.3).timeout
 await world._load_room("room_013","left")
 await get_tree().create_timer(0.4).timeout
 Input.action_press("move_right")
 var deadline:=Time.get_ticks_msec()+3000
 while not GameManager.has_ability("double_jump") and Time.get_ticks_msec()<deadline:await get_tree().physics_frame
 Input.action_release("move_right")
 check("real shrine pickup earns return-gate ability",GameManager.has_ability("double_jump"))
 await world._load_room("room_020","left")
 await get_tree().create_timer(0.4).timeout
 var room=world._current_room
 var valid:=true
 var expected:=[Vector2(576,256),Vector2(576,160),Vector2(640,256)]
 for i in range(3):
  var node=room.get_node_or_null("MasonryRoof_"+str(i));valid=valid and node!=null
  if node:valid=valid and node.get_node("CollisionShape2D").shape.size==expected[i]
 check("native roofs match side chambers and high nave",valid)
 var platforms:=0
 for node in room.get_children():
  if node.name.begins_with("Platform_"):platforms+=1
 check("all nine original stair ledges remain",platforms==9)
 var kit=room.find_child("ThemedRoomKit",true,false)
 check("book-lined facade is clipped to actual room dimensions",kit!=null and kit.interior_clip.clip_contents and kit.interior_clip.size==Vector2(1792,768))
 var camera:=Camera2D.new();camera.position=Vector2(896,480);camera.zoom=Vector2(0.6,0.6);room.add_child(camera);camera.make_current()
 await RenderingServer.frame_post_draw
 get_viewport().get_texture().get_image().save_png("res://vestibule-overview.png");camera.queue_free()
 var agent:=PlaytestAgent.new()
 var entered:bool=await agent._execute_transition(world,self,"room_020","room_021",[])
 check("Input crosses chambers into archive",entered and GameManager.current_room_id=="room_021")
 if entered:
  var returned:bool=await agent._execute_transition(world,self,"room_021","room_020",[])
  check("archive return remains connected",returned and GameManager.current_room_id=="room_020")
  if returned:
   var gated:bool=await agent._execute_transition(world,self,"room_020","room_019",["double_jump"])
   check("earned return gate reaches Floodgate",gated and GameManager.current_room_id=="room_019")
 agent=null
 for i in range(43):
  var id:="room_%03d"%i;var path:="res://scenes/rooms/"+id+".tscn"
  if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]:await world._ensure_packed(id)
 var passed:=checks.size()==7 and checks.all(func(row):return row.passed)
 var file=FileAccess.open("res://vestibule-proof.json",FileAccess.WRITE);file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled room setup, real shrine pickup and Input traversal; full campaign separate."},"\t"));file.close()
 world.queue_free();await get_tree().process_frame;await get_tree().create_timer(3.0).timeout;await get_tree().process_frame
 get_tree().quit.call_deferred(0 if passed else 1)
