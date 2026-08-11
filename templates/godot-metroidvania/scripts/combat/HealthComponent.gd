class_name HealthComponent
extends Node

signal died
signal health_changed(current: float, max_health: float)
signal damaged(amount: float)

@export var max_health: float = 100.0
var current_health: float = 100.0
var invulnerable: bool = false

func _ready() -> void:
	current_health = max_health

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
