extends RefCounted
## Station admission reads the real world, actor and projectile state; previews never mutate it.
const Program = preload("res://scripts/InstrumentProgram.gd")
const SAFE_RADIUS: float = 320.0 # Covers the existing enemy aggro and firing ranges.
var world

func _init(owner_world) -> void:
	world = owner_world

func admission() -> Dictionary:
	if world.player.hp <= 0 or world.progress.extracted: return {"accepted":false,"reason":"This run has ended."}
	if not world.player.grounded or world.player.velocity.length_squared() > 1.0:
		return {"accepted":false,"reason":"Stand still on a stabilizer station."}
	var near: bool = false
	for station in world.manifest.stations:
		if world.player.stations.has(station) and world.player.position.distance_to(station) <= 32.0: near = true
	if not near: return {"accepted":false,"reason":"Register a stabilizer with E, then press P nearby."}
	if world.player.tick < world.player.hurt_until or not world.instruments.pending.is_empty():
		return {"accepted":false,"reason":"Wait for your attack or hit reaction to finish."}
	for actor in world.enemies.actors.values():
		if world.instruments.targets[actor.id].hp > 0 and actor.position.distance_to(world.player.position) <= SAFE_RADIUS:
			return {"accepted":false,"reason":"An enemy is too close to this station."}
	for projectile in world.enemies.projectiles + world.instruments.projectiles:
		if projectile.position.distance_to(world.player.position) <= SAFE_RADIUS:
			return {"accepted":false,"reason":"A projectile is too close to this station."}
	return {"accepted":true}

func preview(recipe) -> Dictionary:
	return Program.compile(recipe,world.profile.get("blueprints",[]))

func apply(instrument: String, recipe) -> Dictionary:
	var safe: Dictionary = admission()
	if not safe.accepted: return safe
	return world.instruments.set_program(instrument,recipe,world.profile.get("blueprints",[]))
