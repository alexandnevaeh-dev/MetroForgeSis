extends Node
func _ready() -> void:
	var failures: Array[String]=[]
	for boss in [false,true]:
		for combat in ["melee","projectile"]:
			var enemy=load("res://scenes/enemies/Enemy.tscn").instantiate()
			enemy.is_boss=boss
			add_child(enemy)
			enemy.set_physics_process(false)
			enemy._combat_type=combat
			var sound: String="boss_attack" if boss else "enemy_attack"
			AudioManager._last_played_frame.erase(sound)
			enemy._begin_windup(Vector2.RIGHT)
			enemy._process_combat_state(0.1)
			if AudioManager._last_played_frame.has(sound): failures.append("Early sound")
			enemy._on_hit(1.0,Vector2.ZERO)
			enemy._process_combat_state(0.3)
			if AudioManager._last_played_frame.has(sound): failures.append("Interrupted attack sounded")
			enemy._begin_windup(Vector2.RIGHT)
			enemy._process_combat_state(0.3)
			var release_frame: int=AudioManager._last_played_frame.get(sound,-1)
			if release_frame<0:failures.append("Missing release sound")
			var loaded:=false
			for player in AudioManager._sfx_pool:
				if player.stream and player.stream.resource_path.ends_with(sound+".wav"):loaded=true
			if not loaded:failures.append("Sound not loaded")
			await get_tree().process_frame
			enemy._process_combat_state(0.15)
			await get_tree().process_frame
			enemy._process_combat_state(0.5)
			if AudioManager._last_played_frame.get(sound,-1)!=release_frame:failures.append("Repeated release sound")
			enemy.queue_free()
			await get_tree().process_frame
			print("AUDIO_CASE ",boss," ",combat," failures=",failures.size())
	print("AUDIO_TIMING_PASS=",failures.is_empty()," ",failures)
	for child in get_children():child.queue_free()
	for player in AudioManager._sfx_pool:
		player.stop()
		player.stream=null
	await get_tree().process_frame
	get_tree().quit(0 if failures.is_empty() else 1)
