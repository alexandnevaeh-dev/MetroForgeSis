extends Node
var checks:Array=[]
func check(label:String,passed:bool)->void:
 checks.append({"label":label,"passed":passed});print("NPC_CLIP_CHECK ",JSON.stringify(checks.back()))
func _ready()->void:
 GameManager.start_new_game()
 var world=load("res://scenes/world/World.tscn").instantiate();add_child(world)
 await get_tree().create_timer(0.3).timeout
 await world._load_room("room_019","left")
 await get_tree().create_timer(0.4).timeout
 var npc=world._current_room.get_node("NPC_0")
 for clip in ["idle","talk","listen"]:
  var valid:bool=npc.sprite.sprite_frames.has_animation(clip) and npc.sprite.sprite_frames.get_frame_count(clip)==4
  if valid:
   var texture=npc.sprite.sprite_frames.get_frame_texture(clip,0)
   valid=texture!=null and texture.get_width()==64 and texture.get_height()==64
  check("NPC loads four real source frames for "+clip,valid)
 check("idle state plays away from NPC",npc.sprite.animation=="idle" and npc.sprite.is_playing())
 Input.action_press("move_right")
 var deadline:=Time.get_ticks_msec()+8000
 while not npc._player_in_range and Time.get_ticks_msec()<deadline:await get_tree().physics_frame
 Input.action_release("move_right")
 await get_tree().process_frame
 check("real proximity selects listen state",npc._player_in_range and npc.sprite.animation=="listen")
 Input.action_press("interact");await get_tree().process_frame;Input.action_release("interact")
 await get_tree().create_timer(0.3).timeout
 var overlay=npc._dialogue_overlay()
 check("real interaction opens NPC dialogue and talk clip",overlay!=null and overlay.is_active() and overlay.active_npc_id()=="npc_003" and npc.sprite.animation=="talk")
 check("generated NPC-specific portrait selected",overlay.portrait_image.texture!=null and overlay.portrait_image.texture.resource_path=="res://assets/ui/portraits/npc_003.png")
 check("identity portrait export has72px dimensions",overlay.portrait_image.texture!=null and overlay.portrait_image.texture.get_width()==72 and overlay.portrait_image.texture.get_height()==72)
 overlay._apply_portrait("merchant")
 check("explicit alternate portrait remains selected",overlay.portrait_image.texture!=null and overlay.portrait_image.texture.resource_path=="res://assets/ui/portraits/merchant.png")
 overlay._context["npc_id"]="npc_missing"
 overlay._apply_portrait("neutral")
 check("missing identity retains existing role portrait",overlay.portrait_image.texture!=null and overlay.portrait_image.texture.resource_path=="res://assets/ui/portraits/neutral.png")
 overlay._context["npc_id"]="npc_003"
 overlay._apply_portrait("neutral")
 await RenderingServer.frame_post_draw
 get_viewport().get_texture().get_image().save_png("res://generated-portrait-dialogue.png")
 var passed:=checks.all(func(row):return row.passed)
 var file=FileAccess.open("res://npc-clip-proof.json",FileAccess.WRITE);file.store_string(JSON.stringify({"passed":passed,"checks":checks},"\t"));file.close()
 get_tree().quit.call_deferred(0 if passed else 1)
