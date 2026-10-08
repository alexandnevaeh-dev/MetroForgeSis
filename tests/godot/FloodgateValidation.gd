extends Node
var checks:Array=[]
func check(label:String,passed:bool)->void:
 checks.append({"label":label,"passed":passed});print("FLOODGATE_CHECK ",JSON.stringify(checks.back()))
func _ready()->void:
 GameManager.start_new_game()
 var world=load("res://scenes/world/World.tscn").instantiate();add_child(world)
 await get_tree().create_timer(0.3).timeout
 await world._load_room("room_019","left")
 await get_tree().create_timer(0.4).timeout
 var room=world._current_room
 var roof_ok:=true
 var expected:=[Vector2(640,448),Vector2(512,320),Vector2(640,384)]
 for i in range(3):
  var node=room.get_node_or_null("MasonryRoof_"+str(i));roof_ok=roof_ok and node!=null
  if node:roof_ok=roof_ok and node.get_node("CollisionShape2D").shape.size==expected[i]
 check("native roof volumes match floodgate chambers",roof_ok)
 var kit=room.find_child("ThemedRoomKit",true,false)
 check("facade clip matches actual room dimensions",kit!=null and kit.interior_clip.clip_contents and kit.interior_clip.size==Vector2(1792,768))
 var player=get_tree().get_first_node_in_group("player")
 Input.action_press("move_right")
 await get_tree().create_timer(9.0).timeout
 Input.action_release("move_right")
 check("unearned double-jump gate rejects real input",GameManager.current_room_id=="room_019" and not GameManager.has_ability("double_jump") and is_instance_valid(player) and player.global_position.x>1500)
 await world._load_room("room_013","left")
 await get_tree().create_timer(0.4).timeout
 Input.action_press("move_right")
 var deadline:=Time.get_ticks_msec()+3000
 while not GameManager.has_ability("double_jump") and Time.get_ticks_msec()<deadline:await get_tree().physics_frame
 Input.action_release("move_right")
 check("actual shrine pickup earns double jump",GameManager.has_ability("double_jump"))
 await world._load_room("room_019","left")
 await get_tree().create_timer(0.4).timeout
 room=world._current_room
 var camera:=Camera2D.new();camera.position=Vector2(896,560);camera.zoom=Vector2(0.6,0.6);room.add_child(camera);camera.make_current()
 await RenderingServer.frame_post_draw
 get_viewport().get_texture().get_image().save_png("res://floodgate-overview.png");camera.queue_free()
 var agent:=PlaytestAgent.new()
 var entered:bool=await agent._execute_transition(world,self,"room_019","room_020",["double_jump"])
 check("earned gate accepts real traversal",entered and GameManager.current_room_id=="room_020")
 if entered:
  var returned:bool=await agent._execute_transition(world,self,"room_020","room_019",["double_jump"])
  check("earned return gate remains connected",returned and GameManager.current_room_id=="room_019")
  if returned:
   var back:bool=await agent._execute_transition(world,self,"room_019","room_018",[])
   check("return hall reaches guardian arena",back and GameManager.current_room_id=="room_018")
 agent=null
 for i in range(43):
  var id:="room_%03d"%i;var path:="res://scenes/rooms/"+id+".tscn"
  if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]:await world._ensure_packed(id)
 var passed:=checks.size()==7 and checks.all(func(row):return row.passed)
 var file=FileAccess.open("res://floodgate-proof.json",FileAccess.WRITE);file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled room setup; Input-only gate attempts, real shrine pickup and connected transitions; full campaign separate."},"\t"));file.close()
 world.queue_free();await get_tree().process_frame;await get_tree().create_timer(3.0).timeout;await get_tree().process_frame
 get_tree().quit.call_deferred(0 if passed else 1)
