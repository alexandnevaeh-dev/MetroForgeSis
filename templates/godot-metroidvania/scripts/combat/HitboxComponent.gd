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
	# Area2D does not emit area_entered for shapes that were already overlapping
	# when monitoring flips true. A standing melee swing (playtest bot, or a player
	# who walked into range then attacked) would otherwise deal 0 damage forever.
	if is_inside_tree():
		get_tree().physics_frame.connect(_apply_current_overlaps, CONNECT_ONE_SHOT)

func deactivate() -> void:
	monitoring = false

func _apply_current_overlaps() -> void:
	if not monitoring:
		return
	for area in get_overlapping_areas():
		_on_area_entered(area)

func _on_area_entered(area: Area2D) -> void:
	if area is HurtboxComponent:
		var target := area.get_parent()
		if target == owner_node or target in _hit_targets:
			return
		_hit_targets.append(target)
		var hurtbox := area as HurtboxComponent
		# owner_node may have been freed since activate() — treat that as "no owner" rather
		# than passing a dangling reference into receive_hit() (see Projectile.gd for the same
		# guard, where this was first caught live).
		var attacker: Node2D = owner_node if is_instance_valid(owner_node) else null
		hurtbox.receive_hit(damage, knockback_force, attacker)
