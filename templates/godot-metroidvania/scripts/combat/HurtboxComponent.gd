class_name HurtboxComponent
extends Area2D

signal hit_received(damage: float, knockback: Vector2)

func receive_hit(damage: float, knockback_force: float, attacker: Node2D) -> void:
	var direction := Vector2.RIGHT
	if attacker:
		direction = (global_position - attacker.global_position).normalized()
	hit_received.emit(damage, direction * knockback_force)
