extends CharacterBody2D

@export var boss_id: String = "boss_final"
@export var phase_count: int = 1

var _phase: int = 1
var _attack_timer: float = 0.0
var _attack_cooldown: float = 2.0

@onready var health: HealthComponent = $HealthComponent
@onready var hurtbox: HurtboxComponent = $HurtboxComponent
@onready var attack_hitbox: HitboxComponent = $AttackHitbox
@onready var sprite: AnimatedSprite2D = $Sprite

func _ready() -> void:
	health.died.connect(_on_died)
	attack_hitbox.owner_node = self
	health.health_changed.connect(_on_health_changed)

func _physics_process(delta: float) -> void:
	if not health.is_alive():
		return
	velocity.y += 980.0 * delta
	_attack_timer -= delta
	if _attack_timer <= 0:
		_perform_attack()
		_attack_timer = _attack_cooldown

	if sprite and sprite.sprite_frames:
		sprite.play("walk" if _attack_timer < _attack_cooldown * 0.5 else "idle")

func _perform_attack() -> void:
	attack_hitbox.activate()
	await get_tree().create_timer(0.3).timeout
	attack_hitbox.deactivate()

func _on_health_changed(current: float, max_h: float) -> void:
	var threshold := 1.0 - float(_phase) / float(phase_count)
	if current / max_h <= threshold and _phase < phase_count:
		_phase += 1
		_attack_cooldown = max(0.8, _attack_cooldown - 0.3)

func _on_died() -> void:
	EventBus.boss_defeated.emit(boss_id)
	queue_free()
