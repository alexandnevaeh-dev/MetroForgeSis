extends Node2D
var counts := {}
func _ready() -> void:
	call_deferred("run")
func target_at(where: Vector2, key: String) -> Node2D:
	var target := Node2D.new()
	target.position=where
	var hurt = load("res://scripts/combat/HurtboxComponent.gd").new()
	hurt.collision_layer=16
	hurt.collision_mask=0
	var collider := CollisionShape2D.new()
	var shape := CircleShape2D.new()
	shape.radius=3
	collider.shape=shape
	hurt.add_child(collider)
	target.add_child(hurt)
	counts[key]=0
	hurt.hit_received.connect(func(_damage, _knockback): counts[key]+=1)
	add_child(target)
	return target
func run() -> void:
	var player = load("res://scenes/player/Player.tscn").instantiate()
	add_child(player)
	player.set_physics_process(false)
	var results := []
	var passed := true
	for name in player.CARDINALS:
		var direction: Vector2=player.CARDINALS[name]
		var front=target_at(direction*22,"front")
		var back=target_at(-direction*22,"back")
		for i in range(3):
			await get_tree().physics_frame
		player.facing=direction
		player._start_attack()
		player._update_attack_state(0.09)
		for i in range(4):
			await get_tree().physics_frame
		front.position=direction*200
		for i in range(3):
			await get_tree().physics_frame
		front.position=direction*22
		for i in range(4):
			await get_tree().physics_frame
		var ok: bool=counts.front==1 and counts.back==0
		passed=passed and ok
		results.append({"direction":name,"frontHits":counts.front,"backHits":counts.back,"passed":ok})
		player._on_attack_finished()
		front.queue_free()
		back.queue_free()
		await get_tree().process_frame
	var result := {"passed":passed,"results":results,"scope":"Native physics area events, eight directions, front/back targets and same-swing reentry deduplication. No artwork or final gameplay approval."}
	var file=FileAccess.open("res://attack-collision-result.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(result,"  "))
	file.close()
	print(JSON.stringify(result))
	get_tree().quit(0 if passed else 1)
