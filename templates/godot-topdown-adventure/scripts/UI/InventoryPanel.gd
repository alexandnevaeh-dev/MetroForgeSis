extends Control
## Pause-menu inventory: lists owned items and lets the player equip/unequip weapons, armor and charms.

const ROW_HEIGHT := 18.0
const LIST_START_Y := 106.0

var _item_rows: Array = []
var _selected_item_id := ""
var _scroll_row := 0

func _visible_rows() -> int:
	return maxi(1,int((size.y - LIST_START_Y - 98)/ROW_HEIGHT))

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	if not EventBus.equipment_changed.is_connected(_on_equipment_changed):
		EventBus.equipment_changed.connect(_on_equipment_changed)
	if not EventBus.item_collected.is_connected(_on_item_collected):
		EventBus.item_collected.connect(_on_item_collected)
	queue_redraw()

func _on_equipment_changed(_slot: String, _item_id: String) -> void:
	queue_redraw()

func _on_item_collected(_item_id: String) -> void:
	queue_redraw()

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]:
		_scroll_row = clampi(_scroll_row + (1 if event.button_index == MOUSE_BUTTON_WHEEL_DOWN else -1),0,maxi(0,_item_rows.size()-_visible_rows()))
		queue_redraw()
		accept_event()
		return
	if not (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT):
		return
	_rebuild_item_rows()
	var y: float = event.position.y
	if y >= 34.0 and y < 52.0:
		InventoryManager.unequip_slot("weapon")
		accept_event()
		return
	if y >= 52.0 and y < 70.0:
		InventoryManager.unequip_slot("charm")
		accept_event()
		return
	if y >= 70.0 and y < 88.0:
		InventoryManager.unequip_slot("armor")
		accept_event()
		return
	for i in range(_scroll_row,mini(_item_rows.size(),_scroll_row+_visible_rows())):
		var top := LIST_START_Y + (i-_scroll_row) * ROW_HEIGHT - 14
		if y >= top and y < top + ROW_HEIGHT:
			var item_id: String = _item_rows[i]
			_selected_item_id = item_id
			queue_redraw()
			if InventoryManager.is_equippable(item_id):
				InventoryManager.toggle_equip(item_id)
			accept_event()
			return

func _rebuild_item_rows() -> void:
	_item_rows.clear()
	for entry in InventoryManager.get_display_entries():
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		_item_rows.append(String(entry.get("id", "")))

func _draw() -> void:
	_rebuild_item_rows()
	var font := ThemeDB.fallback_font
	draw_string(font, Vector2(8, 16), "Click equipment to equip, or an item to read", HORIZONTAL_ALIGNMENT_LEFT, size.x-16, 13)
	draw_string(font, Vector2(8, 34), "Weapon: %s" % _slot_label("weapon"), HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
	draw_string(font, Vector2(8, 52), "Charm: %s" % _slot_label("charm"), HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
	draw_string(font, Vector2(8, 70), "Armor: %s" % _slot_label("armor"), HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
	draw_string(font, Vector2(8, 88), "Items", HORIZONTAL_ALIGNMENT_LEFT, -1, 13)

	var entries: Array = InventoryManager.get_display_entries()
	if entries.is_empty():
		draw_string(font, Vector2(8, LIST_START_Y), "No items yet", HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
		return

	_scroll_row = clampi(_scroll_row,0,maxi(0,entries.size()-_visible_rows()))
	var y := LIST_START_Y
	for entry in entries.slice(_scroll_row,_scroll_row+_visible_rows()):
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var name: String = entry.get("name", entry.get("id", "?"))
		var count: int = int(entry.get("count", 0))
		var category: String = entry.get("category", "")
		var line := "%s x%d" % [name, count]
		if not category.is_empty():
			line += " (%s)" % category
		if entry.get("equipped", false):
			line += " [equipped]"
		draw_string(font, Vector2(8, y), line, HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
		y += ROW_HEIGHT
	if entries.size()>_visible_rows():
		draw_string(font,Vector2(8,size.y-86),"Scroll items (%d-%d of %d)" % [_scroll_row+1,mini(entries.size(),_scroll_row+_visible_rows()),entries.size()],HORIZONTAL_ALIGNMENT_LEFT,size.x-16,12)
	if not _selected_item_id.is_empty():
		var definition := InventoryManager.get_item_definition(_selected_item_id)
		draw_multiline_string(font,Vector2(8,size.y-66),String(definition.get("description","")),HORIZONTAL_ALIGNMENT_LEFT,maxf(100,size.x-16),13,4,Color("dae2b5"))

func _slot_label(slot: String) -> String:
	var item_id := InventoryManager.get_equipped(slot)
	if item_id.is_empty():
		return "(empty)"
	var def: Dictionary = InventoryManager.get_item_definition(item_id)
	return "%s  [click to unequip]" % def.get("name", item_id)
