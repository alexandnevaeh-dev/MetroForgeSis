extends CharacterBody2D

@export var enemy_id: String = "enemy_default"
@export var patrol_distance: float = 100.0
@export var move_speed: float = 80.0
@export var contact_damage: float = 15.0

var _start_x: float
var _direction: int = 1

@onready var health: HealthComponent = $HealthComponent
@onready var hurtbox: HurtboxComponent = $HurtboxComponent
@onready var contact_hitbox: HitboxComponent = $ContactHitbox
@onready var sprite: AnimatedSprite2D = $Sprite

func _ready() -> void:
	_start_x = global_position.x
	health.died.connect(_on_died)
	contact_hitbox.owner_node = self
	contact_hitbox.damage = contact_damage

func _physics_process(delta: float) -> void:
	if not health.is_alive():
		return
	velocity.x = _direction * move_speed
	velocity.y += 980.0 * delta
	move_and_slide()

	if global_position.x > _start_x + patrol_distance:
		_direction = -1
	elif global_position.x < _start_x - patrol_distance:
		_direction = 1

	if sprite and sprite.sprite_frames:
		if velocity.x != 0:
			sprite.play("walk")
			sprite.scale.x = abs(sprite.scale.x) * sign(velocity.x)
		else:
			sprite.play("idle")

func _on_died() -> void:
	EventBus.enemy_killed.emit(enemy_id)
	queue_free()
