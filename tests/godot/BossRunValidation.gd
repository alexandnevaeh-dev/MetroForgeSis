extends Node

var checks := 0
var failures := 0
var legacy := OS.get_environment("METROFORGE_BOSS_MISSING_RUN") == "1"

func check(label: String, passed: bool) -> void:
	checks += 1
	if not passed: failures += 1
	print("BOSS_RUN_CHECK ","PASS " if passed else "FAIL ",label)

func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().create_timer(0.4).timeout
	for pair in [["room_008","boss_000"],["room_018","boss_001"],["room_028","boss_002"],["room_038","boss_final"]]:
		world._load_room(pair[0],"left")
		await get_tree().physics_frame
		await get_tree().physics_frame
		var boss = get_tree().get_first_node_in_group("bosses")
		var player = get_tree().get_first_node_in_group("player")
		check(pair[1]+" native actors exist",is_instance_valid(boss) and is_instance_valid(player))
		if not is_instance_valid(boss) or not is_instance_valid(player): continue
		# Controlled distance setup; normal BossController chooses velocity and clip.
		player.global_position = boss.global_position + Vector2(-430,0)
		var sprite = boss.get_node("Sprite")
		var selected := "walk" if legacy else "run"
		check(pair[1]+" expected run source availability",sprite.sprite_frames.get_frame_count("run")== (1 if legacy else 12))
		check(pair[1]+" locomotion cadence retained",sprite.sprite_frames.get_animation_speed(selected)==(6.0 if legacy else 14.0) and sprite.sprite_frames.get_animation_loop(selected))
		var bounded := true
		for i in range(sprite.sprite_frames.get_frame_count(selected)):
			var tex = sprite.sprite_frames.get_frame_texture(selected,i) as AtlasTexture
			bounded = bounded and tex!=null and tex.filter_clip and tex.region==Rect2(i*sprite.frame_size.x,0,sprite.frame_size.x,sprite.frame_size.y)
		check(pair[1]+" clipped locomotion cells",bounded)
		var frames := {}
		var moving := false
		var observation_start := Time.get_ticks_msec()
		var observation_seconds := 0.0
		while observation_seconds < 0.9 and Time.get_ticks_msec()-observation_start < 5000:
			await get_tree().process_frame
			observation_seconds += get_process_delta_time()
			if sprite.animation==selected and absf(boss.velocity.x)>90:
				moving=true
				frames[sprite.frame]=true
		print("BOSS_RUN_OBSERVATION ",pair[1]," frames=",frames.keys()," available=",sprite.sprite_frames.get_frame_count(selected)," clip=",sprite.animation," speed=",boss.velocity.x," phaseLocked=",boss._telegraph_active or boss._recovery_active)
		check(pair[1]+" natural chase selects "+selected,moving)
		var expected_poses := mini(4,sprite.sprite_frames.get_frame_count(selected))
		check(pair[1]+" natural chase advances available poses",expected_poses>1 and frames.size()>=expected_poses)
	for index in range(43):
		var id := "room_%03d" % index
		var path := "res://scenes/rooms/"+id+".tscn"
		if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]:
			await world._ensure_packed(id)
	print("BOSS_RUN_RESULT checks=",checks," failures=",failures)
	get_tree().quit(0 if failures==0 else 1)
