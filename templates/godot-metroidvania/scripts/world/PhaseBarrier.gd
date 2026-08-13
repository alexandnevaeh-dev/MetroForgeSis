extends StaticBody2D

## Solid until the player phase-dashes through it.



func _ready() -> void:

	add_to_group("phase_barrier")

	collision_layer = 64

	collision_mask = 0

