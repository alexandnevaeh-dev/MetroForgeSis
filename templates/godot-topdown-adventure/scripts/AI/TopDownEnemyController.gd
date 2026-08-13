extends CharacterBody2D
## Top-down wander / chase / melee. Used for field enemies and the TINY_TEST dungeon boss.

@export var is_boss: bool = false
@export var enemy_id: String = "enemy_000"
@export var boss_id: String = "boss_final"
@export var move_speed: float = 55.0
@export var detect_radius: float = 120.0
@export var attack_range: float = 22.0

@onready var health: HealthComponent = $HealthComponent
@onready var hurtbox: HurtboxComponent = $HurtboxComponent
@onready var attack_hitbox: HitboxComponent = $AttackHitbox

var _wander_dir := Vector2.RIGHT
var _wander_time := 0.0
var _attack_cd := 0.0

func _ready() -> void:
	motion_mode = MOTION_MODE_FLOATING
	health.died.connect(_on_died)
	hurtbox.hit_received.connect(_on_hit)
	attack_hitbox.owner_node = self
	attack_hitbox.monitoring = false

func _physics_process(delta: float) -> void:
	_attack_cd = max(0.0, _attack_cd - delta)
	var player := get_tree().get_first_node_in_group("player") as Node2D
	var to_player := Vector2.ZERO
	if player:
		to_player = player.global_position - global_position
	if player and to_player.length() <= detect_radius:
		if to_player.length() <= attack_range and _attack_cd <= 0.0:
			_attack(to_player.normalized())
			velocity = Vector2.ZERO
		else:
			velocity = to_player.normalized() * (move_speed + (20.0 if is_boss else 0.0))
	else:
		_wander_time -= delta
		if _wander_time <= 0.0:
			_wander_dir = Vector2(randf_range(-1, 1), randf_range(-1, 1)).normalized()
			_wander_time = randf_range(0.8, 2.0)
		velocity = _wander_dir * (move_speed * 0.5)
	move_and_slide()

func _attack(dir: Vector2) -> void:
	_attack_cd = 1.1 if is_boss else 0.9
	attack_hitbox.position = dir * 18.0
	attack_hitbox.activate()
	get_tree().create_timer(0.16).timeout.connect(func() -> void: attack_hitbox.deactivate())

func _on_hit(damage: float, _kb: Vector2) -> void:
	health.take_damage(damage)

func _on_died() -> void:
	if is_boss:
		InventoryManager.grant_item("wind_disc", 1)
		GameManager._on_ability_acquired("wind_disc")
		EventBus.boss_defeated.emit(boss_id)
	else:
		EventBus.enemy_killed.emit(enemy_id)
	queue_free()
