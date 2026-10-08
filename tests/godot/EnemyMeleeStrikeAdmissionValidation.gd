extends Node2D
var checks:Array=[]
var enemy
func check(label:String,passed:bool)->void:
	checks.append({"label":label,"passed":passed})
	print("STRIKE_GUARD ",JSON.stringify(checks.back()))
func admitted(clip:Dictionary,amount:float=14.0)->bool:
	var file=FileAccess.open("res://qa/window-fixture.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"attack":clip}))
	file.close()
	var helper=preload("res://scripts/combat/EnemyMeleeStrike.gd").new()
	var result:bool=helper.configure(enemy,enemy.sprite,"res://qa/window-fixture.json",amount)
	helper.free()
	return result
func _ready()->void:
	process_mode=Node.PROCESS_MODE_ALWAYS
	GameManager.start_new_game()
	enemy=load("res://scenes/enemies/Enemy.tscn").instantiate()
	enemy.enemy_id="enemy_000"
	enemy.process_mode=Node.PROCESS_MODE_PAUSABLE
	add_child(enemy)
	# Controlled lifecycle states; natural damage is covered by StrikeValidation.
	enemy.set_physics_process(false)
	var valid:Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://assets/enemies/enemy_000_animations.json")).attack
	check("valid loaded six-frame window admitted",admitted(valid))
	var bad:=valid.duplicate(true)
	bad.erase("hitWindow")
	check("legacy clip without window is inert",not admitted(bad))
	var cases=[{"frames":[]},{"frames":[-1]},{"frames":[6]},{"frames":[2.5]},{"frames":[2,2]},{"frames":[2,4]},{"frames":"2"},{"rect":[24,-52,0,20]},{"rect":[24,-52,32,-1]},{"rect":[999,-52,32,20]},{"rect":[24,-52,32]},{"rect":[24,null,32,20]}]
	for i in range(cases.size()):
		bad=valid.duplicate(true)
		for key in cases[i]:bad.hitWindow[key]=cases[i][key]
		check("malformed window rejected "+str(i),not admitted(bad))
	for change in [{"loop":true},{"loop":null},{"loop":0},{"loop":"false"},{"frameCount":5},{"frameCount":"6"},{"fps":8},{"fps":0},{"fps":null}]:
		bad=valid.duplicate(true)
		for key in change:bad[key]=change[key]
		check("unmatched loaded clip rejected "+JSON.stringify(change),not admitted(bad))
	check("zero damage rejected",not admitted(valid,0.0))
	var strike=enemy.get_node("AuthoredMeleeStrike")
	enemy.sprite.play("attack")
	enemy.sprite.set_frame_and_progress(2,0.0)
	check("contact frame activates spatial window",strike.hitbox.monitoring and strike.hitbox.global_position==enemy.global_position+Vector2(40,-42))
	get_tree().paused=true
	await get_tree().create_timer(0.2,true).timeout
	check("tree pause freezes contact pose",enemy.sprite.frame==2 and strike.hitbox.monitoring)
	get_tree().paused=false
	enemy._hurt_timer=0.25
	strike._refresh()
	check("hurt state interrupts weapon window",not strike.hitbox.monitoring)
	enemy._hurt_timer=0.0
	enemy._dying=true
	strike._refresh()
	check("death state keeps weapon disabled",not strike.hitbox.monitoring)
	enemy._dying=false
	enemy.sprite.play("idle")
	check("different clip clears weapon window",not strike.hitbox.monitoring)
	enemy.sprite.sprite_frames.remove_animation("hurt")
	enemy.sprite.play("attack")
	enemy.sprite.set_frame_and_progress(2,0.0)
	enemy.hurtbox.receive_hit(1.0,0.0,null)
	check("real hurt event cancels weapon without hurt art",strike.cancelled and not strike.hitbox.monitoring and enemy.sprite.animation=="attack")
	enemy.sprite.set_frame_and_progress(3,0.0)
	check("cancelled swing stays disabled",strike.cancelled and not strike.hitbox.monitoring)
	enemy.sprite.stop()
	enemy.sprite.play("attack")
	enemy.sprite.set_frame_and_progress(2,0.0)
	check("replayed same clip re-arms next swing",not strike.cancelled and strike.hitbox.monitoring)
	var legacy=load("res://scenes/enemies/Enemy.tscn").instantiate()
	legacy.enemy_id="enemy_default"
	add_child(legacy)
	check("default melee enemy has no extra strike but standing contact",not legacy.has_node("AuthoredMeleeStrike") and legacy.contact_hitbox.monitoring)
	legacy.queue_free()
	enemy.queue_free()
	await get_tree().process_frame
	await get_tree().physics_frame
	check("removed enemy frees owned weapon node",not is_instance_valid(strike))
	await get_tree().create_timer(0.4,true).timeout
	var passed:=checks.all(func(row):return row.passed)
	var file=FileAccess.open("res://qa/strike-guards-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled metadata and lifecycle guard fixture; natural damage and whole gameplay are separate."},"\t"))
	file.close()
	get_tree().quit(0 if passed else 1)
