extends StaticBody2D

## Anchor the grapple ability latches onto.



func _ready() -> void:

	add_to_group("grapple_point")

	collision_layer = 1

	collision_mask = 0

