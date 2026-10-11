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
var _planned_attack: String = ""
var _planned_direction := Vector2.RIGHT
var _warning_line: Line2D
var _exiting := false
var _owned_waits: Array[Timer] = []
var _pose_direction := Vector2.RIGHT
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
	if not active and is_instance_valid(_warning_line):
		_warning_line.queue_free()
	if sprite:
		var tell := Color(1.45,0.4,0.4)
		if _planned_attack == "projectile": tell = Color(1.3,1.0,0.4)
		elif _planned_attack == "area_burst": tell = Color(0.6,1.2,1.4)
		sprite.modulate = tell if active else Color.WHITE
	if active and _planned_attack == "projectile":
		_warning_line = Line2D.new()
		_warning_line.width = 2.0
		_warning_line.default_color = Color(1.0,0.72,0.3,0.8)
		_warning_line.points = PackedVector2Array([Vector2.ZERO,_planned_direction*180.0])
		add_child(_warning_line)
	if active:
		# A body-tint alone only reads once a player is already looking at the boss — a real
		# ground-anchored warning ring gives a second, more spatial "an attack is coming" signal,
		# visible even at a glance, and is exactly the ring VFXManager.play_ring() already knows
		# how to draw. Timed to the same real _get_phase_telegraph() duration used to actually
		# hold the boss still below, so the visible warning and the real windup window never drift
		# apart — a player who reacts to the ring gets the same real evade time either way.
		var warn_at := global_position
		var sockets := get_node_or_null("Sockets")
		if sockets != null and sockets.has_method("global_socket"):
			warn_at = sockets.call("global_socket", "ground_contact", warn_at)
		VFXManager.play_ring("attack_warning", warn_at, 8, 40.0, 1.0)

func _start_attack_loop() -> void:
	# Opening beat before the first telegraph — uses phase-1 recovery so larger profiles feel
	# less oppressive on spawn while still honoring generated pacing data.
	if not await _wait_owned(_get_phase_recovery()): return
	while is_inside_tree() and health.is_alive():
		var attacks: Array = _phase_attacks[_phase-1] if _phase-1<_phase_attacks.size() else ["slam"]
		_planned_attack = String(attacks.pick_random()) if not attacks.is_empty() else "slam"
		var player := get_tree().get_first_node_in_group("player") as Node2D
		if player: _planned_direction = (player.global_position-global_position).normalized()
		_set_telegraph_visual(true)
		if not await _wait_owned(_get_phase_telegraph()): return
		_set_telegraph_visual(false)
		if not health.is_alive():
			break
		_attack_busy = true
		await _perform_attack()
		_planned_attack = ""
		_attack_busy = false
		if not health.is_alive():
			break
		if not await _wait_owned(_get_phase_recovery()): return

## Concurrent phase, strike and death waits each belong to this actor. Freeing the
## actor also frees pending timers rather than leaving a referenced SceneTreeTimer.
func _wait_owned(seconds: float) -> bool:
	if _exiting: return false
	var timer := Timer.new()
	timer.one_shot = true
	timer.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(timer)
	_owned_waits.append(timer)
	timer.start(seconds)
	await timer.timeout
	_owned_waits.erase(timer)
	timer.queue_free()
	return not _exiting

func _exit_tree() -> void:
	_exiting = true
	# Resume cancelled waiters so their nested function states release as well.
	for timer in _owned_waits.duplicate():
		if is_instance_valid(timer):
			timer.stop()
			timer.timeout.emit()

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

const MOVE_SPEED := 70.0
const CHASE_RANGE := 26.0

func _physics_process(delta: float) -> void:
	if not health.is_alive():
		return

	if _hurt_timer > 0.0:
		_hurt_timer -= delta

	# Hold position while telegraphing or mid-swing — this is the same window
	# _set_telegraph_visual() flags visually (red flash), so a player who reacts to that tell
	# gets a real chance to back out of range instead of the boss just closing the gap anyway.
	if _attack_busy or _telegraph_active:
		velocity = Vector2.ZERO
	else:
		var player := get_tree().get_first_node_in_group("player") as Node2D
		if player and global_position.distance_to(player.global_position) > CHASE_RANGE:
			velocity = (player.global_position - global_position).normalized() * MOVE_SPEED
		else:
			velocity = Vector2.ZERO
	move_and_slide()

	if sprite and sprite.sprite_frames:
		var current_action := String(sprite.animation).get_slice("_", 0)
		if _hurt_timer > 0.0 and current_action == "hurt":
			pass
		elif current_action == "attack" and sprite.is_playing():
			pass
		elif _telegraph_active:
			_play_boss_pose("idle", _planned_direction)
		else:
			var locomotion := "idle" if velocity.length() <= 1.0 else "run"
			# Preserve the playing frame instead of restarting on every physics tick.
			_play_boss_pose(locomotion, velocity)

## Select only authored directions. Generic frontal artwork retains its original
## orientation; choosing a directional strip must not mirror it a second time.
func _play_boss_pose(action: String, direction: Vector2, restart := false) -> bool:
	if sprite == null or sprite.sprite_frames == null: return false
	var previous_action := String(sprite.animation).get_slice("_", 0)
	if not restart and action in ["attack", "hurt", "death"] and previous_action == action:
		return true
	if not direction.is_zero_approx(): _pose_direction = direction.normalized()
	var facings := ["E", "SE", "S", "SW", "W", "NW", "N", "NE"]
	var facing: String = facings[posmod(int(round(_pose_direction.angle()/(PI/4.0))),8)]
	var target: StringName = action
	if sprite.has_method("resolve_animation"): target = sprite.call("resolve_animation",action,facing)
	elif action == "run" and not sprite.sprite_frames.has_animation(target): target = &"walk"
	if not sprite.sprite_frames.has_animation(target): return false
	if String(target).ends_with("_"+facing): sprite.flip_h = false
	if sprite.animation == target and not restart: return true
	var phase := 0.0
	var preserve_phase := not restart and action in ["walk", "run"] and previous_action in ["walk", "run"]
	if preserve_phase:
		var count := sprite.sprite_frames.get_frame_count(sprite.animation)
		if count > 0: phase = (float(sprite.frame)+sprite.frame_progress)/float(count)
	if restart: sprite.stop()
	sprite.play(target)
	if preserve_phase:
		var position := phase*sprite.sprite_frames.get_frame_count(target)
		sprite.set_frame_and_progress(int(position),position-floor(position))
	return true

func _perform_attack() -> void:
	_play_attack_animation()
	var attacks: Array = _phase_attacks[_phase - 1] if _phase - 1 < _phase_attacks.size() else ["slam"]
	var attack: String = _planned_attack if not _planned_attack.is_empty() else (String(attacks.pick_random()) if not attacks.is_empty() else "slam")
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
	_play_boss_pose("attack",_planned_direction,true)

func _perform_slam_attack() -> void:
	VFXManager.play("slam_shock", global_position + Vector2(0, 24), 1.5)
	await _perform_melee_attack()

func _perform_melee_attack() -> void:
	_play_attack_animation()
	attack_hitbox.activate()
	if not await _wait_owned(0.3): return
	attack_hitbox.deactivate()

func _fire_projectile_attack() -> void:
	var player := get_tree().get_first_node_in_group("player")
	var direction := Vector2.RIGHT
	if _planned_attack == "projectile":
		direction = _planned_direction
	elif player:
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
	if health.invulnerable or not health.is_alive() or not is_finite(damage) or damage <= 0.0:
		return
	var final_damage := damage
	if "dash_through" in _weaknesses:
		var player := get_tree().get_first_node_in_group("player")
		if player and player.get("_is_dashing") == true:
			final_damage *= WEAKNESS_DAMAGE_MULTIPLIER
	health.take_damage(final_damage)
	# died emits synchronously and starts the death clip. Do not replace it with hurt.
	if not health.is_alive():
		return
	velocity = knockback
	if _play_boss_pose("hurt",_pose_direction,true):
		_hurt_timer = HURT_FLASH_DURATION

func _on_health_changed(current: float, max_h: float) -> void:
	var threshold := 1.0 - float(_phase) / float(_phase_count)
	if current / max_h <= threshold and _phase < _phase_count:
		_phase += 1
		VFXManager.play_phase_shift(global_position)
		AudioManager.play_sfx("boss_hit")

## Real per-frame duration for a 3-frame clip at SpriteFrames' engine default of 5fps
## (0.6s), plus a small buffer — AnimatedAssetSprite.gd never sets a custom animation speed
## (that's a side-view-only feature, its own metadata-sidecar pass), so the default applies.
## A fixed, disclosed constant rather than computing it from sprite_frames at runtime: the
## death animation must still finish even when a project's boss has no real death sheet
## (get_frame_count("death") would be 0, computing a bogus near-zero wait) or a fallback
## single-frame placeholder (get_animation_speed()/get_frame_count() on an animation that
## doesn't exist would error, not just return 0).
const DEATH_ANIMATION_DURATION_SEC := 0.7

func _on_died() -> void:
	set_physics_process(false)
	attack_hitbox.deactivate()
	# Previously queue_free()'d immediately on death — even after death_sheet_path was wired in
	# (see AnimatedAssetSprite.gd), nothing ever actually played that animation before the node
	# was destroyed. Real wall-clock wait, not `await sprite.animation_finished`: that signal was
	# already found unreliable for a death sequence in this exact codebase (see
	# PlayerController.gd's own _on_died() history) and isn't trusted here either.
	if _play_boss_pose("death",_pose_direction,true):
		if not await _wait_owned(DEATH_ANIMATION_DURATION_SEC): return
	# Victory (EventBus.boss_defeated -> GameManager.current_state = VICTORY) intentionally waits
	# until after the death animation has actually played, not simultaneously with it.
	EventBus.boss_defeated.emit(boss_id)
	queue_free()
