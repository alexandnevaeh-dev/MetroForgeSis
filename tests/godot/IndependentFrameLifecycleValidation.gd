extends Node2D
var checks: Array = []
func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("FRAME_LIFECYCLE_CHECK ",JSON.stringify(checks.back()))
func _ready() -> void:
	GameManager.start_new_game()
	var enemy = load("res://scenes/enemies/Enemy.tscn").instantiate()
	enemy.enemy_id = "enemy_000"
	enemy.position = Vector2(640,256)
	add_child(enemy)
	# Controlled presentation fixture; AI/combat acceptance is separate.
	enemy.set_physics_process(false)
	var sprite = enemy.get_node("Sprite")
	var expected_scale := 1.35*64.0/843.0
	check("sidecar loads eight walk frames in real enemy scene",sprite.sprite_frames.get_frame_count("walk")==8)
	check("idle uses declared single source pose",sprite.sprite_frames.get_frame_count("idle")==1)
	check("parent family scale composes with idle display scale",is_equal_approx(sprite.scale.y,expected_scale))
	var metadata: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/enemies/enemy_000_animations.json"))
	enemy.velocity.x = enemy.move_speed
	enemy._play_move("walk")
	var seen: Dictionary = {}
	var aligned := true
	var scale_preserved := true
	for tick in range(80):
		await get_tree().physics_frame
		seen[sprite.frame] = true
		var point: Array = metadata.walk.frameFootAnchors[sprite.frame]
		var expected := Vector2(627,627)-Vector2(point[0],point[1])
		aligned = aligned and sprite.offset.is_equal_approx(expected)
		scale_preserved = scale_preserved and is_equal_approx(sprite.scale.y,expected_scale)
	check("all eight walk frames play through real sprite lifecycle",seen.size()==8)
	check("frame changes preserve family times clip scale",scale_preserved)
	check("frame offsets follow declared source anchors",aligned)
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://qa/lifecycle-right.png")
	sprite.flip_h = true
	await get_tree().process_frame
	await get_tree().process_frame
	var point: Array = metadata.walk.frameFootAnchors[sprite.frame]
	var expected := Vector2(627,627)-Vector2(point[0],point[1])
	check("flip_h mirrors the current horizontal foot offset",is_equal_approx(sprite.offset.x,-expected.x))
	sprite.flip_h = false
	sprite.scale.x = -absf(sprite.scale.x)
	await get_tree().create_timer(0.2).timeout
	check("negative-scale facing survives frame presentation",sprite.scale.x<0 and is_equal_approx(absf(sprite.scale.x),expected_scale))
	enemy._play_move("attack")
	check("legacy attack returns to base family scale",is_equal_approx(absf(sprite.scale.x),1.35) and is_equal_approx(sprite.scale.y,1.35))
	var previous: Vector2 = sprite.scale
	check("nonfinite base scale is rejected",not sprite.set_base_presentation_scale(Vector2(NAN,1)))
	check("rejected base scale preserves presentation",sprite.scale==previous)
	var passed := true
	for row in checks: passed = passed and row.passed
	var file := FileAccess.open("res://qa/lifecycle-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Real enemy scene ready/parent scale, source-frame sidecar, playback, facing and legacy clip return. AI disabled and velocity supplied; not gameplay or completed actor-family approval."},"\t"))
	file.close()
	print("FRAME_LIFECYCLE_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
