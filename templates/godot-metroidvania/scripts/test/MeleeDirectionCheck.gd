extends Node
func _ready() -> void:
	var player = load("res://scenes/player/Player.tscn").instantiate()
	add_child(player)
	player.set_physics_process(false)
	var shape = player.get_node("AttackHitbox/CollisionShape2D")
	var passed := true
	for direction in [-1, 1]:
		player.facing = direction
		player._perform_attack()
		await get_tree().physics_frame
		player.attack_hitbox.deactivate()
		var offset = shape.global_position.x - player.global_position.x
		var correct = is_equal_approx(offset, 30.0 * direction)
		passed = passed and correct
		print("MELEE_DIRECTION direction=%s offset=%s passed=%s" % [direction, offset, correct])
	get_tree().quit(0 if passed else 1)
