extends CanvasLayer
## Merchant shop UI — opened by NPC.gd for role == merchant.

@onready var title_label: Label = $Panel/VBox/TitleLabel
@onready var scrap_label: Label = $Panel/VBox/ScrapLabel
@onready var items_box: VBoxContainer = $Panel/VBox/ItemsBox
@onready var message_label: Label = $Panel/VBox/MessageLabel

var _shop_id: String = ""
var _paused_for_shop: bool = false

func _ready() -> void:
	add_to_group("shop_overlay")
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	$Panel/VBox/CloseButton.pressed.connect(close_shop)

func _unhandled_input(event: InputEvent) -> void:
	if visible and event.is_action_pressed("pause"):
		close_shop()
		get_viewport().set_input_as_handled()

func open_shop(shop_id: String) -> void:
	var shop: Dictionary = ShopManager.get_shop(shop_id)
	if shop.is_empty():
		return
	_shop_id = shop_id
	title_label.text = shop.get("name", "Shop")
	message_label.text = ""
	_refresh_items(shop)
	_paused_for_shop = not get_tree().paused
	if _paused_for_shop:
		get_tree().paused = true
	visible = true
	EventBus.object_interacted.emit(shop_id)

func close_shop() -> void:
	visible = false
	_shop_id = ""
	if _paused_for_shop:
		get_tree().paused = false
	_paused_for_shop = false

func _refresh_items(shop: Dictionary) -> void:
	for child in items_box.get_children():
		child.queue_free()

	var currency_id: String = shop.get("currencyId", "scrap")
	scrap_label.text = "%s: %d" % [currency_id.capitalize(), ShopManager.get_currency_amount(currency_id)]

	for entry in shop.get("entries", []):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var item_id: String = entry.get("itemId", "")
		var price := int(entry.get("price", 0))
		var def: Dictionary = InventoryManager.get_item_definition(item_id)
		var item_name: String = def.get("name", item_id)

		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = "%s — %d %s" % [item_name, price, currency_id]
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(label)

		var buy_button := Button.new()
		buy_button.text = "Buy"
		buy_button.pressed.connect(_on_buy_pressed.bind(item_id))
		row.add_child(buy_button)
		items_box.add_child(row)

func _on_buy_pressed(item_id: String) -> void:
	var result: Dictionary = ShopManager.purchase(_shop_id, item_id)
	message_label.text = result.get("message", "")
	_refresh_items(ShopManager.get_shop(_shop_id))
