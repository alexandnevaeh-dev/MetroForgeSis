extends StaticBody2D
## Physical phase barrier kept for template resource parity. Top-down dungeon gates use
## ItemGate.gd today; this node remains solid unless a future top-down phase mechanic
## explicitly opts into it.

func _ready() -> void:
	collision_layer = 64
	collision_mask = 0
