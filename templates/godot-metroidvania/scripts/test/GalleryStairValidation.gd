extends Node
var world: Node2D
var player: CharacterBody2D
var observations: Array = []
func _ready() -> void:
 GameManager.start_new_game()
 world = load("res://scenes/world/World.tscn").instantiate()
 add_child(world)
 await get_tree().create_timer(0.5).timeout
 await world._load_room("room_005","left")
 await get_tree().create_timer(0.5).timeout
 player = world._current_room.get_node("Player")
 player.get_node("HealthComponent").invulnerable = true
 var passed = await move_to(Vector2(272,1472),10000,false)
 for i in range(14):
  var column = i%4 if int(i/4)%2==0 else 3-i%4
  var target = Vector2(176+column*192,1472-(i+1)*96)
  var reached = await move_to(target,12000,false)
  if not is_instance_valid(player):
   passed = false
   break
  var row = {"landing":i,"target":[target.x,target.y],"position":[player.position.x,player.position.y],"passed":reached}
  observations.append(row)
  print("STAIR_STEP "+JSON.stringify(row))
  if not reached:
   passed = false
   break
 if passed:
  passed = await move_to(Vector2(512,128),5000,false)
 if passed:
  Input.action_release("jump")
  await get_tree().process_frame
  Input.action_press("move_up")
  Input.action_press("jump")
  var deadline = Time.get_ticks_msec()+5000
  while GameManager.current_room_id=="room_005" and Time.get_ticks_msec()<deadline:
   await get_tree().physics_frame
  passed = GameManager.current_room_id=="room_006"
 for action in ["move_left","move_right","move_up","jump","attack"]:
  Input.action_release(action)
 DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/gallery-stairs"))
 await RenderingServer.frame_post_draw
 get_viewport().get_texture().get_image().save_png("user://qa/gallery-stairs/final.png")
 var file = FileAccess.open("user://qa/gallery-stairs/proof.json",FileAccess.WRITE)
 file.store_string(JSON.stringify({"passed":passed,"steps":observations,"actualRoom":GameManager.current_room_id,"scope":"Controlled initial room load and health invulnerability; actual movement/jump inputs for every stair and exit."},"\t"));file.close()
 AudioManager.request_quit(0 if passed else 1)

func move_to(target: Vector2, timeout_ms: int = 15000, gap_jump: bool = true) -> bool:
 var begin := Time.get_ticks_msec()
 var last_attack := 0
 var jump_until := 0
 while Time.get_ticks_msec()-begin < timeout_ms:
  if not is_instance_valid(player) or GameManager.current_room_id != "room_005":
   return false
  var dx := target.x-player.position.x
  if absf(dx)<18 and absf(player.position.y-target.y)<4 and player.is_on_floor():
   Input.action_release("move_left")
   Input.action_release("move_right")
   return true
  var direction := signf(dx) if absf(dx)>10 else 0.0
  if player.position.y > target.y-8 and player.position.y > target.y+6:
   direction = 0.0
  Input.action_release("move_left")
  Input.action_release("move_right")
  if direction != 0:
   Input.action_press("move_right" if direction>0 else "move_left")
  var ahead := player.global_position+Vector2(direction*60,-6)
  var query := PhysicsRayQueryParameters2D.create(ahead,ahead+Vector2(0,90),1)
  var supported := not player.get_world_2d().direct_space_state.intersect_ray(query).is_empty()
  if player.is_on_floor() and (player.position.y>target.y+6 or (gap_jump and not supported)) and Time.get_ticks_msec()>jump_until+100:
   jump_until=Time.get_ticks_msec()+450
  if Time.get_ticks_msec()<jump_until:
   Input.action_press("jump")
  else:
   Input.action_release("jump")
  if Time.get_ticks_msec()-last_attack>420:
   Input.action_press("attack")
   last_attack=Time.get_ticks_msec()
  await get_tree().process_frame
  Input.action_release("attack")
 return false
