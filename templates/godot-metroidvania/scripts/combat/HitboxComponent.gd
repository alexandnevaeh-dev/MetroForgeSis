class_name HitboxComponent
extends Area2D

@export var damage: float = 10.0
@export var knockback_force: float = 200.0
@export var owner_node: Node2D

var _hit_targets: Array[Node] = []

func _ready() -> void:
	area_entered.connect(_on_area_entered)
	monitoring = false

func activate() -> void:
	_hit_targets.clear()
	monitoring = true

func deactivate() -> void:
	monitoring = false

func _on_area_entered(area: Area2D) -> void:
	if area is HurtboxComponent:
		var target := area.get_parent()
		if target == owner_node or target in _hit_targets:
			return
		_hit_targets.append(target)
		var hurtbox := area as HurtboxComponent
		hurtbox.receive_hit(damage, knockback_force, owner_node)
