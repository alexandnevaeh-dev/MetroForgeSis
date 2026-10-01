class_name HealthComponent
extends Node

signal died
signal health_changed(current: float, max_health: float)
signal damaged(amount: float)

@export var max_health: float = 100.0
## SFX ids (audio/sfx/<id>.wav) played on damage/death — overridable per scene so, for
## example, Boss.tscn can use the punchier "boss_hit" instead of the default "hit"
## without any script change. Empty string plays nothing.
@export var hit_sfx_id: String = "hit"
@export var death_sfx_id: String = "death"
var current_health: float = 100.0
var invulnerable: bool = false
## Armor rating: 100 halves incoming damage; diminishing returns prevent immunity.
var armor_rating: float = 0.0

func _ready() -> void:
	current_health = max_health
	damaged.connect(_on_damaged)
	died.connect(_on_died)

func take_damage(amount: float) -> void:
	if invulnerable or not is_finite(amount) or amount <= 0 or current_health <= 0:
		return
	var rating := maxf(0.0, armor_rating) if is_finite(armor_rating) else 0.0
	amount *= 100.0 / (100.0 + rating)
	current_health = max(0, current_health - amount)
	damaged.emit(amount)
	health_changed.emit(current_health, max_health)
	if has_node("/root/CombatFeedback"):
		CombatFeedback.play_hit(get_parent(), amount)
	if current_health <= 0:
		died.emit()

func heal(amount: float) -> void:
	current_health = min(max_health, current_health + amount)
	health_changed.emit(current_health, max_health)

func is_alive() -> bool:
	return current_health > 0

func reset_health() -> void:
	current_health = max_health
	health_changed.emit(current_health, max_health)

func _on_damaged(_amount: float) -> void:
	if not hit_sfx_id.is_empty():
		AudioManager.play_sfx(hit_sfx_id)
	_play_hit_vfx()

func _on_died() -> void:
	if not death_sfx_id.is_empty():
		AudioManager.play_sfx(death_sfx_id)
	if has_node("/root/VFXManager") and VFXManager.has_method("play_at_socket"):
		VFXManager.play_at_socket(get_parent(), "impact_origin", "death_puff", 1.4, Vector2(0, -16))
	else:
		VFXManager.play("death_puff", _vfx_position("impact_origin"), 1.4)

func _play_hit_vfx() -> void:
	if not has_node("/root/VFXManager"):
		return
	var contact: Variant = _consume_hit_contact()
	if contact is Vector2:
		VFXManager.play("hit_spark", contact as Vector2, 1.0)
		return
	if VFXManager.has_method("play_at_socket"):
		VFXManager.play_at_socket(get_parent(), "chest", "hit_spark", 1.0, Vector2(0, -20))
	else:
		VFXManager.play("hit_spark", _vfx_position("chest"))

func _consume_hit_contact() -> Variant:
	var owner_node: Node = get_parent()
	if owner_node == null:
		return null
	var hurtbox: Node = owner_node.get_node_or_null("HurtboxComponent")
	if hurtbox != null and hurtbox.has_method("take_last_hit_contact"):
		return hurtbox.call("take_last_hit_contact")
	return null

func _vfx_position(socket_id: String = "chest") -> Vector2:
	var owner_2d := get_parent() as Node2D
	if owner_2d == null:
		return Vector2.ZERO
	var sockets: Node = owner_2d.get_node_or_null("Sockets")
	if sockets != null and sockets.has_method("global_socket"):
		return sockets.call("global_socket", socket_id, owner_2d.global_position) as Vector2
	return owner_2d.global_position
