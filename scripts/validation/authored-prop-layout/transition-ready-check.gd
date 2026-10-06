extends Node
func _ready() -> void:
 GameManager.start_new_game()
 var world=load("res://scenes/world/World.tscn").instantiate()
 add_child(world)
 var agent=PlaytestAgent.new()
 if not await agent._await_area_ready(world,self,"overworld"):
  get_tree().quit(1);return
 world.transition_to_room("dungeon_000_r0")
 var was_pending=world.is_transitioning()
 var ready=await agent._await_area_ready(world,self,"dungeon_000_r0")
 var wrong=await agent._await_area_ready(world,self,"missing_room")
 print("TRANSITION_READY_PASS=",was_pending and ready and not wrong)
 get_tree().quit(0 if was_pending and ready and not wrong else 1)
