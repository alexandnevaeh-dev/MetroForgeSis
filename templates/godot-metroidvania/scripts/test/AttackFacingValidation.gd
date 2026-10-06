extends Node
var checks: Array = []
func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(1.0).timeout
	var player = get_tree().get_first_node_in_group("player")
	for direction in [1,-1]:
		Input.action_press("move_right" if direction > 0 else "move_left")
		for tick in range(4):
			await get_tree().physics_frame
		Input.action_release("move_right")
		Input.action_release("move_left")
		player._perform_attack()
		await get_tree().create_timer(0.4).timeout
		Input.action_press("move_left" if direction > 0 else "move_right")
		for tick in range(2):
			await get_tree().physics_frame
		var row = {"direction":direction,"facing":player.facing,"spriteSign":signf(player.sprite.scale.x),"hitboxSign":signf(player.attack_hitbox.position.x),"timerActive":not player.attack_timer.is_stopped()}
		row.passed = row.timerActive and row.facing == direction and row.spriteSign == direction and row.hitboxSign == direction
		checks.append(row)
		print("ATTACK_FACING " + JSON.stringify(row))
		if DisplayServer.get_name() != "headless":
			await RenderingServer.frame_post_draw
			DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/attack-facing"))
			get_viewport().get_texture().get_image().save_png("user://qa/attack-facing/swing_" + str(direction) + ".png")
		Input.action_release("move_right")
		Input.action_release("move_left")
		await get_tree().create_timer(0.8).timeout
		Input.action_press("move_left" if direction > 0 else "move_right")
		for tick in range(3):
			await get_tree().physics_frame
		var unlocked = {"direction":direction,"label":"turning resumes after swing","passed":player.facing == -direction and signf(player.sprite.scale.x) == -direction}
		checks.append(unlocked)
		print("ATTACK_FACING " + JSON.stringify(unlocked))
		Input.action_release("move_left")
		Input.action_release("move_right")
	var passed := true
	for row in checks:
		passed = passed and row.passed
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/attack-facing"))
	var file := FileAccess.open("user://qa/attack-facing/proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled attack start and real movement input during attack; sprite versus hitbox agreement in both directions."},"\t"))
	file.close()
	AudioManager.request_quit(0 if passed else 1)
