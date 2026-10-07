extends Node
## Controlled real controller playback; natural charge AI/campaign separate.
var checks: Array = []
func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("ENEMY_RUN_CHECK ",JSON.stringify(checks.back()))
func _ready() -> void:
	var enemy = load("res://scenes/enemies/Enemy.tscn").instantiate()
	enemy.enemy_id = "enemy_000"
	var sprite = enemy.get_node("Sprite")
	sprite.sheet_path = "assets/qa-run/enemy_000_walk.png"
	sprite.run_sheet_path = "assets/qa-run/enemy_000_run.png"
	add_child(enemy)
	enemy.set_physics_process(false)
	check("run loads twelve actual frames",sprite.sprite_frames.get_frame_count("run")==12)
	var clipped := true
	for index in range(12):
		var texture = sprite.sprite_frames.get_frame_texture("run",index)
		clipped = clipped and texture is AtlasTexture and texture.filter_clip and texture.region==Rect2(index*64,0,64,64)
	check("run atlas slices are exact and clipped",clipped)
	enemy.velocity.x = enemy.move_speed*enemy.CHARGE_SPEED_MULT
	enemy._play_move("run")
	check("real movement playback selects run",sprite.animation=="run" and sprite.is_playing())
	check("charge speed uses authored cadence reference",is_equal_approx(sprite.speed_scale,1.0))
	var poses: Dictionary = {}
	for tick in range(45):
		await get_tree().physics_frame
		poses[sprite.frame] = true
	check("run advances across multiple frames",poses.size()>3)
	var passed := true
	for row in checks: passed = passed and row.passed
	var file := FileAccess.open("res://enemy-run-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled EnemyController run playback and exact atlas slicing. AI disabled, charge velocity supplied. Natural charge combat and full generation remain separate."},"\t"))
	file.close()
	print("ENEMY_RUN_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
