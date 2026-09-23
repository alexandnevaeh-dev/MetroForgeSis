extends Area2D
## Currency, consumables, relics, charms, weapons, keys, quest items, upgrade materials,
## and collectibles all route through InventoryManager.grant_item().
##
## This scene existed, complete (collision, SFX, VFX, queue_free() on pickup) but was never once
## instantiated anywhere in this template — OverworldManager.gd now spawns it directly
## (_spawn_ambient_pickups()) for the two real icons the metroforge-research-facility pack ships.
## Real icon by item_id below; any other id keeps the original flat ColorRect + "Item" label
## rather than guessing at an icon that doesn't exist for it.

const HEALTH_ICON_PATH := "res://assets/generated/items/health_pickup.png"
const PROGRESSION_ICON_PATH := "res://assets/generated/items/progression_pickup.png"

@export var item_id: String = "scrap"
## Currency pickups use this stack size; equipment and keys always grant 1.
@export var amount: int = 1
var _claimed: bool = false

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	_apply_real_icon()

func _apply_real_icon() -> void:
	var icon_path := ""
	if item_id == "health_vial":
		icon_path = HEALTH_ICON_PATH
	elif item_id == "scrap":
		icon_path = PROGRESSION_ICON_PATH
	if icon_path.is_empty() or not ResourceLoader.exists(icon_path):
		return

	var placeholder := get_node_or_null("Sprite")
	if placeholder:
		placeholder.queue_free()
	var label := get_node_or_null("Label")
	if label:
		label.queue_free()

	var tex: Texture2D = load(icon_path)
	if tex == null:
		return
	var sprite := Sprite2D.new()
	sprite.name = "RealIconSprite"
	sprite.texture = tex
	sprite.centered = true
	sprite.offset = Vector2(0, -tex.get_height() / 2.0)
	add_child(sprite)

func _on_body_entered(body: Node2D) -> void:
	if _claimed or not body.is_in_group("player"):
		return

	# queue_free is deferred; claim before callbacks can re-enter inventory.
	_claimed = true
	if not InventoryManager.grant_item(item_id, amount):
		push_warning("ItemPickup: unknown item_id '%s'" % item_id)
		queue_free()
		return

	AudioManager.play_sfx("pickup")
	VFXManager.play("pickup_spark", global_position)
	queue_free()
