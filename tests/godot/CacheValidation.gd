extends Node
var checks:Array=[]
func check(label:String,passed:bool)->void:
 checks.append({"label":label,"passed":passed});print("CACHE_CHECK ",JSON.stringify(checks.back()))
func _ready()->void:
 GameManager.start_new_game()
 var world=load("res://scenes/world/World.tscn").instantiate();add_child(world)
 await get_tree().create_timer(0.3).timeout
 await world._load_room("room_015","left")
 await get_tree().create_timer(0.3).timeout
 var agent:=PlaytestAgent.new()
 var entered:bool=await agent._execute_transition(world,self,"room_015","room_017",[])
 check("Input descent enters the real cache",entered and GameManager.current_room_id=="room_017")
 if entered:
  var room=world._current_room
  var roof0=room.get_node_or_null("MasonryRoof_0")
  var roof1=room.get_node_or_null("MasonryRoof_1")
  check("side chambers preserve the open arrival shaft",roof0!=null and roof1!=null and roof0.get_node("CollisionShape2D").shape.size==Vector2(768,928) and roof1.get_node("CollisionShape2D").shape.size==Vector2(768,832))
  var deadline:=Time.get_ticks_msec()+6000
  while InventoryManager.get_owned_count("lost_echo_002")==0 and Time.get_ticks_msec()<deadline:await get_tree().physics_frame
  check("natural descent collects the cache item",InventoryManager.get_owned_count("lost_echo_002")>0)
  var camera:=Camera2D.new();camera.position=Vector2(1024,880);camera.zoom=Vector2(0.5,0.5);room.add_child(camera);camera.make_current()
  await RenderingServer.frame_post_draw
  get_viewport().get_texture().get_image().save_png("res://cache-overview.png");camera.queue_free()
  var exited:bool=await agent._execute_transition(world,self,"room_017","room_018",[])
  check("Input traversal reaches guardian room",exited and GameManager.current_room_id=="room_018")
 agent=null
 for i in range(43):
  var id:="room_%03d"%i;var path:="res://scenes/rooms/"+id+".tscn"
  if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]:await world._ensure_packed(id)
 var passed:=checks.size()==4 and checks.all(func(row):return row.passed)
 var file=FileAccess.open("res://cache-proof.json",FileAccess.WRITE);file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled Pressure Shaft start followed by actual Input descent, pickup and guardian entry; full campaign separate."},"\t"));file.close()
 world.queue_free();await get_tree().process_frame;await get_tree().create_timer(3.0).timeout;await get_tree().process_frame
 get_tree().quit.call_deferred(0 if passed else 1)
