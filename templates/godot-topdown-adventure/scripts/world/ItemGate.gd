class_name ItemGate
extends StaticBody2D
## A solid overworld barrier that opens permanently once interacted with while the player owns
## the required item (InventoryManager — a real per-run inventory item, not GameManager's
## ability set). Interact-based like every other top-down world object, and removes itself once
## opened rather than re-checking every frame, since opening a gate is a one-way action.

@export var item_id: String = ""

func _ready() -> void:
	add_to_group("interactable")
	collision_layer = 1
	collision_mask = 0

func interact(_player: Node) -> void:
	if item_id != "" and InventoryManager.get_owned_count(item_id) <= 0:
		return
	AudioManager.play_sfx("pickup")
	queue_free()
