extends Node2D
## Authored one-shot weapon window. Standing body-contact damage is separate.
var enemy: Node2D
var sprite: AnimatedSprite2D
var hitbox: HitboxComponent
var bounds := Rect2()
var active_frames: Array[int] = []
var damage := 0.0
var facing := 1.0
var cancelled := false

func configure(actor: Node2D, view: AnimatedSprite2D, path: String, amount: float) -> bool:
	if not is_instance_valid(actor) or not FileAccess.file_exists(path) or not is_instance_valid(view) or view.sprite_frames==null:
		return false
	var metadata: Variant=JSON.parse_string(FileAccess.get_file_as_string(path))
	if not metadata is Dictionary or not metadata.get("attack") is Dictionary:
		return false
	var clip: Dictionary=metadata.attack
	var window: Variant=clip.get("hitWindow")
	if not window is Dictionary or not clip.get("loop") is bool:
		return false
	if clip.loop or not view.sprite_frames.has_animation("attack") or view.sprite_frames.get_animation_loop("attack"):
		return false
	var frames: Variant=window.get("frames")
	var rect: Variant=window.get("rect")
	var count:=view.sprite_frames.get_frame_count("attack")
	var declared_count: Variant=clip.get("frameCount")
	var declared_fps: Variant=clip.get("fps")
	if not (declared_count is int or declared_count is float) or not is_finite(float(declared_count)) or float(declared_count)!=float(count):
		return false
	if not (declared_fps is int or declared_fps is float) or not is_finite(float(declared_fps)) or float(declared_fps)<=0.0 or not is_equal_approx(float(declared_fps),view.sprite_frames.get_animation_speed("attack")):
		return false
	if not frames is Array or frames.is_empty() or frames.size()>count or not rect is Array or rect.size()!=4:
		return false
	var validated: Array[int]=[]
	for value in frames:
		if not (value is int or value is float) or not is_finite(float(value)) or float(value)!=floorf(float(value)) or value<0 or value>=count:
			return false
		if not validated.is_empty() and int(value)!=validated.back()+1:
			return false
		validated.append(int(value))
	for value in rect:
		if not (value is int or value is float) or not is_finite(float(value)) or absf(float(value))>256.0:
			return false
	if float(rect[2])<=0.0 or float(rect[3])<=0.0 or not is_finite(amount) or amount<=0.0:
		return false
	enemy=actor
	sprite=view
	damage=amount
	active_frames=validated
	bounds=Rect2(float(rect[0]),float(rect[1]),float(rect[2]),float(rect[3]))
	return true

func _ready() -> void:
	hitbox=HitboxComponent.new()
	hitbox.name="WeaponHitbox"
	hitbox.collision_layer=8
	hitbox.collision_mask=16
	hitbox.damage=damage
	hitbox.owner_node=enemy
	var shape:=CollisionShape2D.new()
	shape.name="CollisionShape2D"
	shape.shape=RectangleShape2D.new()
	shape.shape.size=bounds.size
	hitbox.add_child(shape)
	add_child(hitbox)
	sprite.animation_changed.connect(_animation_changed)
	sprite.frame_changed.connect(_frame_changed)
	sprite.animation_finished.connect(_refresh)
	var health := enemy.get_node_or_null("HealthComponent") as HealthComponent
	if health:health.damaged.connect(_damage_received)
	_animation_changed()

func _animation_changed() -> void:
	if sprite.animation=="attack":
		cancelled=false
		facing=-1.0 if sprite.scale.x<0.0 else 1.0
	_refresh()

func _frame_changed() -> void:
	# Replaying the same finished clip need not emit animation_changed.
	if sprite.animation=="attack" and sprite.frame==0:
		cancelled=false
		facing=-1.0 if sprite.scale.x<0.0 else 1.0
	_refresh()

func _damage_received(_amount: float) -> void:
	cancelled=true
	if is_instance_valid(hitbox):hitbox.deactivate()

func _physics_process(_delta: float) -> void:
	_refresh()

func _refresh() -> void:
	if hitbox==null or not is_instance_valid(sprite) or not is_instance_valid(enemy):
		return
	var center:=bounds.get_center()
	hitbox.position=Vector2(center.x*facing,center.y)
	var active:=not cancelled and sprite.animation=="attack" and sprite.is_playing() and sprite.frame in active_frames and not bool(enemy.get("_dying")) and float(enemy.get("_hurt_timer"))<=0.0
	if active and not hitbox.monitoring:
		hitbox.activate()
	elif not active and hitbox.monitoring:
		hitbox.deactivate()

func _exit_tree() -> void:
	if is_instance_valid(hitbox):hitbox.deactivate()
