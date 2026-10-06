extends CharacterBody2D
## Top-down wander / chase / melee-or-ranged. Used for field enemies and the TINY_TEST dungeon boss.

const ENEMIES_PATH := "res://data/enemies/enemies.json"
## Default engagement range for a "projectile" enemy when enemies.json doesn't specify
## combat.range — well outside melee's 22px so it actually keeps distance and fires instead of
## walking into contact range first.
const DEFAULT_RANGED_RANGE := 140.0

@export var is_boss: bool = false
@export var enemy_id: String = "enemy_000"
@export var boss_id: String = "boss_final"
@export var move_speed: float = 55.0
@export var detect_radius: float = 120.0
@export var attack_range: float = 22.0
@export var attack_damage: float = 12.0

## Real generated data/enemies/enemies.json only ever reached the side-view EnemyController.gd —
## OverworldManager._spawn_pois() instantiated Enemy.tscn without ever setting enemy_id from the
## real poi.metadata.enemyId, and this controller never read enemies.json at all, so every
## top-down field enemy used Enemy.tscn's hardcoded stats and was hardcoded melee regardless of
## its real generated combat.type — "projectile" enemies (enemy_001 in every profile, per
## content.ts's enemyCombatTypeForIndex()) never actually appeared as ranged in top-down. A
## per-dungeon enemy id ("enemy_dungeon_000_0") that isn't in the real catalog at all falls back
## to melee with Enemy.tscn's defaults, the same graceful-fallback behavior BossController.gd and
## the side-view EnemyController.gd already use for an unrecognized id.
var _combat_type: String = "melee"
var _combat_cooldown: float = -1.0

enum CombatState { IDLE, CHASE, WINDUP, ACTIVE, RECOVERY, HURT, DEAD }
const ATTACK_WINDUP := 0.28
const ATTACK_ACTIVE := 0.12
const ATTACK_RECOVERY := 0.42
const HURT_DURATION := 0.16

@onready var health: HealthComponent = $HealthComponent
@onready var hurtbox: HurtboxComponent = $HurtboxComponent
@onready var attack_hitbox: HitboxComponent = $AttackHitbox
@onready var sprite: AnimatedSprite2D = $Sprite

var _wander_dir := Vector2.RIGHT
var _wander_time := 0.0
var _attack_cd := 0.0
var _state: CombatState = CombatState.IDLE
var _state_time := 0.0
var _attack_direction := Vector2.RIGHT
var _knockback := Vector2.ZERO

func _ready() -> void:
	motion_mode = MOTION_MODE_FLOATING
	health.died.connect(_on_died)
	hurtbox.hit_received.connect(_on_hit)
	if not is_boss:
		_apply_enemy_data()
	attack_hitbox.owner_node = self
	attack_hitbox.damage = attack_damage
	attack_hitbox.monitoring = false

## Loads this enemy's real stats/combat type from data/enemies/enemies.json by enemy_id (set by
## OverworldManager._spawn_pois() from the real poi.metadata.enemyId). is_boss instances skip this
## — BossController.gd is the boss-specific script; only plain field enemies use this controller
## with is_boss true for the TINY_TEST dungeon boss placeholder, which has no matching enemies.json
## entry by design and should keep Enemy.tscn's boss-sized defaults untouched.
func _apply_enemy_data() -> void:
	var data := _load_enemy_definition(enemy_id)
	if data.is_empty():
		return
	if data.has("health"):
		health.max_health = float(data["health"])
		health.current_health = health.max_health
	if data.has("damage"):
		attack_damage = float(data["damage"])
	if data.has("speed"):
		move_speed = float(data["speed"])
	var perception: Dictionary = data.get("perception", {})
	if perception.has("radius"):
		detect_radius = float(perception["radius"])
	var combat: Dictionary = data.get("combat", {})
	if combat.has("type"):
		_combat_type = String(combat["type"])
	if combat.has("cooldown"):
		_combat_cooldown = float(combat["cooldown"])
	if _combat_type == "projectile":
		attack_range = float(combat.get("range", DEFAULT_RANGED_RANGE))
	_apply_visual_family_if_present()

## Enemy.tscn is one shared scene reused for every field enemy — every instance renders the
## identical `enemy_000_*` sheet baked into the scene regardless of its real `enemy_id`/combat
## type (a real, disclosed gap: melee/ranged/"heavy" enemies only ever differed in stats, never
## in art). An external visual pack (e.g. metroforge-research-facility) that ships distinct
## melee_*/ranged_*/heavy_* sheets at these exact paths lets this controller re-skin itself once,
## right after real combat-type data loads above — silently a no-op (Enemy.tscn's own baked
## default keeps rendering) when a project has no such pack, so this never changes behavior for
## any existing generated project. "heavy" is not a real ENEMY_COMBAT_TYPES value (content.ts only
## emits melee/projectile/burst/beam/area/summon/trap) — every non-melee, non-projectile combat
## type is treated as the third, tankier silhouette here, a deliberate scoped choice disclosed in
## this pack's manifest/audit entry rather than a real fourth gameplay combat type.
func _apply_visual_family_if_present() -> void:
	var family := "melee"
	if _combat_type == "projectile":
		family = "ranged"
	elif _combat_type != "melee":
		family = "heavy"
	var walk_path := "res://assets/enemies/%s_walk.png" % family
	if not ResourceLoader.exists(walk_path):
		return
	# Combat-type aliases share the generated enemy's strips. Their timing sidecar
	# may remain under the original id; preserve that contract after the re-skin.
	var family_metadata := "res://assets/enemies/%s_animations.json" % family
	var enemy_metadata := "res://assets/enemies/%s_animations.json" % enemy_id
	if FileAccess.file_exists(family_metadata):
		sprite.animation_metadata_path = family_metadata
	elif FileAccess.file_exists(enemy_metadata):
		sprite.animation_metadata_path = enemy_metadata
	sprite.configure_and_rebuild(
		walk_path,
		"res://assets/enemies/%s_attack.png" % family,
		"res://assets/enemies/%s_hurt.png" % family,
		"res://assets/enemies/%s_death.png" % family,
		"res://assets/enemies/%s.png" % family,
	)

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
	_attack_cd = max(0.0, _attack_cd - delta)
	if _state == CombatState.WINDUP or _state == CombatState.ACTIVE or _state == CombatState.RECOVERY or _state == CombatState.HURT:
		_process_combat_state(delta)
		move_and_slide()
		_update_sprite()
		return
	var player := get_tree().get_first_node_in_group("player") as Node2D
	var to_player := Vector2.ZERO
	if player:
		to_player = player.global_position - global_position
	if player and to_player.length() <= detect_radius:
		if to_player.length() <= attack_range and _attack_cd <= 0.0:
			_begin_windup(to_player.normalized())
			velocity = Vector2.ZERO
		else:
			_state = CombatState.CHASE
			velocity = to_player.normalized() * (move_speed + (20.0 if is_boss else 0.0))
	else:
		_state = CombatState.IDLE
		_wander_time -= delta
		if _wander_time <= 0.0:
			_wander_dir = Vector2(randf_range(-1, 1), randf_range(-1, 1)).normalized()
			_wander_time = randf_range(0.8, 2.0)
		velocity = _wander_dir * (move_speed * 0.5)
	move_and_slide()
	_update_sprite()

## Genre-parity fix: this controller previously never touched `sprite` at all — no @onready
## reference existed — so every top-down enemy (this is the script Enemy.tscn actually uses, not
## the side-view-style EnemyController.gd left alongside it) rendered as whatever single static
## frame AnimatedAssetSprite.gd's _ready() happened to leave playing, never facing its movement or
## attack direction and never showing its real, already-generated walk/attack/hurt sheets as
## anything but a permanently-looping "walk". Mirrors the exact pattern BossController.gd (this
## same template) already gets right.
func _update_sprite() -> void:
	if sprite == null or sprite.sprite_frames == null:
		return
	if absf(velocity.x) > 1.0:
		sprite.flip_h = velocity.x < 0.0
	elif _state == CombatState.WINDUP or _state == CombatState.ACTIVE:
		sprite.flip_h = _attack_direction.x < 0.0
	# See TopDownPlayerController._update_sprite()'s comment: play() must not re-trigger every
	# physics frame while a state persists, or a non-looping clip never advances past frame 0 and
	# a looping one (walk) never advances at all.
	match _state:
		CombatState.HURT:
			if sprite.sprite_frames.has_animation("hurt") and not (sprite.animation == "hurt" and sprite.is_playing()):
				sprite.play("hurt")
		CombatState.WINDUP, CombatState.ACTIVE, CombatState.RECOVERY:
			if sprite.sprite_frames.has_animation("attack") and not (sprite.animation == "attack" and sprite.is_playing()):
				sprite.play("attack")
		_:
			if velocity.length() > 1.0:
				var locomotion := "run" if _state == CombatState.CHASE and sprite.sprite_frames.has_animation("run") else "walk"
				if sprite.animation != locomotion:
					sprite.play(locomotion)
			elif sprite.sprite_frames.has_animation("idle") and sprite.animation != "idle":
				sprite.play("idle")

func _begin_windup(dir: Vector2) -> void:
	_attack_cd = _combat_cooldown if _combat_cooldown > 0.0 else (1.1 if is_boss else 0.9)
	_attack_direction = dir
	_state = CombatState.WINDUP
	_state_time = ATTACK_WINDUP
	velocity = Vector2.ZERO

## Mirrors BossController._spawn_projectile() — same scene, same owner_node/damage contract.
func _spawn_projectile(direction: Vector2) -> void:
	var scene := load("res://scenes/enemies/Projectile.tscn") as PackedScene
	if scene == null:
		return
	var projectile := scene.instantiate()
	get_parent().add_child(projectile)
	projectile.global_position = global_position
	projectile.direction = direction
	projectile.damage = attack_hitbox.damage
	projectile.owner_node = self

## Read by tests and diagnostics — returns the current combat state machine state.
func get_combat_state() -> CombatState:
	return _state

func _process_combat_state(delta: float) -> void:
	_state_time -= delta
	if _state == CombatState.HURT:
		velocity = _knockback
		_knockback = _knockback.move_toward(Vector2.ZERO, 700.0 * delta)
		if _state_time <= 0.0:
			_state = CombatState.CHASE
		return
	velocity = Vector2.ZERO
	if _state_time > 0.0:
		return
	match _state:
		CombatState.WINDUP:
			AudioManager.play_sfx("boss_attack" if is_boss else "enemy_attack")
			if _combat_type == "projectile":
				# A ranged enemy fires and moves straight to RECOVERY — there's no melee hitbox
				# window to hold open, and leaving one active anyway (at a bogus melee-range
				# position) risks a spurious contact hit if the player closed distance during
				# the windup telegraph.
				_spawn_projectile(_attack_direction)
				_state = CombatState.RECOVERY
				_state_time = ATTACK_RECOVERY
			else:
				attack_hitbox.position = _attack_direction * 18.0
				attack_hitbox.activate()
				_state = CombatState.ACTIVE
				_state_time = ATTACK_ACTIVE
		CombatState.ACTIVE:
			attack_hitbox.deactivate()
			_state = CombatState.RECOVERY
			_state_time = ATTACK_RECOVERY
		_:
			_state = CombatState.CHASE

func _on_hit(damage: float, kb: Vector2) -> void:
	if health.invulnerable or not health.is_alive() or not is_finite(damage) or damage <= 0.0:
		return
	health.take_damage(damage)
	if not health.is_alive():
		return
	attack_hitbox.deactivate()
	_knockback = kb
	_state = CombatState.HURT
	_state_time = HURT_DURATION

## Same disclosed convention as BossController.gd's own _on_died() fix (this session's boss
## milestone): a real death sheet existed and was loaded but nothing ever played it or gave it
## time to be seen before the node vanished. A fixed wait (not `await sprite.animation_finished`
## — established in an earlier session as unreliable for a death sequence in this exact codebase)
## long enough for a short 3-4 frame clip, short enough not to stall a field-enemy-heavy fight.
## RuntimeSmokeTest.gd's two death-signal checks were updated to bounded-wait for this delay
## rather than asserting synchronously right after take_damage() — the same regression class (and
## fix) BossController's death delay already required from PlaytestAgent.gd this session.
const DEATH_ANIMATION_DURATION_SEC := 0.35

func _on_died() -> void:
	if _state == CombatState.DEAD:
		return
	if not is_boss:
		preload("res://scripts/core/LootSpawner.gd").spawn_for_enemy.call_deferred(get_parent(), global_position, _load_enemy_definition(enemy_id))
	_state = CombatState.DEAD
	attack_hitbox.deactivate()
	set_physics_process(false)
	if sprite and sprite.sprite_frames and sprite.sprite_frames.has_animation("death"):
		sprite.play("death")
		await get_tree().create_timer(DEATH_ANIMATION_DURATION_SEC).timeout
	if is_boss:
		InventoryManager.grant_item("wind_disc", 1)
		GameManager._on_ability_acquired("wind_disc")
		EventBus.boss_defeated.emit(boss_id)
	else:
		EventBus.enemy_killed.emit(enemy_id)
	queue_free()
