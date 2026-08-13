class_name ChestPickup
extends Area2D
## Interact-based item container — top-down's counterpart to the side-view template's
## walk-over ItemPickup.gd. Uses TopDownPlayerController's interact() protocol (the
## "interactable" group) instead of body_entered, matching every other top-down world object.

@export var item_id: String = ""
@export var chest_id: String = ""
@export var amount: int = 1

var opened: bool = false

func _ready() -> void:
	add_to_group("interactable")
	collision_layer = 32
	collision_mask = 0

func interact(_player: Node) -> void:
	if opened:
		return
	if not InventoryManager.grant_item(item_id, amount):
		push_warning("ChestPickup: unknown item_id '%s'" % item_id)
		return
	opened = true
	AudioManager.play_sfx("pickup")
	VFXManager.play("pickup_spark", global_position)
	modulate = Color(0.6, 0.6, 0.6, 1.0)
