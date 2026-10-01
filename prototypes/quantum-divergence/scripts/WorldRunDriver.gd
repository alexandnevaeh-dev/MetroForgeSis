extends RefCounted
## Test-owned player inputs only: no position, health, damage, terrain or objective writes.
const Navigator = preload("res://scripts/MineNavigator.gd")
const World = preload("res://scripts/MineWorld.gd")
const Enemy = preload("res://scripts/EnemySimulation.gd")
var navigator = Navigator.new()
var points: Array[Vector2] = []
var stations: Array = []
var branch_turnarounds: Dictionary = {}
var branch_returns: Dictionary = {}
var visited_regions: Dictionary = {}
var dodged: Dictionary = {}
var jump_tick: int = -1000
var fire: bool = false
var interact: bool = false
var aim := Vector2.RIGHT
var activity: String = "travel"
var last_waypoint: int = 1
var stalled_ticks: int = 0
var failure: String = ""

func _init(manifest: Dictionary) -> void:
	stations = manifest.stations.duplicate()
	# Walk each optional branch out and back before continuing the main route.
	for point in manifest.route:
		points.append(point)
		for id in ["echo","survey"]:
			var branch: Array = manifest.branch_routes[id]
			if point != branch[0]:
				continue
			points.append_array(branch.slice(1))
			branch_turnarounds[id] = points.size() - 1
			var returning: Array = branch.duplicate()
			returning.reverse()
			points.append_array(returning.slice(1))
			branch_returns[id] = points.size() - 1

func controls(player, instruments, enemies, progress, active_counts: Dictionary) -> Dictionary:
	fire = false
	interact = false
	visited_regions[World.region_at(player.position)] = true
	if progress.extracted or player.hp <= 0:
		activity = "complete" if progress.extracted else "death"
		return {}
	var threat: Dictionary = {}
	var nearest: float = INF
	for actor in enemies.actors.values():
		if instruments.targets[actor.id].hp <= 0:
			continue
		var distance: float = player.body_rect(player.position).get_center().distance_to(enemies.body_rect(actor,actor.position).get_center())
		if distance < 300.0 and distance < nearest:
			nearest = distance
			threat = actor
	var input: Dictionary = {}
	if not threat.is_empty():
		activity = "encounter_" + str(threat.id)
		var has_attacked: bool = int(active_counts.get(str(threat.id),0)) > 0
		var desired: float = 210.0 if threat.kind == "golem" else 115.0
		if not has_attacked:
			desired = 40.0 if threat.kind == "wraith" else float(Enemy.DEFINITIONS[threat.kind].range) * 0.65
		var side: float = signf(player.position.x - float(threat.position.x))
		if side == 0:
			side = -1.0
		var dx: float = float(threat.position.x) + side * desired - player.position.x
		input = {"move":signf(dx) if absf(dx) > 4.0 else 0.0,"run":true}
		if not has_attacked and threat.phase != "idle":
			input.move = 0.0
		fire = has_attacked
		aim = enemies.body_rect(threat,threat.position).get_center() - (player.position + Vector2(player.facing * 14,-25))
	else:
		activity = "travel"
		for station in stations:
			# E at the lift is extraction as well as station registration: finish the physical
			# arrival before requesting it, so the final waypoint remains part of the proof.
			if station == progress.layout.exit and navigator.next_point < points.size():
				continue
			if player.position.distance_to(station) < 10.0:
				interact = true
		for id in ["anchor","secret","core","exit"]:
			if id == "exit" and navigator.next_point < points.size():
				continue
			if player.position.distance_to(progress.layout[id]) < 10.0:
				interact = true
		# Stay on the actual rift floor until all crystals have taken projectile damage.
		var rift: Vector2 = Vector2(2400,2272)
		if not progress.collapse_rift and player.position.distance_to(rift) < 10.0:
			activity = "rift_crystals"
			for id in [101,102,103]:
				if instruments.targets[id].hp > 0:
					fire = true
					aim = instruments.targets[id].rect.get_center() - (player.position + Vector2(player.facing * 14,-25))
					break
		else:
			input = navigator.controls(player,points)
			if navigator.next_point >= points.size():
				interact = true
			if player.position.distance_to(Vector2(4200,992)) < 10.0:
				interact = true
	for actor in enemies.actors.values():
		if instruments.targets[actor.id].hp <= 0 or actor.phase != "telegraph" or actor.attack not in ["slam","burst","shot"]:
			continue
		if player.position.distance_to(actor.position) > 300.0:
			continue
		if dodged.get(actor.id,-1) != actor.attack_started and player.grounded:
			input.jump = true
			jump_tick = player.tick
			dodged[actor.id] = actor.attack_started
	input.levitate = bool(input.get("levitate",false)) or player.tick - jump_tick < 16
	stalled_ticks = stalled_ticks + 1 if last_waypoint == navigator.next_point and activity == "travel" else 0
	last_waypoint = navigator.next_point
	if stalled_ticks > 600:
		failure = "Traversal stalled at waypoint " + str(navigator.next_point)
	return input

func status() -> Dictionary:
	var visits: Dictionary = {}
	for id in branch_turnarounds:
		visits[id] = {"outbound":navigator.reached.has(branch_turnarounds[id]),"returned":navigator.reached.has(branch_returns[id])}
	return {"activity":activity,"failure":failure,"waypoints":points.size(),"reached":navigator.reached.size(),"next":navigator.next_point,"branches":visits,"regions":visited_regions.keys()}
