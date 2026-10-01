class_name HurtboxComponent
extends Area2D

signal hit_received(damage: float, knockback: Vector2)

## Last hitbox/hurtbox contact in global space. HealthComponent consumes this for impact VFX.
var last_hit_contact: Vector2 = Vector2.ZERO
var has_last_hit_contact: bool = false

func receive_hit(
	damage: float,
	knockback_force: float,
	attacker: Node2D,
	contact_global: Vector2 = Vector2(INF, INF),
) -> void:
	if contact_global.is_finite():
		last_hit_contact = contact_global
		has_last_hit_contact = true
	elif attacker != null and is_instance_valid(attacker):
		last_hit_contact = global_position.lerp(attacker.global_position, 0.35)
		has_last_hit_contact = true
	else:
		last_hit_contact = global_position
		has_last_hit_contact = true
	var direction := Vector2.RIGHT
	if attacker:
		direction = (global_position - attacker.global_position).normalized()
	hit_received.emit(damage, direction * knockback_force)

func take_last_hit_contact() -> Variant:
	if not has_last_hit_contact:
		return null
	has_last_hit_contact = false
	return last_hit_contact
