extends Node
func _ready() -> void:
 GameManager.start_new_game()
 var world=load("res://scenes/world/World.tscn").instantiate()
 add_child(world)
 await get_tree().create_timer(0.5).timeout
 var checks=[]
 for id in ["room_000","room_001","room_002","room_003","room_004","room_005","room_006","room_007","room_040","room_041","room_042"]:
  await world._load_room(id,"left")
  await get_tree().create_timer(0.15).timeout
  var kit=world._current_room.find_child("ThemedRoomKit",true,false)
  checks.append({"label":id+" theme loaded","passed":kit!=null})
  if kit==null:
   continue
  for door in world._current_room.get_children():
   if not door.is_in_group("room_transition"):
    continue
   var destination=load("res://scenes/rooms/"+door.target_room_id+".tscn").instantiate()
   var reciprocal=false
   var inverse={"left":"right","right":"left","up":"down","down":"up"}
   for return_door in destination.get_children():
    if return_door.get("target_room_id")==id and return_door.get("transition_direction")==inverse[door.transition_direction]:
     reciprocal=true
   checks.append({"label":id+" reciprocal "+door.transition_direction+" to "+door.target_room_id,"passed":reciprocal})
   destination.free()
  for pair in kit.doorway_views:
   var door=pair.door
   var sprite=pair.sprite
   var role=String(sprite.get_meta("asset_role"))
   var bounds=kit.parts[role].entry.opaqueBounds
   var bottom=Vector2(float(bounds[0])+float(bounds[2])*0.5,float(bounds[1])+float(bounds[3]))
   var anchor=sprite.position+(bottom-sprite.texture.get_size()*0.5)*sprite.scale
   checks.append({"label":id+" doorway to "+door.target_room_id,"passed":ResourceLoader.exists("res://scenes/rooms/"+door.target_room_id+".tscn") and sprite.get_meta("transition_target")==door.target_room_id and anchor.distance_to(sprite.get_meta("anchor"))<0.01})
 var passed=true
 for row in checks:
  passed=passed and row.passed
  print("DOOR_OWNERSHIP "+JSON.stringify(row))
 DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/door-ownership"))
 var file=FileAccess.open("user://qa/door-ownership/proof.json",FileAccess.WRITE)
 file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Native room loads, doorway target existence and opaque-bound threshold alignment. Gameplay traversal separately tested."},"\t"))
 file.close()
 AudioManager.request_quit(0 if passed else 1)

