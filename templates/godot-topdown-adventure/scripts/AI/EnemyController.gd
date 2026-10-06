extends CharacterBody2D
## Stats and behavior read from the real generated data/enemies/enemies.json at runtime (same
## pattern QuestManager/ItemPickup use for their own data), keyed by enemy_id — previously every
## enemy used identical hardcoded Enemy.tscn defaults regardless of what content.ts actually
## generated for it (health/damage/speed/movement/combat.type were all silently ignored). Also
## fixes a real bug: ContactHitbox was never activated, so melee enemies never actually dealt
## contact damage no matter how long the player stood in them.
##
## Movement: patrol/hop/crawl/stationary plus fly/hover/charge/teleport/burrow.
## Combat: melee, projectile, burst, beam, area, summon, trap.

const ENEMIES_PATH := "res://data/enemies/enemies.json"
const GRAVITY := 980.0
const MAX_SUMMONS := 2
const HURT_FLASH_DURATION := 0.25
const BEAM_LENGTH := 140.0
const BURST_SPREAD := 0.35
const AREA_BURST_COUNT := 6
const TRAP_ACTIVE_DURATION := 0.45
const CHARGE_SPEED_MULT := 2.8
const CHARGE_DURATION := 0.35
const FLY_HEIGHT := 48.0
const HOVER_HEIGHT := 28.0

@export var enemy_id: String = "enemy_default"
@export var patrol_distance: float = 100.0
@export var move_speed: float = 80.0
@export var contact_damage: float = 15.0
## Set before add_child() so a summoned minion does not inherit summon combat and recurse.
@export var is_minion: bool = false

var _movement: String = "patrol"
var _combat_type: String = "melee"
var _combat_cooldown: float = 1.5
var _perception_radius: float = 150.0

var _start_x: float
var _start_y: float
var _direction: int = 1
var _hop_timer: float = 0.0
var _attack_timer: float = 0.0
var _air_time: float = 0.0
var _charge_timer: float = 0.0
var _charging: bool = false
var _teleport_cooldown: float = 0.0
var _burrowed: bool = false
var _burrow_timer: float = 1.0
var _base_collision_layer: int = 4
var _base_collision_mask: int = 1
## How much longer the "hurt" flash animation should keep playing before the normal walk/idle
## logic in _physics_process is allowed to override it again.
var _hurt_timer: float = 0.0
var _summons: Array = []

@onready var health: HealthComponent = $HealthComponent
@onready var hurtbox: HurtboxComponent = $HurtboxComponent
@onready var contact_hitbox: HitboxComponent = $ContactHitbox
@onready var sprite: AnimatedSprite2D = $Sprite

func _ready() -> void:
	_start_x = global_position.x
	_start_y = global_position.y
	_base_collision_layer = collision_layer
	_base_collision_mask = collision_mask
	health.died.connect(_on_died)
	contact_hitbox.owner_node = self
	# Was never connected — HurtboxComponent.receive_hit() only emits hit_received; nothing
	# forwards it to HealthComponent.take_damage() unless the owner explicitly wires it (see
	# PlayerController.gd for the working reference). Without this, the player's AttackHitbox
	# could touch an enemy's Hurtbox all day and it would never actually lose health.
	hurtbox.hit_received.connect(_on_hit_received)

	_apply_enemy_data()
	if is_minion:
		_become_minion()
	contact_hitbox.damage = contact_damage
	# Only melee (and summoned minions forced to melee) deal standing contact damage.
	# Projectile/burst/beam/area attack from range; trap springs on proximity; summoners spawn.
	if _combat_type == "melee":
		contact_hitbox.activate()
	_attack_timer = _combat_cooldown

func _apply_enemy_data() -> void:
	var data := _load_enemy_definition(enemy_id)
	if data.is_empty():
		return

	if data.has("health"):
		health.max_health = float(data["health"])
		health.current_health = health.max_health
	if data.has("damage"):
		contact_damage = float(data["damage"])
	if data.has("speed"):
		move_speed = float(data["speed"])
	if data.has("movement"):
		_movement = String(data["movement"])

	var perception: Dictionary = data.get("perception", {})
	if perception.has("radius"):
		_perception_radius = float(perception["radius"])

	var combat: Dictionary = data.get("combat", {})
	if combat.has("type"):
		_combat_type = String(combat["type"])
	if combat.has("cooldown"):
		_combat_cooldown = float(combat["cooldown"])
	if combat.has("range"):
		_perception_radius = maxf(_perception_radius, float(combat["range"]))

func _become_minion() -> void:
	_combat_type = "melee"
	_movement = "patrol"
	health.max_health = maxf(8.0, health.max_health * 0.4)
	health.current_health = health.max_health
	modulate = Color(0.65, 0.75, 1.0)

func _load_enemy_definition(id: String) -> Dictionary:
	if not FileAccess.file_exists(ENEMIES_PATH):
		return {}
	var file := FileAccess.open(ENEMIES_PATH, FileAccess.READ)
	if file == null:
		return {}
	var text := file.get_as_text()
	file.close()

	var json := JSON.new()
	if json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		return {}

	for enemy in json.data.get("enemies", []):
		if enemy.get("id", "") == id:
			return enemy
	return {}

func _physics_process(delta: float) -> void:
	if not health.is_alive():
		return

	match _movement:
		"stationary":
			velocity.x = 0
		"hop":
			_process_hop(delta)
		"fly":
			_process_fly(delta)
		"hover":
			_process_hover(delta)
		"charge":
			_process_charge(delta)
		"teleport":
			_process_teleport(delta)
		"burrow":
			_process_burrow(delta)
		_:
			# "patrol" and "crawl" share the same ground back-and-forth logic — the generated
			# speed value already differentiates a crawl's pace from a patrol's, no separate
			# code path needed to make them feel distinct.
			velocity.x = _direction * move_speed

	var skip_gravity := _movement == "fly" or _movement == "hover" or _burrowed
	if not skip_gravity:
		velocity.y += GRAVITY * delta
	move_and_slide()

	if _movement != "stationary" and _movement != "teleport" and not _burrowed:
		if global_position.x > _start_x + patrol_distance:
			_direction = -1
		elif global_position.x < _start_x - patrol_distance:
			_direction = 1

	if _hurt_timer > 0.0:
		_hurt_timer -= delta

	if sprite and sprite.sprite_frames:
		if _hurt_timer > 0.0 and sprite.sprite_frames.has_animation("hurt"):
			pass
		elif sprite.animation == "attack" and sprite.is_playing():
			pass
		elif velocity.x != 0:
			sprite.play("walk")
			sprite.scale.x = abs(sprite.scale.x) * sign(velocity.x)
		else:
			sprite.play("idle")

	match _combat_type:
		"projectile":
			_process_aimed_attack(delta, "projectile")
		"burst":
			_process_aimed_attack(delta, "burst")
		"beam":
			_process_aimed_attack(delta, "beam")
		"area":
			_process_aimed_attack(delta, "area")
		"summon":
			_process_aimed_attack(delta, "summon")
		"trap":
			_process_trap_attack(delta)
		_:
			_process_melee_attack(delta)

func _process_hop(delta: float) -> void:
	velocity.x = _direction * move_speed
	_hop_timer -= delta
	if _hop_timer <= 0 and is_on_floor():
		velocity.y = -260.0
		_hop_timer = 1.0

func _process_fly(delta: float) -> void:
	_air_time += delta
	velocity.x = _direction * move_speed
	var target_y := _start_y - FLY_HEIGHT + sin(_air_time * 2.5) * 18.0
	velocity.y = (target_y - global_position.y) * 4.0

func _process_hover(delta: float) -> void:
	_air_time += delta
	velocity.x = _direction * move_speed * 0.45
	var target_y := _start_y - HOVER_HEIGHT + sin(_air_time * 1.8) * 8.0
	velocity.y = (target_y - global_position.y) * 5.0

func _process_charge(delta: float) -> void:
	_charge_timer -= delta
	if _charging:
		velocity.x = float(_direction) * move_speed * CHARGE_SPEED_MULT
		if _charge_timer <= 0.0:
			_charging = false
			_charge_timer = 1.0
		return
	var player := _player_in_range()
	if player != null and _charge_timer <= 0.0:
		var dir := signf(player.global_position.x - global_position.x)
		_begin_charge(1 if dir >= 0.0 else -1)
	else:
		velocity.x = _direction * move_speed

func _begin_charge(dir: int) -> void:
	_direction = dir if dir != 0 else _direction
	_charging = true
	_charge_timer = CHARGE_DURATION
	velocity.x = float(_direction) * move_speed * CHARGE_SPEED_MULT
	_play_attack_animation()

func _process_teleport(delta: float) -> void:
	velocity.x = 0
	if modulate.a < 1.0:
		modulate.a = minf(1.0, modulate.a + delta * 3.0)
	_teleport_cooldown -= delta
	var player := _player_in_range()
	if player == null or _teleport_cooldown > 0.0:
		return
	var offset := 64.0 if player.global_position.x < global_position.x else -64.0
	_perform_teleport(player.global_position.x + offset)

func _perform_teleport(target_x: float) -> void:
	_teleport_cooldown = 1.8
	global_position.x = clampf(target_x, _start_x - patrol_distance, _start_x + patrol_distance)
	modulate.a = 0.35
	_play_attack_animation()

func _process_burrow(delta: float) -> void:
	_burrow_timer -= delta
	if _burrowed:
		velocity = Vector2.ZERO
		if _burrow_timer <= 0.0:
			_emerge()
	else:
		velocity.x = _direction * move_speed * 0.7
		if _burrow_timer <= 0.0:
			_start_burrow()

func _start_burrow() -> void:
	_burrowed = true
	_burrow_timer = 0.7
	modulate.a = 0.15
	hurtbox.monitoring = false
	collision_layer = 0
	collision_mask = 0
	velocity = Vector2.ZERO

func _emerge() -> void:
	_burrowed = false
	_burrow_timer = 1.4
	global_position.x = clampf(
		global_position.x + float(_direction) * 48.0,
		_start_x - patrol_distance,
		_start_x + patrol_distance,
	)
	modulate.a = 1.0
	hurtbox.monitoring = true
	collision_layer = _base_collision_layer
	collision_mask = _base_collision_mask
	_play_attack_animation()

func _player_in_range() -> Node:
	var player := get_tree().get_first_node_in_group("player")
	if player == null:
		return null
	if (player.global_position - global_position).length() > _perception_radius:
		return null
	return player

func _process_aimed_attack(delta: float, kind: String) -> void:
	_attack_timer -= delta
	if _attack_timer > 0:
		return
	var player := _player_in_range()
	if player == null:
		return
	_attack_timer = _combat_cooldown
	var direction: Vector2 = (player.global_position - global_position).normalized()
	match kind:
		"burst":
			_fire_burst(direction)
		"beam":
			_play_attack_animation()
			_fire_beam(direction)
		"area":
			_fire_area_attack()
		"summon":
			_play_attack_animation()
			_summon_minion()
		_:
			_play_attack_animation()
			_fire_projectile(direction)

func _process_melee_attack(delta: float) -> void:
	_attack_timer -= delta
	if _attack_timer > 0:
		return
	if _player_in_range() == null:
		return
	_attack_timer = _combat_cooldown
	_play_attack_animation()

func _process_trap_attack(delta: float) -> void:
	_attack_timer -= delta
	var player := _player_in_range()
	if player == null:
		if contact_hitbox.monitoring:
			contact_hitbox.deactivate()
		return
	if _attack_timer > 0:
		return
	_attack_timer = _combat_cooldown
	_spring_trap()

func _play_attack_animation() -> void:
	if sprite and sprite.sprite_frames and sprite.sprite_frames.has_animation("attack"):
		sprite.play("attack")

func _fire_projectile(direction: Vector2) -> void:
	var projectile := _spawn_projectile_node()
	if projectile == null:
		return
	projectile.global_position = global_position
	projectile.direction = direction
	projectile.damage = contact_damage
	projectile.owner_node = self

func _fire_burst(direction: Vector2) -> void:
	_play_attack_animation()
	_fire_projectile(direction.rotated(-BURST_SPREAD))
	_fire_projectile(direction)
	_fire_projectile(direction.rotated(BURST_SPREAD))

func _fire_beam(direction: Vector2) -> void:
	var beam := _spawn_projectile_node()
	if beam == null:
		return
	beam.global_position = global_position + direction * (BEAM_LENGTH * 0.5)
	beam.direction = direction
	beam.speed = 0.0
	beam.pierce = true
	beam.lifetime = 0.4
	beam.damage = contact_damage
	beam.owner_node = self
	beam.rotation = direction.angle()
	beam.scale = Vector2(BEAM_LENGTH / 10.0, 0.45)

func _fire_area_attack() -> void:
	_play_attack_animation()
	if VFXManager:
		VFXManager.play_ring("area_burst", global_position, AREA_BURST_COUNT, 36.0, 1.0)
	for i in range(AREA_BURST_COUNT):
		var angle := (TAU / float(AREA_BURST_COUNT)) * float(i)
		_fire_projectile(Vector2(cos(angle), sin(angle)))

func _summon_minion() -> void:
	if is_minion:
		return
	_prune_summons()
	if _summons.size() >= MAX_SUMMONS:
		return
	var scene := load("res://scenes/enemies/Enemy.tscn") as PackedScene
	if scene == null:
		return
	var minion := scene.instantiate()
	minion.enemy_id = enemy_id
	minion.is_minion = true
	get_parent().add_child(minion)
	minion.global_position = global_position + Vector2(float(_direction) * 36.0, 0.0)
	_summons.append(minion)

func _spring_trap() -> void:
	_play_attack_animation()
	contact_hitbox.activate()
	if VFXManager:
		VFXManager.play("hit_spark", global_position, 1.1)
	var tree := get_tree()
	if tree:
		await tree.create_timer(TRAP_ACTIVE_DURATION).timeout
	if is_instance_valid(contact_hitbox):
		contact_hitbox.deactivate()

func _spawn_projectile_node() -> Node:
	var scene := load("res://scenes/enemies/Projectile.tscn") as PackedScene
	if scene == null:
		return null
	var projectile := scene.instantiate()
	get_parent().add_child(projectile)
	return projectile

func _prune_summons() -> void:
	var alive: Array = []
	for minion in _summons:
		if is_instance_valid(minion):
			alive.append(minion)
	_summons = alive

func _on_hit_received(damage: float, knockback: Vector2) -> void:
	health.take_damage(damage)
	velocity = knockback
	if sprite and sprite.sprite_frames and sprite.sprite_frames.has_animation("hurt"):
		sprite.play("hurt")
		_hurt_timer = HURT_FLASH_DURATION

func _on_died() -> void:
	EventBus.enemy_killed.emit(enemy_id)
	queue_free()
