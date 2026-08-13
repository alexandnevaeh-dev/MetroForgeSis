extends Area2D
## Currency, consumables, relics, charms, weapons, keys, quest items, upgrade materials,
## and collectibles all route through InventoryManager.grant_item().

@export var item_id: String = "scrap"
## Currency pickups use this stack size; equipment and keys always grant 1.
@export var amount: int = 1

func _ready() -> void:
	body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return

	if not InventoryManager.grant_item(item_id, amount):
		push_warning("ItemPickup: unknown item_id '%s'" % item_id)
		queue_free()
		return

	AudioManager.play_sfx("pickup")
	VFXManager.play("pickup_spark", global_position)
	queue_free()
