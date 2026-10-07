extends Node
var checks: Array = []
var captures: Array = []
func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("CORAL_CHECK ",JSON.stringify(checks.back()))
func capture(label: String) -> void:
	await RenderingServer.frame_post_draw
	var path := "res://qa/coral-hero/"+label+".png"
	get_viewport().get_texture().get_image().save_png(path)
	captures.append(path)
func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://qa/coral-hero"))
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	for tick in range(12):
		await get_tree().process_frame
	var player = get_tree().get_first_node_in_group("player")
	check("actual top-down player exists",player!=null)
	if player==null:
		get_tree().quit(1)
		return
	var sprite: AnimatedSprite2D = player.get_node("Sprite")
	var clip: String = String(sprite.resolve_animation("idle","S"))
	var texture = sprite.sprite_frames.get_frame_texture(clip,0)
	var image: Image = texture.get_image()
	if image.is_compressed():
		image.decompress()
	image.convert(Image.FORMAT_RGBA8)
	var coral := 0
	for y in range(image.get_height()):
		for x in range(image.get_width()):
			var color := image.get_pixel(x,y)
			if color.a>0.99 and absf(color.r-208.0/255.0)<0.005 and absf(color.g-100.0/255.0)<0.005 and absf(color.b-101.0/255.0)<0.005:
				coral += 1
	check("native player has coral coat clusters",coral>30)
	check("native sampling isolates sprite cell",texture is AtlasTexture and texture.filter_clip)
	await capture("idle")
	var start: Vector2 = player.global_position
	var poses: Dictionary = {}
	Input.action_press("move_right")
	for tick in range(35):
		await get_tree().physics_frame
		poses[String(sprite.animation)+":"+str(sprite.frame)] = true
	Input.action_release("move_right")
	check("ordinary movement input moves the actor",player.global_position.x>start.x+10)
	check("walk uses multiple actual poses",poses.size()>3)
	await capture("walk")
	Input.action_press("attack")
	await get_tree().physics_frame
	Input.action_release("attack")
	var active_observed := false
	for tick in range(40):
		await get_tree().physics_frame
		await get_tree().process_frame
		if int(player.get("_attack_state"))==2:
			active_observed = true
			break
	check("attack input reaches active state",active_observed)
	check("attack uses the east directional clip",String(sprite.animation)=="attack_E")
	await capture("attack-active")
	var passed := true
	for row in checks:
		passed = passed and row.passed
	var file := FileAccess.open("res://qa/coral-hero/proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"captures":captures,"scope":"Fresh pipeline project and unpatched current templates; Input-only movement and attack, native coral clusters and clipping. Visual approval and full campaign remain separate."},"	"))
	file.close()
	print("CORAL_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
