extends Node
## Arena fixture setup is controlled; AI state/velocity/health are not overridden.
func _ready() -> void:
	GameManager.start_new_game()
	var floor_body := StaticBody2D.new()
	var floor_shape := CollisionShape2D.new()
	var rectangle := RectangleShape2D.new()
	rectangle.size = Vector2(1200,32)
	floor_shape.shape = rectangle
	floor_body.position = Vector2(600,416)
	floor_body.add_child(floor_shape)
	add_child(floor_body)
	var player = load("res://scenes/player/Player.tscn").instantiate()
	player.position = Vector2(280,400)
	add_child(player)
	var enemy = load("res://scenes/enemies/Enemy.tscn").instantiate()
	enemy.enemy_id = "enemy_005"
	enemy.position = Vector2(180,400)
	var sprite = enemy.get_node("Sprite")
	sprite.sheet_path = "assets/qa-run/enemy_000_walk.png"
	sprite.run_sheet_path = "assets/qa-run/enemy_000_run.png"
	add_child(enemy)
	var charged := false
	var fast := false
	var run_played := false
	var poses: Dictionary = {}
	for tick in range(150):
		await get_tree().physics_frame
		charged = charged or enemy._charging
		fast = fast or absf(enemy.velocity.x)>enemy.move_speed*1.45
		if sprite.animation=="run" and sprite.is_playing():
			run_played = true
			poses[sprite.frame] = true
	var checks := {"generated_charge_definition_loaded":enemy._movement=="charge","ai_awakened":enemy._awakened,"natural_charge_seen":charged,"fast_charge_velocity_seen":fast,"run_clip_played":run_played,"multiple_run_poses":poses.size()>1}
	var passed := true
	for value in checks.values(): passed = passed and value
	var file := FileAccess.open("res://natural-charge-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"runPoses":poses.keys(),"scope":"Controlled floor and actor placement, existing enemy005 data, active natural AI and real player. Uses test-generated enemy000 run art for playback, not enemy005 art acceptance or full campaign."},"\t"))
	file.close()
	print("NATURAL_CHARGE_RESULT ",JSON.stringify({"passed":passed,"checks":checks}))
	get_tree().quit(0 if passed else 1)
