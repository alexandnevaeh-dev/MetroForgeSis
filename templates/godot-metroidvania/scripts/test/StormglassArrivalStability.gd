extends Node
## One initial room setup; the complete backroom loop uses native movement.
## Encounters are removed explicitly so this is route, not combat acceptance.
var world: Node
var checks: Array = []

func check(label: String, passed: bool) -> bool:
	checks.append({"label":label,"passed":passed})
	print("BACKROOM_LOOP ","PASS " if passed else "FAIL ",label)
	return passed

func clear_encounters() -> void:
	for enemy in get_tree().get_nodes_in_group("enemies"):
		enemy.queue_free()

var cycle := 0
var arrivals: Array = []

func capture_room() -> void:
	if DisplayServer.get_name()=="headless":
		return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/arrival-stability"))
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("user://qa/arrival-stability/"+GameManager.current_room_id+"-cycle-"+str(cycle)+".png")

func walk_to_x(x: float, timeout: float = 12.0) -> bool:
	var elapsed := 0.0
	while elapsed < timeout:
		var player = get_tree().get_first_node_in_group("player")
		if player == null:
			return false
		Input.action_release("move_left")
		Input.action_release("move_right")
		if absf(player.position.x-x)<8.0:
			return true
		Input.action_press("move_right" if player.position.x<x else "move_left")
		await get_tree().create_timer(0.05).timeout
		elapsed += 0.05
	Input.action_release("move_left")
	Input.action_release("move_right")
	var actor = get_tree().get_first_node_in_group("player")
	if actor:
		print("BACKROOM_WALK_TIMEOUT room=",GameManager.current_room_id," pos=",actor.position," targetX=",x," velocity=",actor.velocity)
		for i in range(actor.get_slide_collision_count()):
			print("BACKROOM_CONTACT ",actor.get_slide_collision(i).get_collider().name)
	return false

func walk_exit(target: String, direction: String) -> bool:
	var elapsed := 0.0
	Input.action_press(direction)
	while GameManager.current_room_id != target and elapsed < 14.0:
		await get_tree().create_timer(0.05).timeout
		elapsed += 0.05
	Input.action_release(direction)
	await get_tree().create_timer(0.8).timeout
	clear_encounters()
	await capture_room()
	return GameManager.current_room_id == target

func finish() -> void:
	for action in ["move_left","move_right","move_down","move_up","jump"]:
		Input.action_release(action)
	var passed := true
	for row in checks:
		passed = passed and row.passed
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/arrival-stability"))
	var file := FileAccess.open("user://qa/arrival-stability/proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"arrivals":arrivals,"scope":"Three input-driven Echo descent/return cycles with five-second idle arrival checks; initial setup and encounters removed. No combat or earned-progression acceptance."},"\t"))
	file.close()
	print("BACKROOM_LOOP_RESULT passed=",passed," checks=",checks.size())
	AudioManager.request_quit(0 if passed else 1)

func _ready() -> void:
	GameManager.start_new_game()
	world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.5).timeout
	await world._load_room("room_007","left")
	await get_tree().create_timer(0.8).timeout
	clear_encounters()
	for iteration in range(3):
		cycle = iteration + 1
		if not check("cycle "+str(cycle)+" approach Echo descent",await walk_to_x(512)):
			finish(); return
		var elapsed := 0.0
		while GameManager.current_room_id != "room_040" and elapsed < 8.0:
			await get_tree().create_timer(0.1).timeout
			elapsed += 0.1
		if not check("cycle "+str(cycle)+" actual down transition",GameManager.current_room_id=="room_040"):
			finish(); return
		await get_tree().create_timer(0.8).timeout
		clear_encounters()
		# Incoming top spawn falls onto the upper flight. Walk to its exit,
		# then use the real upward door to return; no room loads in the loop.
		if not check("cycle "+str(cycle)+" approach upper stair exit",await walk_to_x(520)):
			finish(); return
		Input.action_press("move_up")
		Input.action_press("jump")
		await get_tree().create_timer(0.1).timeout
		Input.action_release("jump")
		elapsed = 0.0
		while GameManager.current_room_id != "room_007" and elapsed < 4.0:
			await get_tree().create_timer(0.1).timeout
			elapsed += 0.1
		Input.action_release("move_up")
		if not check("cycle "+str(cycle)+" actual up transition",GameManager.current_room_id=="room_007"):
			finish(); return
		clear_encounters()
		await get_tree().create_timer(0.8).timeout
		var actor = get_tree().get_first_node_in_group("player")
		var initial: Vector2 = actor.position
		var stable := true
		var grounded := true
		var maximum_drift := 0.0
		for sample in range(100):
			await get_tree().create_timer(0.05).timeout
			actor = get_tree().get_first_node_in_group("player")
			if actor == null or GameManager.current_room_id != "room_007":
				stable = false
				break
			grounded = grounded and actor.is_on_floor()
			maximum_drift = maxf(maximum_drift,actor.position.distance_to(initial))
		arrivals.append({"cycle":cycle,"start":str(initial),"maximumDrift":maximum_drift,"samples":100,"roomRetained":stable,"grounded":grounded})
		if not check("cycle "+str(cycle)+" idle retains Echo room",stable):
			finish(); return
		check("cycle "+str(cycle)+" grounded through five seconds",grounded)
		check("cycle "+str(cycle)+" arrival drift below two pixels",maximum_drift<2.0)
		await capture_room()
	finish()
