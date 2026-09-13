extends Node2D
## Representative Foundry combat bay used to validate visual polish at the game's real
## camera scale. Playable. Set METROFORGE_POLISH_CAPTURE=1 to write review stills,
## 60fps motion strips, and a slow-motion attack pass. METROFORGE_POLISH_BIOME selects
## biome_0 / biome_1 / biome_2 tiles and parallax.

const ROOM := Vector2(960, 540)
const QA := "res://qa/visual-polish"

@onready var player: CharacterBody2D = $Player
@onready var enemy: CharacterBody2D = $Enemy

func _ready() -> void:
	GameManager.start_new_game()
	EventBus.ability_acquired.emit("dash")
	var biome := _biome_id()
	_apply_biome(biome)
	_load_far_sky(biome)
	_stamp_platform_visuals(biome)
	if has_node("/root/QualityPresentation"):
		QualityPresentation._rooms["visual_polish_slice"] = {
			"id": "visual_polish_slice",
			"width": ROOM.x,
			"height": ROOM.y,
			"biomeId": biome,
			"archetype": "combat",
			"platforms": [{"y": 336.0}],
		}
		QualityPresentation.apply_room(self, "visual_polish_slice")
	if OS.get_environment("METROFORGE_POLISH_CAPTURE") == "1":
		await _capture_pass()
		get_tree().quit()


func _biome_id() -> String:
	var requested := OS.get_environment("METROFORGE_POLISH_BIOME")
	if requested in ["biome_0", "biome_1", "biome_2"]:
		return requested
	return "biome_0"


func _apply_biome(biome: String) -> void:
	var ground := get_node_or_null("Ground")
	if ground:
		ground.set("biome_id", biome)
		if ground.has_method("_build_tilemap"):
			ground.clear()
			ground.call("_build_tilemap")
	var bg := get_node_or_null("Background") as ColorRect
	if bg:
		match biome:
			"biome_1":
				bg.color = Color(0.063, 0.122, 0.133, 1)
			"biome_2":
				bg.color = Color(0.086, 0.141, 0.102, 1)
			_:
				bg.color = Color(0.075, 0.118, 0.173, 1)


func _load_far_sky(biome: String) -> void:
	var sky := get_node_or_null("FarSky") as Sprite2D
	var path := "res://assets/backgrounds/%s/far.png" % biome
	if sky and ResourceLoader.exists(path):
		sky.texture = load(path)
		sky.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST


func _stamp_platform_visuals(biome: String) -> void:
	var path := "res://assets/tilesets/%s/source.png" % biome
	if not ResourceLoader.exists(path):
		return
	var tex: Texture2D = load(path)
	for i in 6:
		var s := Sprite2D.new()
		s.name = "PlatformTile_%d" % i
		s.texture = tex
		s.region_enabled = true
		s.region_rect = Rect2(96, 0, 32, 32)
		s.centered = false
		s.position = Vector2(544 + i * 32, 320)
		s.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		s.z_index = 1
		add_child(s)

func _capture_pass() -> void:
	Engine.max_fps = 60
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.35).timeout
	var biome := _biome_id()
	var qa := QA if biome == "biome_0" else "%s/%s" % [QA, biome]
	var full := biome == "biome_0"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(qa))
	var health := player.get_node_or_null("HealthComponent")
	if health:
		health.set("invulnerable", true)
	await _live_gameplay_pass(qa, full)
	await _ui_pass(qa)
	await _still_clips_pass(qa, full)


func _live_gameplay_pass(qa: String, full: bool) -> void:
	## Physics on, 60 fps. Slow-mo is not used here.
	var sprite := player.get_node_or_null("Sprite") as AnimatedSprite2D
	Input.action_press("move_right")
	await _motion_strip(qa, "live_run", sprite, 48, 60.0, "run")
	Input.action_release("move_right")
	Input.action_press("jump")
	await get_tree().create_timer(0.05).timeout
	Input.action_release("jump")
	await _motion_strip(qa, "live_jump", sprite, 36, 60.0, "jump")
	Input.action_press("attack")
	await get_tree().create_timer(0.05).timeout
	Input.action_release("attack")
	await _motion_strip(qa, "live_attack", sprite, 24, 60.0, "attack")
	await _shot(qa, "live_gameplay")
	if not full:
		return
	await _actor_live(qa, "Enemy", "live_melee")
	await _actor_live(qa, "RangedEnemy", "live_ranged")
	await _actor_live(qa, "FlyingEnemy", "live_flying")
	await _live_projectile(qa)
	await _live_boss(qa)


func _actor_live(qa: String, node_name: String, clip: String) -> void:
	var actor := get_node_or_null(node_name)
	if actor == null:
		return
	var asprite := actor.get_node_or_null("Sprite") as AnimatedSprite2D
	if asprite == null:
		return
	var origin: Vector2 = actor.global_position
	actor.global_position = player.global_position + Vector2(110, -24 if node_name == "FlyingEnemy" else 0)
	var play := "walk"
	if asprite.sprite_frames.has_animation("fly"):
		play = "fly"
	elif asprite.sprite_frames.has_animation("idle"):
		play = "idle"
	await _motion_strip(qa, clip, asprite, 36, 60.0, play)
	if is_instance_valid(actor):
		actor.global_position = origin


func _live_projectile(qa: String) -> void:
	var scene := load("res://scenes/enemies/Projectile.tscn") as PackedScene
	if scene == null:
		return
	var bolt := scene.instantiate()
	add_child(bolt)
	bolt.global_position = player.global_position + Vector2(72, -36)
	bolt.set("direction", Vector2.RIGHT)
	bolt.set("speed", 220.0)
	bolt.set("lifetime", 1.2)
	await get_tree().create_timer(0.12).timeout
	await _shot(qa, "projectile_trail")
	await _motion_strip(qa, "live_projectile", null, 24, 60.0)


func _live_boss(qa: String) -> void:
	var boss := get_node_or_null("Boss")
	if boss == null:
		return
	var asprite := boss.get_node_or_null("Sprite") as AnimatedSprite2D
	var origin: Vector2 = boss.global_position
	boss.global_position = player.global_position + Vector2(140, 0)
	if asprite and asprite.sprite_frames and asprite.sprite_frames.has_animation("telegraph"):
		asprite.play("telegraph")
		await _motion_strip(qa, "live_boss_telegraph", asprite, 30, 60.0, "telegraph")
	if asprite and asprite.sprite_frames and asprite.sprite_frames.has_animation("attack"):
		asprite.play("attack")
		await _motion_strip(qa, "live_boss_attack", asprite, 24, 60.0, "attack")
	boss.global_position = origin


func _ui_pass(qa: String) -> void:
	await _shot(qa, "hud_ingame")
	var pause := get_node_or_null("PauseMenu")
	if pause and pause.has_method("_open"):
		pause.call("_open")
		await get_tree().process_frame
		await _shot(qa, "pause_menu")
		if pause.has_method("_close"):
			pause.call("_close")
	var overlay := get_tree().get_first_node_in_group("dialogue_overlay")
	if overlay and overlay.has_method("start_dialogue"):
		overlay.call("start_dialogue", "dlg_npc_000_lore", "Keeper", {"role": "lore"})
		await get_tree().process_frame
		await _shot(qa, "npc_dialogue")
		if overlay.has_method("close_dialogue"):
			overlay.call("close_dialogue")
	var title := load("res://scenes/boot/Main.tscn") as PackedScene
	if title:
		var layer := CanvasLayer.new()
		layer.layer = 30
		add_child(layer)
		var menu := title.instantiate()
		layer.add_child(menu)
		await get_tree().process_frame
		await get_tree().process_frame
		await _shot(qa, "title_menu")
		layer.queue_free()


func _still_clips_pass(qa: String, full: bool) -> void:
	var sprite := player.get_node_or_null("Sprite") as AnimatedSprite2D
	var actors: Array[Node] = []
	for name in ["Enemy", "RangedEnemy", "FlyingEnemy", "NPC", "Boss"]:
		var node := get_node_or_null(name)
		if node:
			actors.append(node)
			if node.has_method("set_physics_process"):
				node.set_physics_process(false)
	player.set_physics_process(false)
	var boss := get_node_or_null("Boss")
	if boss and boss.has_method("freeze_presentation"):
		boss.freeze_presentation()
	if sprite:
		for clip in ["idle", "run", "walk", "jump", "fall", "land", "attack"]:
			if sprite.sprite_frames and sprite.sprite_frames.has_animation(clip):
				sprite.play(clip)
				await get_tree().create_timer(0.28).timeout
				await _shot(qa, "player_%s" % clip)
				if full and clip in ["idle", "run", "attack"]:
					await _motion_strip(qa, clip, sprite, 60, 60.0)
		if full:
			Engine.time_scale = 0.25
			sprite.play("attack")
			await _motion_strip(qa, "attack_slow", sprite, 24, 60.0, "attack")
			Engine.time_scale = 1.0
	for actor in actors:
		var asprite := actor.get_node_or_null("Sprite") as AnimatedSprite2D
		if asprite == null or asprite.sprite_frames == null:
			continue
		var origin: Vector2 = actor.global_position
		var staged := player.global_position + Vector2(96, 0)
		if actor.name == "FlyingEnemy":
			staged.y -= 48
		if actor.name == "Boss":
			staged = player.global_position + Vector2(120, 0)
		actor.global_position = staged
		var clip := "idle"
		if asprite.sprite_frames.has_animation("fly"):
			clip = "fly"
		elif asprite.sprite_frames.has_animation("idle"):
			clip = "idle"
		elif asprite.sprite_frames.has_animation("walk"):
			clip = "walk"
		asprite.play(clip)
		await get_tree().create_timer(0.2).timeout
		await _shot(qa, "%s_%s" % [String(actor.name).to_snake_case(), clip])
		if asprite.sprite_frames.has_animation("attack"):
			asprite.play("attack")
			await get_tree().create_timer(0.2).timeout
			await _shot(qa, "%s_attack" % String(actor.name).to_snake_case())
		if asprite.sprite_frames.has_animation("telegraph"):
			asprite.play("telegraph")
			await get_tree().create_timer(0.2).timeout
			await _shot(qa, "%s_telegraph" % String(actor.name).to_snake_case())
		actor.global_position = origin
	player.set_physics_process(true)
	for actor in actors:
		if actor.has_method("set_physics_process"):
			actor.set_physics_process(true)

func _shot(qa: String, name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	if img and not img.is_empty():
		img.save_png(ProjectSettings.globalize_path("%s/%s.png" % [qa, name]))

func _motion_strip(qa: String, clip: String, sprite: AnimatedSprite2D, frames: int, fps: float, anim: String = "") -> void:
	var dir := "%s/motion_%s" % [qa, clip]
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(dir))
	var play_name := anim if not anim.is_empty() else clip
	if sprite and sprite.sprite_frames and sprite.sprite_frames.has_animation(play_name):
		sprite.play(play_name)
	for i in frames:
		await get_tree().create_timer(1.0 / fps).timeout
		await RenderingServer.frame_post_draw
		var img := get_viewport().get_texture().get_image()
		if img and not img.is_empty():
			img.save_png(ProjectSettings.globalize_path("%s/f%02d.png" % [dir, i]))
