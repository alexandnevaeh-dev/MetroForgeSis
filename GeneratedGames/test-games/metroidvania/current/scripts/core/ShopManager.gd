extends Node
## Shop purchases using QuestManager currency and InventoryManager item tracking.

const SHOPS_PATH := "res://data/shops/shops.json"

var _shops_by_id: Dictionary = {}

func _ready() -> void:
	_load_shops()

func _load_shops() -> void:
	if not FileAccess.file_exists(SHOPS_PATH):
		return
	var file := FileAccess.open(SHOPS_PATH, FileAccess.READ)
	if file == null:
		return
	var text := file.get_as_text()
	file.close()

	var json := JSON.new()
	if json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		return

	for shop in json.data.get("shops", []):
		if typeof(shop) != TYPE_DICTIONARY:
			continue
		var shop_id: String = shop.get("id", "")
		if shop_id.is_empty():
			continue
		_shops_by_id[shop_id] = shop

func get_shop(shop_id: String) -> Dictionary:
	return _shops_by_id.get(shop_id, {})

func get_currency_amount(currency_id: String) -> int:
	return int(QuestManager.currency.get(currency_id, 0))

func purchase(shop_id: String, item_id: String) -> Dictionary:
	var shop: Dictionary = get_shop(shop_id)
	if shop.is_empty():
		return {"success": false, "message": "Unknown shop"}

	var currency_id: String = shop.get("currencyId", "scrap")
	var entry: Dictionary = {}
	for candidate in shop.get("entries", []):
		if candidate.get("itemId", "") == item_id:
			entry = candidate
			break
	if entry.is_empty():
		return {"success": false, "message": "Item not sold here"}

	var price := int(entry.get("price", 0))
	var balance := get_currency_amount(currency_id)
	if balance < price:
		return {"success": false, "message": "Not enough %s" % currency_id}

	QuestManager.currency[currency_id] = balance - price
	InventoryManager.grant_item(item_id, 1)
	AudioManager.play_sfx("pickup")
	return {"success": true, "message": "Purchased %s" % item_id}
