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
var _trail: Line2D
var _bolt: Sprite2D

func _ready() -> void:
	area_entered.connect(_on_area_entered)
	_apply_bolt_visual()


func _apply_bolt_visual() -> void:
	var old := get_node_or_null("Sprite")
	if old:
		old.queue_free()
	var spr := Sprite2D.new()
	spr.name = "Sprite"
	spr.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	spr.centered = true
	var path := "res://assets/vfx/ranged_projectile.png"
	if not ResourceLoader.exists(path):
		path = "res://assets/vfx/projectile.png"
	if ResourceLoader.exists(path):
		spr.texture = load(path)
	add_child(spr)
	var trail := Line2D.new()
	trail.name = "Trail"
	trail.width = 4.0
	trail.default_color = Color(0.94, 0.74, 0.38, 0.72)
	trail.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	if ResourceLoader.exists("res://assets/vfx/projectile_trail.png"):
		trail.texture = load("res://assets/vfx/projectile_trail.png")
		trail.texture_mode = Line2D.LINE_TEXTURE_STRETCH
	add_child(trail)
	_trail = trail
	_bolt = spr


func _physics_process(delta: float) -> void:
	position += direction * speed * delta
	_age += delta
	if _bolt:
		_bolt.rotation = direction.angle()
	if _trail:
		_trail.add_point(Vector2.ZERO)
		if _trail.get_point_count() > 14:
			_trail.remove_point(0)
		for i in _trail.get_point_count():
			_trail.set_point_position(i, _trail.get_point_position(i) - direction * speed * delta)
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
		var hurtbox := area as HurtboxComponent
		var contact := global_position.lerp(hurtbox.global_position, 0.45)
		var shape := hurtbox.get_node_or_null("CollisionShape2D") as CollisionShape2D
		if shape != null:
			contact = global_position.lerp(shape.global_position, 0.55)
		hurtbox.receive_hit(damage, knockback_force, attacker, contact)
		if not pierce:
			queue_free()
