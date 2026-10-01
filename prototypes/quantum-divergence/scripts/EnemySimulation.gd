extends RefCounted
## Fixed-tick actors and hostile projectiles. Instrument targets own authoritative HP.
const Grid = preload("res://scripts/MicrocellGrid.gd")
const MAX_ACTORS: int = 32
const DEFINITIONS: Dictionary = {
	"skitter": {"size": Vector2(28, 28), "hp": 20.0, "walk": 80.0, "run": 260.0, "range": 72.0, "aggro": 180.0},
	"wraith": {"size": Vector2(28, 44), "hp": 30.0, "walk": 48.0, "run": 130.0, "range": 220.0, "aggro": 280.0},
	"driller": {"size": Vector2(44, 28), "hp": 40.0, "walk": 65.0, "run": 180.0, "range": 100.0, "aggro": 210.0},
	"golem": {"size": Vector2(60, 92), "hp": 300.0, "walk": 38.0, "run": 110.0, "range": 256.0, "aggro": 300.0}}
const ATTACKS: Dictionary = {
	"dash": {"windup": 12, "active": 18, "recovery": 18, "damage": 5.0},
	"shot": {"windup": 15, "active": 0, "recovery": 21, "damage": 8.0},
	"drill": {"windup": 30, "active": 24, "recovery": 24, "damage": 10.0},
	"slam": {"windup": 36, "active": 18, "recovery": 36, "damage": 15.0},
	"burst": {"windup": 30, "active": 24, "recovery": 30, "damage": 8.0},
	"roar": {"windup": 24, "active": 12, "recovery": 24, "damage": 0.0}}
var grid
var instruments
var player
var tick: int = 0
var actors: Dictionary = {}
var projectiles: Array[Dictionary] = []
var events: Array[Dictionary] = []
var next_projectile: int = 1

func _init(material_grid, instrument_simulation, player_simulation) -> void:
	grid = material_grid
	instruments = instrument_simulation
	player = player_simulation

func body_rect(actor: Dictionary, at: Vector2) -> Rect2:
	var size: Vector2 = DEFINITIONS[actor.kind].size
	return Rect2(at - Vector2(size.x / 2.0, size.y / 2.0 if actor.kind == "wraith" else size.y), size)

func cell_rect(rect: Rect2) -> Rect2i:
	var first := Vector2i(floor(rect.position / Grid.CELL_PX))
	var last := Vector2i(floor((rect.end - Vector2(0.0001, 0.0001)) / Grid.CELL_PX))
	return Rect2i(first, last - first + Vector2i.ONE)

func _blocked(actor: Dictionary, at: Vector2) -> bool:
	var rect: Rect2i = cell_rect(body_rect(actor, at))
	for y in range(rect.position.y, rect.end.y):
		for x in range(rect.position.x, rect.end.x):
			var material: int = grid.material_at(x, y)
			if material in [Grid.CellMaterial.SOLID, Grid.CellMaterial.UNSTABLE_ORE, Grid.CellMaterial.SAND]:
				return true
	return false

func add_enemy(kind: String, id: int, at: Vector2, bind_target: bool = false) -> bool:
	if not DEFINITIONS.has(kind) or actors.has(id) or actors.size() >= MAX_ACTORS or not is_finite(at.x) or not is_finite(at.y):
		return false
	var actor: Dictionary = {"id": id, "kind": kind, "position": at, "home": at, "velocity": Vector2.ZERO,
		"facing": -1, "phase": "idle", "state": "idle", "attack": "", "attack_started": -1,
		"attack_count": 0, "hurt_until": 0, "last_hp": float(DEFINITIONS[kind].hp),
		"aim": Vector2.LEFT, "hit_player": false, "emitted": 0, "effect_done": false,
		"state_started": 0, "state_history": {"idle": true}}
	if _blocked(actor, at) or not grid.is_clear(cell_rect(body_rect(actor, at))):
		return false
	if instruments.targets.has(id):
		if not bind_target or not is_equal_approx(float(instruments.targets[id].hp), float(DEFINITIONS[kind].hp)):
			return false
	elif bind_target:
		return false
	else:
		instruments.add_target(id, body_rect(actor, at), float(DEFINITIONS[kind].hp))
	actors[id] = actor
	instruments.targets[id].rect = body_rect(actor, at)
	return true

func _set_state(actor: Dictionary, value: String) -> void:
	if actor.state != value:
		actor.state_started = tick
	actor.state = value
	actor.state_history[value] = true

func occupy_all() -> void:
	for actor in actors.values():
		if instruments.targets[actor.id].hp > 0:
			grid.occupy_actor(cell_rect(body_rect(actor, actor.position)))

func synchronize_damage() -> void:
	for actor in actors.values():
		var hp: float = instruments.targets[actor.id].hp
		if hp < float(actor.last_hp):
			actor.hurt_until = tick + 18
			events.append({"type": "enemy_hit", "id": actor.id, "damage": float(actor.last_hp) - hp})
			if hp <= 0:
				actor.phase = "death"
				actor.velocity = Vector2.ZERO
				_set_state(actor, "death")
				events.append({"type": "enemy_death", "id": actor.id, "kind": actor.kind})
			else:
				_set_state(actor, "hit")
		actor.last_hp = hp

func _move_axis(actor: Dictionary, axis: int, distance: float) -> void:
	var remaining: float = absf(distance)
	while remaining > 0.00001:
		var amount: float = minf(1.0, remaining)
		var candidate: Vector2 = actor.position
		candidate[axis] += signf(distance) * amount
		if _blocked(actor, candidate):
			actor.velocity[axis] = 0.0
			return
		actor.position = candidate
		remaining -= amount

func _begin_attack(actor: Dictionary) -> void:
	if actor.kind == "golem":
		actor.attack = ["slam", "burst", "roar"][int(actor.attack_count) % 3]
	else:
		actor.attack = {"skitter": "dash", "wraith": "shot", "driller": "drill"}[actor.kind]
	actor.attack_count += 1
	actor.attack_started = tick
	actor.phase = "telegraph"
	actor.hit_player = false
	actor.emitted = 0
	actor.effect_done = false
	actor.aim = (player.body_rect(player.position).get_center() - body_rect(actor, actor.position).get_center()).normalized()
	actor.facing = 1 if actor.aim.x >= 0 else -1
	_set_state(actor, "attack")
	events.append({"type": "telegraph", "id": actor.id, "attack": actor.attack, "tick": tick})

func _spawn_bolt(actor: Dictionary, direction: Vector2) -> bool:
	# Hostile bolts and reserved player split capacity share the same 64-slot budget.
	if instruments.slot_count() >= instruments.MAX_SLOTS:
		events.append({"type": "enemy_capacity_rejected", "id": actor.id})
		return false
	var origin: Vector2 = body_rect(actor, actor.position).get_center() + direction * 18.0
	projectiles.append({"id": next_projectile, "owner": actor.id, "position": origin,
		"direction": direction.normalized(), "damage": float(ATTACKS[actor.attack].damage),
		"speed": 320.0 if actor.kind == "wraith" else 380.0, "expires_at": tick + 90, "travelled": 0.0})
	next_projectile += 1
	instruments.external_slots = projectiles.size()
	events.append({"type": "enemy_projectile", "id": actor.id, "attack": actor.attack, "tick": tick})
	return true

func _drill(actor: Dictionary) -> void:
	var body: Rect2 = body_rect(actor, actor.position)
	var column: int = int(floor((body.end.x + 3.0 if actor.facing > 0 else body.position.x - 3.0) / Grid.CELL_PX))
	var changed: int = 0
	for y in range(int(floor(body.position.y / Grid.CELL_PX)), int(ceil(body.end.y / Grid.CELL_PX))):
		if changed >= 16:
			break
		if grid.in_bounds(column, y) and grid.material_at(column, y) in [Grid.CellMaterial.SOLID, Grid.CellMaterial.UNSTABLE_ORE, Grid.CellMaterial.SAND] and grid.set_material(column, y, Grid.CellMaterial.EMPTY):
			changed += 1
	if changed > 0:
		events.append({"type": "drilled", "id": actor.id, "cells": changed})

func _active(actor: Dictionary, elapsed: int) -> void:
	var attack: Dictionary = ATTACKS[actor.attack]
	if elapsed == 0:
		events.append({"type": "attack_active", "id": actor.id, "attack": actor.attack, "tick": tick})
	if actor.attack == "shot" and int(actor.emitted) == 0:
		_spawn_bolt(actor, actor.aim)
		actor.emitted = 1
	elif actor.attack == "burst":
		var desired: int = mini(3, 1 + int(elapsed / 8))
		while int(actor.emitted) < desired:
			_spawn_bolt(actor, Vector2(actor.aim).rotated((int(actor.emitted) - 1) * 0.20))
			actor.emitted += 1
	elif actor.attack in ["dash", "drill"]:
		if actor.attack == "drill":
			_drill(actor)
		actor.velocity.x = actor.facing * float(DEFINITIONS[actor.kind].run)
		_move_axis(actor, 0, float(actor.velocity.x) / 60.0)
		if not actor.hit_player and body_rect(actor, actor.position).intersects(player.body_rect(player.position)):
			actor.hit_player = player.take_damage(float(attack.damage), actor.kind)
	elif actor.attack in ["slam", "roar"] and not actor.effect_done:
		actor.effect_done = true
		var center: Vector2 = actor.position + Vector2(actor.facing * 60, -12)
		var rect := Rect2(center - Vector2(70, 32), Vector2(140, 32))
		if actor.attack == "slam" and rect.intersects(player.body_rect(player.position)):
			actor.hit_player = player.take_damage(float(attack.damage), "golem_slam")
		var changed: int = grid.collapse_rect(Rect2i(Vector2i(floor(center / Grid.CELL_PX)) - Vector2i(8, 4), Vector2i(16, 8)))
		events.append({"type": "terrain_pulse", "id": actor.id, "attack": actor.attack, "cells": changed, "tick": tick})

func _advance_bolts() -> void:
	var active: Array[Dictionary] = []
	for bolt in projectiles:
		if tick >= int(bolt.expires_at) or float(bolt.travelled) >= instruments.MAX_RANGE:
			continue
		var distance: float = minf(float(bolt.speed) / 60.0, instruments.MAX_RANGE - float(bolt.travelled))
		var start: Vector2 = bolt.position
		var end: Vector2 = start + Vector2(bolt.direction) * distance
		var hit_time: float = instruments._segment_hit(start, end, player.body_rect(player.position)) if player.hp > 0 else -1.0
		var consumed: bool = false
		for entry in instruments._sweep_cells(start, end):
			if hit_time >= 0.0 and hit_time <= float(entry.t):
				if player.take_damage(float(bolt.damage), "enemy_projectile"):
					events.append({"type": "player_hit", "owner": bolt.owner, "damage": bolt.damage})
				consumed = true
				break
			var cell: Vector2i = entry.cell
			if not grid.in_bounds(cell.x, cell.y) or grid.material_at(cell.x, cell.y) != Grid.CellMaterial.EMPTY:
				consumed = true
				break
		if consumed:
			continue
		if hit_time >= 0.0:
			if player.take_damage(float(bolt.damage), "enemy_projectile"):
				events.append({"type": "player_hit", "owner": bolt.owner, "damage": bolt.damage})
			continue
		bolt.position = end
		bolt.travelled += distance
		active.append(bolt)
	projectiles = active
	instruments.external_slots = projectiles.size()

func step() -> void:
	tick += 1
	events.clear()
	synchronize_damage()
	_advance_bolts()
	var ids: Array = actors.keys()
	ids.sort()
	for id in ids:
		var actor: Dictionary = actors[id]
		if actor.phase == "death":
			continue
		actor.velocity.x = 0.0
		var distance: float = body_rect(actor, actor.position).get_center().distance_to(player.body_rect(player.position).get_center())
		if actor.phase == "idle":
			if player.hp > 0 and distance <= float(DEFINITIONS[actor.kind].range):
				_begin_attack(actor)
			else:
				var direction: float = signf(player.position.x - float(actor.position.x)) if player.hp > 0 and distance <= float(DEFINITIONS[actor.kind].aggro) else float(actor.facing)
				if distance > float(DEFINITIONS[actor.kind].aggro) and absf(float(actor.position.x) - float(actor.home.x)) > 32:
					direction = signf(float(actor.home.x) - float(actor.position.x))
				actor.facing = 1 if direction >= 0 else -1
				var fast_chase: bool = actor.kind in ["wraith", "golem"] and player.hp > 0 and distance > float(DEFINITIONS[actor.kind].range) and distance <= float(DEFINITIONS[actor.kind].aggro)
				actor.velocity.x = direction * float(DEFINITIONS[actor.kind].run if fast_chase else DEFINITIONS[actor.kind].walk)
				_move_axis(actor, 0, float(actor.velocity.x) / 60.0)
				_set_state(actor, "run" if fast_chase and absf(float(actor.velocity.x)) > 0.1 else "walk" if absf(float(actor.velocity.x)) > 0.1 else "idle")
		else:
			var attack: Dictionary = ATTACKS[actor.attack]
			var elapsed: int = tick - int(actor.attack_started)
			if elapsed < int(attack.windup):
				actor.phase = "telegraph"
				_set_state(actor, "attack")
			elif elapsed < int(attack.windup) + int(attack.active) or (int(attack.active) == 0 and elapsed == int(attack.windup)):
				actor.phase = "active"
				_active(actor, elapsed - int(attack.windup))
				_set_state(actor, "run" if actor.kind in ["skitter", "driller"] else "attack")
			elif elapsed < int(attack.windup) + int(attack.active) + int(attack.recovery):
				actor.phase = "recovery"
				_set_state(actor, "idle")
			else:
				actor.phase = "idle"
				_set_state(actor, "idle")
		if tick < int(actor.hurt_until):
			_set_state(actor, "hit")
		if actor.kind != "wraith":
			actor.velocity.y = minf(480.0, float(actor.velocity.y) + 840.0 / 60.0)
			_move_axis(actor, 1, float(actor.velocity.y) / 60.0)
		instruments.targets[id].rect = body_rect(actor, actor.position)
	occupy_all()
	assert(instruments.slot_count() <= instruments.MAX_SLOTS)
