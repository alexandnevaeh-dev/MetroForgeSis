extends Node
## Controlled visual demonstration of the actual sprite strips in the 3D runtime.
## The separate route proves input-driven traversal and combat.
var failures := 0
var frames := 0
const DIRECTORY := "res://.qa/animation-showcase"
func check(label: String, ok: bool) -> void:
	print(("PASS: " if ok else "FAIL: ")+label)
	if not ok: failures += 1
func _ready() -> void:
	Engine.max_fps = 60
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DIRECTORY))
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.2).timeout
	world.load_area("dungeon_000_r3")
	await get_tree().create_timer(0.2).timeout
	var player = get_tree().get_first_node_in_group("player")
	player.set_physics_process(false)
	player.global_position = Vector2(320,352)
	var actors: Array[AnimatedSprite2D] = [player.get_node("Sprite")]
	for index in range(2):
		var enemy = load("res://scenes/enemies/Enemy.tscn").instantiate()
		enemy.enemy_id = "enemy_000" if index==0 else "enemy_001"
		world.get_current_entities().add_child(enemy)
		enemy.global_position = Vector2(420+index*100,352)
		enemy.set_physics_process(false)
		actors.append(enemy.get_node("Sprite"))
	for entity in world.get_current_entities().get_children():
		if entity.scene_file_path.ends_with("Boss.tscn"):
			entity.set_physics_process(false)
			# Its asynchronous attack loop also needs isolation for this pose demonstration.
			# Do not emit death: the input-driven route separately proves the live fight.
			entity.health.current_health = 0
			entity.global_position = Vector2(650,352)
			actors.append(entity.get_node("Sprite"))
	check("four_actual_actor_families",actors.size()==4)
	var metadata_paths := ["characters/player","enemies/enemy_000","enemies/enemy_001","bosses/boss_final"]
	for index in range(actors.size()):
		var contract: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/"+metadata_paths[index]+"_animations.json"))
		for action: String in contract:
			var animation: String = action+"_S" if index==0 else action
			check("actor_%d_%s_authored_timing" % [index,action],is_equal_approx(actors[index].sprite_frames.get_animation_speed(animation),float(contract[action].fps)) and actors[index].sprite_frames.get_animation_loop(animation)==bool(contract[action].loop))
	var overlay := CanvasLayer.new()
	add_child(overlay)
	var label := Label.new()
	label.position = Vector2(350,18)
	label.add_theme_font_size_override("font_size",19)
	label.add_theme_color_override("font_color",Color("dae2b5"))
	overlay.add_child(label)
	for state in ["idle","walk","run","attack","hurt","death","cast"]:
		label.text = "ANIMATION TEST: "+state.to_upper()+"\nHero / Sentinel / Rune-Stalker / Hollow Crown"
		if state=="cast": label.text += "\nHero casts; the other actors demonstrate their attack strips."
		# Encoding PNGs during playback stalls the frame clock and can skip short poses.
		# Buffer one state, pause its actors, then write; controller strips still play normally.
		# Start after the previous frame has consumed the disk-write delay, not at
		# process_frame where that large delta can immediately jump a new strip.
		await RenderingServer.frame_post_draw
		var changed: Array[Dictionary] = []
		for index in range(actors.size()):
			var animation: String = state+"_S" if index==0 else ("attack" if state=="cast" else state)
			check("actor_%d_%s_uses_authored_strip" % [index,state],actors[index].sprite_frames.has_animation(animation))
			actors[index].play(animation)
			actors[index].set_frame_and_progress(0,0.0)
			changed.append({0:true})
		var recorded: Array[Image] = []
		var started := Time.get_ticks_msec()
		for frame in range(80):
			await RenderingServer.frame_post_draw
			for index in range(actors.size()): changed[index][actors[index].frame]=true
			recorded.append(get_viewport().get_texture().get_image())
		print("SHOWCASE_SAMPLE ",state," frames=",recorded.size()," milliseconds=",Time.get_ticks_msec()-started)
		for index in range(actors.size()):
			print("SHOWCASE_CLIP ",state," actor=",index," expected=",actors[index].sprite_frames.get_frame_count(actors[index].animation)," fps=",actors[index].sprite_frames.get_animation_speed(actors[index].animation)," scale=",actors[index].speed_scale," seen=",changed[index].keys())
			check("actor_%d_%s_advances_full_strip" % [index,state],changed[index].size()==actors[index].sprite_frames.get_frame_count(actors[index].animation))
			actors[index].pause()
		for image in recorded:
			if image.save_png(DIRECTORY+"/frame_%04d.png" % frames)!=OK: failures += 1
			frames += 1
		recorded.clear()
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(DIRECTORY+"/"+state+".png")
	print("CANOPY_ANIMATION_SHOWCASE_END")
	FileAccess.open(DIRECTORY+"/results.json",FileAccess.WRITE).store_string(JSON.stringify({"failures":failures,"frames":frames}))
	get_tree().quit(0 if failures==0 else 1)
