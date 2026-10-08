extends Node2D
var checks:Array=[]
var enemy
var target:Node2D
var health:HealthComponent
var hits:Array=[]
func check(label:String,passed:bool)->void:
	checks.append({"label":label,"passed":passed})
	print("STRIKE_CHECK ",JSON.stringify(checks.back()))
func _ready()->void:
	GameManager.start_new_game()
	var floor:=StaticBody2D.new()
	floor.collision_layer=1
	var shape:=CollisionShape2D.new()
	shape.shape=RectangleShape2D.new()
	shape.shape.size=Vector2(1600,64)
	floor.position=Vector2(640,288)
	floor.add_child(shape)
	add_child(floor)
	target=Node2D.new()
	target.add_to_group("player")
	add_child(target)
	health=HealthComponent.new()
	health.name="HealthComponent"
	target.add_child(health)
	var hurt:=HurtboxComponent.new()
	hurt.name="HurtboxComponent"
	hurt.collision_layer=16
	hurt.collision_mask=8
	var hurt_shape:=CollisionShape2D.new()
	hurt_shape.shape=RectangleShape2D.new()
	hurt_shape.shape.size=Vector2(20,24)
	hurt_shape.position=Vector2(0,-42)
	hurt.add_child(hurt_shape)
	target.add_child(hurt)
	hurt.hit_received.connect(func(damage, _knockback):
		hits.append({"frame":enemy.sprite.frame,"animation":enemy.sprite.animation,"damage":damage})
		health.take_damage(damage))
	enemy=load("res://scenes/enemies/Enemy.tscn").instantiate()
	enemy.enemy_id="enemy_000"
	enemy.position=Vector2(640,256)
	add_child(enemy)
	var strike=enemy.get_node_or_null("AuthoredMeleeStrike")
	check("real melee enemy admits authored strike window",strike!=null)
	check("standing contact remains active",enemy.contact_hitbox.monitoring)
	if strike:
		print("STRIKE_TRANSFORMS ",JSON.stringify({"enemy":enemy.global_position,"weapon":strike.hitbox.global_position,"expected":enemy.global_position+Vector2(40,-42),"parentType":strike.get_class()}))
	for side in [-1,1]:
		var before:=hits.size()
		var start:=Time.get_ticks_msec()
		while hits.size()==before and Time.get_ticks_msec()-start<6000:
			target.global_position=enemy.global_position+Vector2(side*44,0)
			await get_tree().physics_frame
		check("natural attack hits target facing "+str(side),hits.size()==before+1)
		if hits.size()>before:
			check("damage occurs on declared contact frame facing "+str(side),hits.back().frame==2 and hits.back().animation=="attack" and hits.back().damage==enemy.contact_damage)
		var deadline:=Time.get_ticks_msec()+1500
		while enemy.sprite.animation=="attack" and enemy.sprite.is_playing() and Time.get_ticks_msec()<deadline:
			target.global_position=enemy.global_position+Vector2(side*44,0)
			await get_tree().physics_frame
		check("recovery disables weapon and deduplicates swing facing "+str(side),strike!=null and not strike.hitbox.monitoring and hits.size()==before+1)
	check("real health component receives two normal-damage hits",is_equal_approx(health.current_health,100.0-2.0*enemy.contact_damage))
	var passed:=checks.all(func(row):return row.passed)
	var file:=FileAccess.open("res://qa/strike-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"hits":hits,"scope":"Real enemy/strike/hurtbox/health; controlled following target outside standing-contact reach. No full-game or artwork admission."},"\t"))
	file.close()
	get_tree().quit(0 if passed else 1)
