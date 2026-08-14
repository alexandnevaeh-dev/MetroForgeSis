extends CharacterBody2D
## Stats AND attack behavior read from the real generated data/bosses/bosses.json at runtime
## (same pattern EnemyController/QuestManager/ItemPickup use), keyed by boss_id — previously
## every boss used Boss.tscn's hardcoded 200 HP / single phase / melee-only attack regardless of
## what content.ts actually generated, and the assembler never even set boss_id on the instanced
## node. That meant every boss in a multi-boss profile (SMALL/MEDIUM/LARGE — TINY_TEST's single
## boss never exposed this) emitted EventBus.boss_defeated("boss_final") on death regardless of
## which boss actually died, incorrectly triggering victory and defeated-boss tracking for the
## wrong boss.
##
## Each phase's real generated `attacks` array now actually picks which attack fires. Only
## "slam"/"projectile"/"area_burst" are ever generated (content.ts hardcodes these three literal
## attack names) — any other/future value falls back to the existing melee swing rather than
## being faked.

const BOSSES_PATH := "res://data/bosses/bosses.json"

@export var boss_id: String = "boss_final"

var _phase: int = 1
var _phase_count: int = 1
## Attacks available per phase, indexed 0-based (phase 1 == index 0) — read from real generated
## data; falls back to melee-only if a phase has no attacks listed.
var _phase_attacks: Array = [["slam"]]
## Per-phase timing from generated data/bosses/bosses.json — previously ignored; boss used a
## hardcoded 2.0s cooldown regardless of telegraphDuration/recoveryWindow in each phase.
var _phase_telegraphs: Array = [0.8]
var _phase_recoveries: Array = [1.2]
var _attack_busy: bool = false
var _telegraph_active: bool = false
## Real generated tags (content.ts currently only ever produces "dash_through") — previously
## generated and stored but never read by anything at runtime.
var _weaknesses: Array = []
const WEAKNESS_DAMAGE_MULTIPLIER := 2.0
## How much longer the "hurt" flash animation should keep playing before the normal walk/idle
## logic in _physics_process is allowed to override it again.
var _hurt_timer: float = 0.0
const HURT_FLASH_DURATION := 0.25

@onready var health: HealthComponent = $HealthComponent
@onready var hurtbox: HurtboxComponent = $HurtboxComponent
@onready var attack_hitbox: HitboxComponent = $AttackHitbox
@onready var sprite: AnimatedSprite2D = $Sprite

func _ready() -> void:
	health.died.connect(_on_died)
	attack_hitbox.owner_node = self
	health.health_changed.connect(_on_health_changed)
	# Was never connected — HurtboxComponent.receive_hit() only emits hit_received; nothing
	# forwards it to HealthComponent.take_damage() unless the owner explicitly wires it (see
	# PlayerController.gd for the working reference). Without this, the player's AttackHitbox
	# could touch the boss's Hurtbox all day and it would never actually lose health.
	hurtbox.hit_received.connect(_on_hit_received)
	_apply_boss_data()
	_start_attack_loop()

func _get_phase_telegraph() -> float:
	var idx := _phase - 1
	if idx >= 0 and idx < _phase_telegraphs.size():
		return float(_phase_telegraphs[idx])
	return 0.8

func _get_phase_recovery() -> float:
	var idx := _phase - 1
	if idx >= 0 and idx < _phase_recoveries.size():
		return float(_phase_recoveries[idx])
	return 1.2

func _set_telegraph_visual(active: bool) -> void:
	_telegraph_active = active
	if sprite:
		sprite.modulate = Color(1.45, 0.4, 0.4) if active else Color.WHITE

func _start_attack_loop() -> void:
	# Opening beat before the first telegraph — uses phase-1 recovery so larger profiles feel
	# less oppressive on spawn while still honoring generated pacing data.
	await get_tree().create_timer(_get_phase_recovery()).timeout
	while is_inside_tree() and health.is_alive():
		_set_telegraph_visual(true)
		await get_tree().create_timer(_get_phase_telegraph()).timeout
		_set_telegraph_visual(false)
		if not health.is_alive():
			break
		_attack_busy = true
		await _perform_attack()
		_attack_busy = false
		if not health.is_alive():
			break
		await get_tree().create_timer(_get_phase_recovery()).timeout

func _apply_boss_data() -> void:
	var data := _load_boss_definition(boss_id)
	if data.is_empty():
		return

	if data.has("health"):
		health.max_health = float(data["health"])
		health.current_health = health.max_health

	var phases: Array = data.get("phases", [])
	if phases.size() > 0:
		_phase_count = phases.size()
		var parsed_attacks: Array = []
		var parsed_telegraphs: Array = []
		var parsed_recoveries: Array = []
		for phase_data in phases:
			parsed_attacks.append(phase_data.get("attacks", ["slam"]))
			parsed_telegraphs.append(float(phase_data.get("telegraphDuration", 0.8)))
			parsed_recoveries.append(float(phase_data.get("recoveryWindow", 1.2)))
		_phase_attacks = parsed_attacks
		_phase_telegraphs = parsed_telegraphs
		_phase_recoveries = parsed_recoveries

	_weaknesses = data.get("weaknesses", [])

func _load_boss_definition(id: String) -> Dictionary:
	if not FileAccess.file_exists(BOSSES_PATH):
		return {}
	var file := FileAccess.open(BOSSES_PATH, FileAccess.READ)
	if file == null:
		return {}
	var text := file.get_as_text()
	file.close()

	var json := JSON.new()
	if json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		return {}

	for boss in json.data.get("bosses", []):
		if boss.get("id", "") == id:
			return boss
	return {}

func _physics_process(delta: float) -> void:
	if not health.is_alive():
		return
	velocity.y += 980.0 * delta

	if _hurt_timer > 0.0:
		_hurt_timer -= delta

	if sprite and sprite.sprite_frames:
		if _hurt_timer > 0.0 and sprite.sprite_frames.has_animation("hurt"):
			pass
		elif sprite.animation == "attack" and sprite.is_playing():
			pass
		elif _telegraph_active:
			if sprite.sprite_frames.has_animation("idle"):
				sprite.play("idle")
		else:
			sprite.play("walk")

func _perform_attack() -> void:
	_play_attack_animation()
	var attacks: Array = _phase_attacks[_phase - 1] if _phase - 1 < _phase_attacks.size() else ["slam"]
	var attack: String = String(attacks[randi() % attacks.size()]) if attacks.size() > 0 else "slam"
	match attack:
		"projectile":
			_fire_projectile_attack()
		"area_burst":
			_fire_burst_attack()
		"slam":
			await _perform_slam_attack()
		_:
			await _perform_melee_attack()

func _play_attack_animation() -> void:
	if sprite and sprite.sprite_frames and sprite.sprite_frames.has_animation("attack"):
		sprite.play("attack")

func _perform_slam_attack() -> void:
	VFXManager.play("slam_shock", global_position + Vector2(0, 24), 1.5)
	await _perform_melee_attack()

func _perform_melee_attack() -> void:
	if sprite and sprite.sprite_frames and sprite.sprite_frames.has_animation("attack"):
		sprite.play("attack")
	attack_hitbox.activate()
	await get_tree().create_timer(0.3).timeout
	attack_hitbox.deactivate()

func _fire_projectile_attack() -> void:
	var player := get_tree().get_first_node_in_group("player")
	var direction := Vector2.RIGHT
	if player:
		direction = (player.global_position - global_position).normalized()
	_spawn_projectile(direction)

func _fire_burst_attack() -> void:
	VFXManager.play("area_burst", global_position, 1.8)
	VFXManager.play_ring("area_burst", global_position, 6, 36.0, 1.2)
	var burst_count := 6
	for i in range(burst_count):
		var angle := (TAU / burst_count) * i
		_spawn_projectile(Vector2(cos(angle), sin(angle)))

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

## "dash_through" is the only weakness tag content.ts ever generates — checked directly against
## the player's real dash state rather than adding a new signal parameter to plumb the attacker
## through HurtboxComponent, which every other hitbox/hurtbox pair would have had to adopt too.
func _on_hit_received(damage: float, knockback: Vector2) -> void:
	var final_damage := damage
	if "dash_through" in _weaknesses:
		var player := get_tree().get_first_node_in_group("player")
		if player and player.get("_is_dashing") == true:
			final_damage *= WEAKNESS_DAMAGE_MULTIPLIER
	health.take_damage(final_damage)
	velocity = knockback
	if sprite and sprite.sprite_frames and sprite.sprite_frames.has_animation("hurt"):
		sprite.play("hurt")
		_hurt_timer = HURT_FLASH_DURATION

func _on_health_changed(current: float, max_h: float) -> void:
	var threshold := 1.0 - float(_phase) / float(_phase_count)
	if current / max_h <= threshold and _phase < _phase_count:
		_phase += 1
		VFXManager.play_phase_shift(global_position)
		AudioManager.play_sfx("boss_hit")

func _on_died() -> void:
	set_physics_process(false)
	if sprite and sprite.sprite_frames and sprite.sprite_frames.has_animation("death"):
		sprite.play("death")
		await sprite.animation_finished
	EventBus.boss_defeated.emit(boss_id)
	queue_free()
