extends SceneTree
## Controlled native door-input regression; not a journey or visual acceptance.

class TestWorld extends Node:
	var transitions: int = 0
	func transition_to_room(_id: String, _side: String) -> void:
		transitions += 1

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var world := TestWorld.new()
	root.add_child(world)
	world.add_to_group("world_manager")
	var player := CharacterBody2D.new()
	root.add_child(player)
	player.add_to_group("player")
	var door := load("res://scenes/world/RoomTransition.tscn").instantiate() as Area2D
	door.target_room_id = "fixture_destination"
	door.transition_direction = "up"
	root.add_child(door)
	await process_frame
	door._loaded_at_msec = Time.get_ticks_msec() - 1000
	player.velocity.y = -100.0
	Input.action_release("move_up")
	assert(not door._try_transition(player), "Combat/traversal jump must not enter upward door")
	assert(world.transitions == 0)
	Input.action_press("move_up")
	assert(door._try_transition(player), "Explicit upward movement must enter upward door")
	assert(world.transitions == 1)
	player.velocity.y = 0.0
	assert(not door._try_transition(player), "Standing with Up held does not count as ascent")
	Input.action_release("move_up")
	door.transition_direction = "right"
	assert(door._try_transition(player), "Horizontal walking doors remain automatic")
	assert(world.transitions == 2)
	door.transition_direction = "down"
	player.velocity.y = 100.0
	assert(door._try_transition(player), "Downward falls remain automatic")
	assert(world.transitions == 3)
	print("UP_DOOR_INTENT_PASS checks=9 scope=controlled_native_input_regression")
	world.queue_free()
	player.queue_free()
	door.queue_free()
	await process_frame
	quit()
