extends Node
var hits: Array[int] = []
func _ready() -> void:
	var player = load("res://scenes/player/Player.tscn").instantiate()
	add_child(player)
	player.set_physics_process(false)
	for direction in [-1, 1]:
		var target := Node2D.new()
		target.position = Vector2(30 * direction, -20)
		var hurt := HurtboxComponent.new()
		hurt.collision_layer = 16
		hurt.collision_mask = 0
		var collider := CollisionShape2D.new()
		var rectangle := RectangleShape2D.new()
		rectangle.size = Vector2(8, 8)
		collider.shape = rectangle
		hurt.add_child(collider)
		target.add_child(hurt)
		hurt.hit_received.connect(func(_damage: float, _knockback: Vector2) -> void: hits.append(direction))
		add_child(target)
	for i in 3:
		await get_tree().physics_frame
	var passed := true
	for direction in [-1, 1]:
		hits.clear()
		player.facing = direction
		player._perform_attack()
		for i in 3:
			await get_tree().physics_frame
		var shape = player.get_node("AttackHitbox/CollisionShape2D")
		var offset = shape.global_position.x - player.global_position.x
		var correct = is_equal_approx(offset, 30.0 * direction) and hits == [direction]
		passed = passed and correct
		print("MELEE_DIRECTION direction=%s offset=%s hits=%s passed=%s" % [direction, offset, hits, correct])
		player.attack_hitbox.deactivate()
		await get_tree().create_timer(0.2).timeout
	get_tree().quit(0 if passed else 1)
