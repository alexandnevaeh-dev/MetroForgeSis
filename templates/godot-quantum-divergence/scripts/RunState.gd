extends RefCounted
## Versioned state only. Decode into detached objects; commit by swapping the complete bundle.
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Player = preload("res://scripts/PlayerSimulation.gd")
const Instruments = preload("res://scripts/InstrumentSimulation.gd")
const Enemies = preload("res://scripts/EnemySimulation.gd")
const Progression = preload("res://scripts/MinesProgression.gd")
const PLAYER_FIELDS: Array[String] = ["position", "velocity", "facing", "grounded", "hp", "tick", "levitation_ticks", "dash_until", "next_dash", "recall_hold", "recall_latched", "immunity_until", "next_heat_damage", "stations", "recalled_this_tick", "state", "hurt_until", "attack_until", "damage_events"]
const INSTRUMENT_FIELDS: Array[String] = ["tick", "energy", "last_fire", "cooldown_until", "pending", "projectiles", "targets", "events", "next_id", "external_slots"]
const ENEMY_FIELDS: Array[String] = ["tick", "actors", "projectiles", "events", "next_projectile"]
const PROGRESS_FIELDS: Array[String] = ["layout", "configured", "anchor_upper", "collapse_rift", "golem_core", "golem_defeated", "secret_found", "extracted", "crystals_destroyed", "stabilization_pending", "events"]
const ACTOR_FIELDS: Array[String] = ["id", "kind", "position", "home", "velocity", "facing", "phase", "state", "attack", "attack_started", "attack_count", "hurt_until", "last_hp", "aim", "hit_player", "emitted", "effect_done", "state_started", "state_history"]
const STATES: Array[String] = ["idle", "walk", "run", "attack", "hit", "death"]

static func _fields(object, names: Array[String]) -> Dictionary:
	var result: Dictionary = {}
	for key in names:
		var value = object.get(key)
		result[key] = value.duplicate(true) if typeof(value) in [TYPE_ARRAY, TYPE_DICTIONARY] else value
	return result

static func snapshot(bundle: Dictionary, selected: String = "photon") -> Dictionary:
	# The v1 compact encounter cannot silently discard programmable world state.
	if bundle.instruments.programs != Instruments.Program.DEFAULTS or not bundle.instruments.links.is_empty() or not bundle.instruments.link_marks.is_empty():
		return {"unsupported":"programmable_world_state_requires_v2"}
	return {"schema_version": 1, "world_id": "probability-encounter-v1", "selected": selected,
		"tick": bundle.grid.tick, "grid": bundle.grid.snapshot(), "player": _fields(bundle.player, PLAYER_FIELDS),
		"instruments": _fields(bundle.instruments, INSTRUMENT_FIELDS), "enemies": _fields(bundle.enemies, ENEMY_FIELDS),
		"progress": _fields(bundle.progress, PROGRESS_FIELDS)}

static func _keys(value, names: Array) -> bool:
	if typeof(value) != TYPE_DICTIONARY or value.size() != names.size():
		return false
	for name in names:
		if not value.has(name):
			return false
	return true

static func _plain(value, depth: int = 0) -> bool:
	if depth > 16:
		return false
	match typeof(value):
		TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_VECTOR2I, TYPE_RECT2I:
			return true
		TYPE_FLOAT:
			return is_finite(value)
		TYPE_STRING:
			return value.length() <= 256
		TYPE_VECTOR2:
			return is_finite(value.x) and is_finite(value.y)
		TYPE_RECT2:
			return _plain(value.position) and _plain(value.size)
		TYPE_PACKED_BYTE_ARRAY, TYPE_PACKED_FLOAT64_ARRAY, TYPE_PACKED_INT64_ARRAY:
			return value.size() <= Grid.MAX_CELLS
		TYPE_ARRAY:
			if value.size() > 4096:
				return false
			for entry in value:
				if not _plain(entry, depth + 1):
					return false
			return true
		TYPE_DICTIONARY:
			if value.size() > 256:
				return false
			for key in value:
				if typeof(key) not in [TYPE_INT, TYPE_STRING] or not _plain(key, depth + 1) or not _plain(value[key], depth + 1):
					return false
			return true
	return false

static func _field_types(value, object, names: Array[String]) -> bool:
	if not _keys(value, names):
		return false
	for name in names:
		if typeof(value[name]) != typeof(object.get(name)):
			return false
	return true

static func _assign(object, values: Dictionary) -> void:
	for name in values:
		var current = object.get(name)
		if typeof(current) == TYPE_ARRAY and current.is_typed():
			current.assign(values[name])
		else:
			var value = values[name]
			object.set(name, value.duplicate(true) if typeof(value) in [TYPE_ARRAY, TYPE_DICTIONARY] else value)

static func _integer(value, low: int = 0, high: int = 0x7fffffff) -> bool:
	return typeof(value) == TYPE_INT and value >= low and value <= high

static func _point(point, grid) -> bool:
	return typeof(point) == TYPE_VECTOR2 and is_finite(point.x) and is_finite(point.y) and point.x >= 0 and point.y >= 0 and point.x < grid.width * Grid.CELL_PX and point.y < grid.height * Grid.CELL_PX

static func _rect(rect, grid) -> bool:
	return typeof(rect) == TYPE_RECT2 and _point(rect.position, grid) and rect.size.x > 0 and rect.size.y > 0 and rect.end.x <= grid.width * Grid.CELL_PX and rect.end.y <= grid.height * Grid.CELL_PX

static func _rect_cells(rect, grid) -> bool:
	return typeof(rect) == TYPE_RECT2I and rect.size.x > 0 and rect.size.y > 0 and rect.position.x >= 1 and rect.position.y >= 1 and rect.end.x <= grid.width - 1 and rect.end.y <= grid.height - 1

static func _direction(value) -> bool:
	return typeof(value) == TYPE_VECTOR2 and is_finite(value.x) and is_finite(value.y) and absf(value.length() - 1.0) < 0.0001

static func _layout(value, grid, targets: Dictionary) -> bool:
	if not _keys(value, ["anchor", "core", "exit", "secret", "upper_region", "ghost_platforms", "crystals", "golem"]):
		return false
	for key in ["anchor", "core", "exit", "secret"]:
		if not _point(value[key], grid):
			return false
	if not _rect_cells(value.upper_region, grid) or typeof(value.ghost_platforms) != TYPE_ARRAY or value.ghost_platforms.is_empty() or value.ghost_platforms.size() > 16:
		return false
	var occupied: Dictionary = {}
	for rect in value.ghost_platforms:
		if not _rect_cells(rect, grid):
			return false
		for y in range(rect.position.y, rect.end.y):
			for x in range(rect.position.x, rect.end.x):
				var index: int = y * grid.width + x
				if occupied.has(index) or grid.reserved[index] != 0:
					return false
				occupied[index] = true
	if occupied.size() > Grid.COLLAPSE_BUDGET or typeof(value.crystals) != TYPE_ARRAY or value.crystals.size() != 3:
		return false
	var ids: Dictionary = {}
	for id in value.crystals + [value.golem]:
		if typeof(id) != TYPE_INT or ids.has(id) or not targets.has(id):
			return false
		ids[id] = true
	return true

static func build(state, profile: Dictionary) -> Dictionary:
	if not _plain(state) or not _keys(state, ["schema_version", "world_id", "selected", "tick", "grid", "player", "instruments", "enemies", "progress"]) or state.schema_version != 1 or state.world_id != "probability-encounter-v1" or state.selected not in ["photon", "tachyon"] or not _integer(state.tick):
		return {"accepted": false, "reason": "schema"}
	var raw_grid = state.grid
	if typeof(raw_grid) != TYPE_DICTIONARY or not _integer(raw_grid.get("width"), 3, Grid.MAX_CELLS) or not _integer(raw_grid.get("height"), 3, Grid.MAX_CELLS) or raw_grid.width * raw_grid.height > Grid.MAX_CELLS:
		return {"accepted": false, "reason": "grid_size"}
	if raw_grid.width != 192 or raw_grid.height != 96:
		return {"accepted": false, "reason": "world_dimensions"}
	var grid = Grid.new(raw_grid.width, raw_grid.height, 0)
	if not _keys(raw_grid, grid.snapshot().keys()) or not grid.restore(raw_grid) or grid.tick != state.tick:
		return {"accepted": false, "reason": "grid"}
	var player = Player.new(grid, Vector2(20, 44))
	var shots = Instruments.new(grid)
	var enemies = Enemies.new(grid, shots, player)
	var progress = Progression.new(grid, shots, player, profile)
	if not _field_types(state.player, player, PLAYER_FIELDS) or not _field_types(state.instruments, shots, INSTRUMENT_FIELDS) or not _field_types(state.enemies, enemies, ENEMY_FIELDS) or not _field_types(state.progress, progress, PROGRESS_FIELDS):
		return {"accepted": false, "reason": "component_fields"}
	var p: Dictionary = state.player
	if p.tick != state.tick or p.hp <= 0.0 or p.hp > 100.0 or not _point(p.position, grid) or p.facing not in [-1, 1] or p.state == "death" or p.state not in STATES + ["jump", "levitate", "dash"] or not _integer(p.levitation_ticks, 0, 90) or p.stations.is_empty() or p.stations.size() > 32:
		return {"accepted": false, "reason": "player"}
	for field in ["dash_until", "next_dash", "recall_hold", "immunity_until", "next_heat_damage", "hurt_until", "attack_until"]:
		if not _integer(p[field]):
			return {"accepted": false, "reason": "player_timer"}
	var timer_bounds: Dictionary = {"dash_until":9, "next_dash":36, "immunity_until":30, "next_heat_damage":30, "hurt_until":18, "attack_until":15}
	for field in timer_bounds:
		if p[field] > state.tick + int(timer_bounds[field]):
			return {"accepted": false, "reason": "player_timer_bound"}
	if p.recall_hold > 60 or absf(p.velocity.x) > 380.0 or p.velocity.y < -330.0 or p.velocity.y > 480.0:
		return {"accepted": false, "reason": "player_motion"}
	for station in p.stations:
		if not _point(station, grid):
			return {"accepted": false, "reason": "station"}
	for event in p.damage_events:
		if not _keys(event, ["tick", "damage", "source"]) or not _integer(event.tick, 0, state.tick) or typeof(event.damage) != TYPE_FLOAT or event.damage <= 0.0 or typeof(event.source) != TYPE_STRING:
			return {"accepted": false, "reason": "damage_event"}
	_assign(player, p)
	if player._blocked(player.position):
		return {"accepted": false, "reason": "player_collision"}
	var s: Dictionary = state.instruments
	if s.tick != state.tick or s.energy < 0.0 or s.energy > 100.0 or not _integer(s.last_fire, -60, state.tick) or not _integer(s.next_id, 1) or not _keys(s.cooldown_until, ["photon", "tachyon"]) or s.targets.size() > 256 or s.pending.size() > 64 or s.projectiles.size() > 64:
		return {"accepted": false, "reason": "instruments"}
	for timer in s.cooldown_until.values():
		if not _integer(timer):
			return {"accepted": false, "reason": "cooldown"}
	for id in s.targets:
		var target = s.targets[id]
		if typeof(id) != TYPE_INT or not _keys(target, ["rect", "hp"]) or not _rect(target.rect, grid) or typeof(target.hp) != TYPE_FLOAT or target.hp < 0.0 or target.hp > 300.0:
			return {"accepted": false, "reason": "target"}
	var shot_ids: Dictionary = {}
	for request in s.pending:
		if not _keys(request, ["id", "instrument", "origin", "direction", "spawn_at", "slots"]) or not Instruments.DEFINITIONS.has(request.instrument) or not _point(request.origin, grid) or not _direction(request.direction) or not _integer(request.id, 1, s.next_id - 1) or shot_ids.has(request.id) or not _integer(request.spawn_at, state.tick + 1) or request.slots != Instruments.DEFINITIONS[request.instrument].slots:
			return {"accepted": false, "reason": "pending_shot"}
		shot_ids[request.id] = true
		if request.spawn_at > state.tick + int(Instruments.DEFINITIONS[request.instrument].windup):
			return {"accepted": false, "reason": "pending_lifetime"}
	for projectile in s.projectiles:
		if not _keys(projectile, ["id", "instrument", "position", "direction", "damage", "speed", "expires_at", "travelled", "split_child", "slots"]) or not Instruments.DEFINITIONS.has(projectile.instrument) or not _point(projectile.position, grid) or not _direction(projectile.direction) or not _integer(projectile.id, 1, s.next_id - 1) or shot_ids.has(projectile.id) or not _integer(projectile.expires_at, state.tick + 1) or typeof(projectile.split_child) != TYPE_BOOL or typeof(projectile.damage) != TYPE_FLOAT or typeof(projectile.speed) != TYPE_FLOAT or typeof(projectile.travelled) != TYPE_FLOAT or projectile.travelled < 0.0 or projectile.travelled > Instruments.MAX_RANGE:
			return {"accepted": false, "reason": "projectile"}
		var definition: Dictionary = Instruments.DEFINITIONS[projectile.instrument]
		if projectile.expires_at > state.tick + int(definition.life):
			return {"accepted": false, "reason": "projectile_lifetime"}
		if projectile.damage != definition.damage or projectile.speed != definition.speed or projectile.slots != (1 if projectile.split_child else int(definition.slots)) or (projectile.split_child and projectile.instrument != "tachyon"):
			return {"accepted": false, "reason": "projectile_accounting"}
		shot_ids[projectile.id] = true
	_assign(shots, s)
	var e: Dictionary = state.enemies
	if e.tick != state.tick or e.actors.size() > Enemies.MAX_ACTORS or e.projectiles.size() > 64 or not _integer(e.next_projectile, 1) or shots.external_slots != e.projectiles.size():
		return {"accepted": false, "reason": "enemies"}
	for id in e.actors:
		var actor = e.actors[id]
		if typeof(id) != TYPE_INT or not _keys(actor, ACTOR_FIELDS) or actor.id != id or not Enemies.DEFINITIONS.has(actor.kind) or not shots.targets.has(id) or not _point(actor.position, grid) or not _point(actor.home, grid) or typeof(actor.velocity) != TYPE_VECTOR2 or actor.facing not in [-1, 1] or actor.phase not in ["idle", "telegraph", "active", "recovery", "death"] or actor.state not in STATES or actor.attack not in ["", "dash", "shot", "drill", "slam", "burst", "roar"]:
			return {"accepted": false, "reason": "actor"}
		for field in ["attack_count", "hurt_until", "emitted", "state_started"]:
			if not _integer(actor[field]):
				return {"accepted": false, "reason": "actor_timer"}
		if not _integer(actor.attack_started, -1, state.tick) or not _direction(actor.aim) or typeof(actor.hit_player) != TYPE_BOOL or typeof(actor.effect_done) != TYPE_BOOL or typeof(actor.last_hp) != TYPE_FLOAT or actor.last_hp != shots.targets[id].hp or typeof(actor.state_history) != TYPE_DICTIONARY or actor.state_history.size() > STATES.size():
			return {"accepted": false, "reason": "actor_accounting"}
		for history_state in actor.state_history:
			if history_state not in STATES or actor.state_history[history_state] != true:
				return {"accepted": false, "reason": "actor_history"}
		if shots.targets[id].hp > Enemies.DEFINITIONS[actor.kind].hp or (shots.targets[id].hp == 0.0 and (actor.phase != "death" or actor.state != "death")) or (shots.targets[id].hp > 0.0 and actor.phase == "death") or enemies.body_rect(actor, actor.position) != shots.targets[id].rect:
			return {"accepted": false, "reason": "actor_health"}
		if actor.phase in ["telegraph", "active", "recovery"] and (actor.attack == "" or actor.attack_started < 0):
			return {"accepted": false, "reason": "actor_attack"}
		var family_attacks: Array = {"skitter": ["", "dash"], "wraith": ["", "shot"], "driller": ["", "drill"], "golem": ["", "slam", "burst", "roar"]}[actor.kind]
		if actor.attack not in family_attacks or actor.emitted > 3 or actor.state_started > state.tick or actor.hurt_until > state.tick + 18 or absf(actor.velocity.x) > float(Enemies.DEFINITIONS[actor.kind].run) or actor.velocity.y < 0.0 or actor.velocity.y > 480.0:
			return {"accepted": false, "reason": "actor_family"}
	var bolt_ids: Dictionary = {}
	for bolt in e.projectiles:
		if not _keys(bolt, ["id", "owner", "position", "direction", "damage", "speed", "expires_at", "travelled"]) or not _integer(bolt.id, 1, e.next_projectile - 1) or bolt_ids.has(bolt.id) or not e.actors.has(bolt.owner) or not _point(bolt.position, grid) or not _direction(bolt.direction) or typeof(bolt.damage) != TYPE_FLOAT or bolt.damage != 8.0 or typeof(bolt.speed) != TYPE_FLOAT or bolt.speed not in [320.0, 380.0] or typeof(bolt.travelled) != TYPE_FLOAT or bolt.travelled < 0.0 or bolt.travelled > Instruments.MAX_RANGE or not _integer(bolt.expires_at, state.tick + 1):
			return {"accepted": false, "reason": "enemy_projectile"}
		bolt_ids[bolt.id] = true
		if bolt.expires_at > state.tick + 90:
			return {"accepted": false, "reason": "enemy_projectile_lifetime"}
	_assign(enemies, e)
	if shots.slot_count() > Instruments.MAX_SLOTS:
		return {"accepted": false, "reason": "capacity"}
	var r: Dictionary = state.progress
	if not r.configured or r.extracted or not _layout(r.layout, grid, shots.targets):
		return {"accepted": false, "reason": "progression"}
	if not enemies.actors.has(r.layout.golem) or enemies.actors[r.layout.golem].kind != "golem":
		return {"accepted": false, "reason": "golem_identity"}
	_assign(progress, r)
	var crystal_count: int = 0
	for id in progress.layout.crystals:
		crystal_count += int(shots.targets[id].hp == 0.0)
		if shots.targets[id].hp > 24.0:
			return {"accepted": false, "reason": "crystal_health"}
	if crystal_count != progress.crystals_destroyed or progress.golem_defeated != (shots.targets[progress.layout.golem].hp == 0.0) or (progress.golem_core and not progress.golem_defeated) or (progress.collapse_rift and crystal_count != 3):
		return {"accepted": false, "reason": "objective_gate"}
	var upper = grid.flicker_regions.get("upper_mines")
	if typeof(upper) != TYPE_DICTIONARY or upper.rect != progress.layout.upper_region or upper.probability != (0.10 if progress.anchor_upper else 0.20):
		return {"accepted": false, "reason": "anchor_region"}
	for key in ["anchor", "core", "exit"]:
		var rect: Rect2i = progress._point_cells(progress.layout[key])
		if not _rect_cells(rect, grid):
			return {"accepted": false, "reason": "objective_clearance"}
		for y in range(rect.position.y, rect.end.y):
			for x in range(rect.position.x, rect.end.x):
				if grid.reserved[y * grid.width + x] != 1:
					return {"accepted": false, "reason": "objective_protection"}
	for rect in progress.layout.ghost_platforms:
		for y in range(rect.position.y, rect.end.y):
			for x in range(rect.position.x, rect.end.x):
				var index: int = y * grid.width + x
				if progress.collapse_rift and (grid.cells[index] != Grid.CellMaterial.SOLID or grid.immutable[index] != 1 or grid.ore_origin[index] != 0 or grid.collapse_until[index] != 0):
					return {"accepted": false, "reason": "ghost_platform"}
				if not progress.collapse_rift and grid.immutable[index] != 0:
					return {"accepted": false, "reason": "partial_ghost_platform"}
	return {"accepted": true, "bundle": {"grid": grid, "player": player, "instruments": shots, "enemies": enemies, "progress": progress}, "selected": state.selected, "tick": state.tick}
