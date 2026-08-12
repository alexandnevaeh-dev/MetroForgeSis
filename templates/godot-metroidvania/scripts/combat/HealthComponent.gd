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

func _ready() -> void:
	current_health = max_health
	damaged.connect(_on_damaged)
	died.connect(_on_died)

func take_damage(amount: float) -> void:
	if invulnerable or amount <= 0:
		return
	current_health = max(0, current_health - amount)
	damaged.emit(amount)
	health_changed.emit(current_health, max_health)
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

func _on_died() -> void:
	if not death_sfx_id.is_empty():
		AudioManager.play_sfx(death_sfx_id)
