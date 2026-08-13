extends Area2D
## Spawned by EnemyController / BossController. Default is a constant-velocity bolt that
## despawns on the first Hurtbox hit. Beam attacks set pierce=true and speed=0 so the same
## scene can be a short-lived line that stays out for its lifetime.

@export var speed: float = 260.0
@export var damage: float = 8.0
@export var knockback_force: float = 150.0
@export var lifetime: float = 2.5
@export var direction: Vector2 = Vector2.RIGHT
@export var pierce: bool = false
var owner_node: Node2D = null

var _age: float = 0.0
var _hit_targets: Array[Node] = []

func _ready() -> void:
	area_entered.connect(_on_area_entered)

func _physics_process(delta: float) -> void:
	position += direction * speed * delta
	_age += delta
	if _age >= lifetime:
		queue_free()

func _on_area_entered(area: Area2D) -> void:
	if area is HurtboxComponent:
		var target := area.get_parent()
		if target == owner_node or target in _hit_targets:
			return
		_hit_targets.append(target)
		# owner_node may have been freed (the enemy/boss that fired this died before the
		# projectile landed) — treat that as "no owner" rather than passing a dangling
		# reference into receive_hit(), which its static Node2D param type rejects at runtime.
		var attacker: Node2D = owner_node if is_instance_valid(owner_node) else null
		area.receive_hit(damage, knockback_force, attacker)
		if not pierce:
			queue_free()
