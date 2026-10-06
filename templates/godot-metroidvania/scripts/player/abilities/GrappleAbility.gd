extends PlayerAbility

class_name GrappleAbility



func _init() -> void:

	super._init("grapple")



func process_physics(controller: AbilityController, delta: float) -> bool:

	if not controller.is_grappling:

		return false

	var to_target := controller.grapple_target - controller.player.global_position

	if to_target.length() <= 14.0:

		controller.is_grappling = false

		controller.player.velocity = Vector2.ZERO

		return false

	controller.player.velocity = to_target.normalized() * controller.config.grapple_speed

	controller.player.move_and_slide()

	return true



func try_activate(controller: AbilityController) -> bool:

	if not is_unlocked() or controller.is_grappling or controller.movement_locked():

		return false

	var space := controller.player.get_world_2d().direct_space_state

	var origin := controller.player.global_position

	var probe := origin + Vector2(controller.player.facing * 220.0, -180.0)

	var query := PhysicsRayQueryParameters2D.create(origin, probe)

	query.collide_with_areas = false

	query.collide_with_bodies = true

	var hit := space.intersect_ray(query)

	if hit.is_empty():

		return false

	var collider = hit.get("collider")

	if collider == null or not collider.is_in_group("grapple_point"):

		return false

	controller.is_grappling = true

	controller.grapple_target = hit.get("position", probe)

	AudioManager.play_sfx("dash")

	VFXManager.play("dash_trail", controller.player.global_position, 1.0)

	return true

