extends Node2D
func _ready() -> void:
	call_deferred("run")
func run() -> void:
	var player = load("res://scenes/player/Player.tscn").instantiate()
	add_child(player)
	player.set_physics_process(false)
	player.facing=Vector2.LEFT
	player.facing_name="W"
	player._start_attack()
	player.facing=Vector2.RIGHT
	player.facing_name="E"
	player._update_attack_state(0.09)
	var first: Vector2 = player.attack_hitbox.position
	player._on_attack_finished()
	player._start_attack()
	player._update_attack_state(0.09)
	var second: Vector2 = player.attack_hitbox.position
	var passed: bool = first==Vector2(-22,0) and second==Vector2(22,0)
	var shape = player.attack_hitbox.get_node("CollisionShape2D")
	for direction in player.CARDINALS.values():
		player._on_attack_finished()
		player.facing=direction
		player._start_attack()
		player._update_attack_state(0.09)
		var offset: Vector2 = shape.global_position-player.global_position
		passed = passed and offset.is_equal_approx(direction*22.0)
		passed = passed and Vector2.RIGHT.rotated(shape.global_rotation).is_equal_approx(direction)
	print(JSON.stringify({"passed":passed,"firstSwing":str(first),"nextSwing":str(second),"scope":"Actual player starts left attack, turns right during startup; original hit direction retained, next attack uses right."}))
	get_tree().quit(0 if passed else 1)
