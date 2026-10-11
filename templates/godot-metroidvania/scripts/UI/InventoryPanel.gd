extends Control
## Existing equipment actions plus a scrollable view of collected item descriptions.

var _item_rows: Array = []
var _selected_item_id: String = ""
var _list: ItemList
var _details: RichTextLabel
var _focus_on_open := false

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_list = ItemList.new()
	_list.name = "OwnedItems"
	_list.focus_mode = Control.FOCUS_ALL
	_list.item_selected.connect(_on_item_selected)
	_list.gui_input.connect(_on_list_gui_input)
	_list.add_theme_font_size_override("font_size", 18)
	add_child(_list)
	_details = RichTextLabel.new()
	_details.name = "ItemDescription"
	_details.bbcode_enabled = false
	_details.scroll_active = true
	_details.add_theme_font_size_override("normal_font_size", 18)
	add_child(_details)
	resized.connect(_layout_content)
	visibility_changed.connect(_on_visibility_changed)
	if not EventBus.equipment_changed.is_connected(_on_equipment_changed):
		EventBus.equipment_changed.connect(_on_equipment_changed)
	if not EventBus.item_collected.is_connected(_on_item_collected):
		EventBus.item_collected.connect(_on_item_collected)
	_layout_content()
	_refresh_items()

func _layout_content() -> void:
	if _list == null or _details == null:
		return
	_list.position = Vector2(8, 148)
	_list.size = Vector2(maxf(1, size.x - 16), maxf(36, size.y - 300))
	_details.position = Vector2(8, maxf(192, size.y - 136))
	_details.size = Vector2(maxf(1, size.x - 16), 128)

func _on_visibility_changed() -> void:
	_refresh_items()
	_focus_on_open = is_visible_in_tree()

func _process(_delta: float) -> void:
	# Finish the opening button's mouse release before assigning list focus.
	if _focus_on_open and _list != null and is_visible_in_tree() and not Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		_list.grab_focus()
		_focus_on_open = false

func _on_equipment_changed(_slot: String, _item_id: String) -> void:
	_refresh_items()

func _on_item_collected(_item_id: String) -> void:
	_refresh_items()

func _refresh_items() -> void:
	if _list == null:
		return
	_item_rows.clear()
	_list.clear()
	for entry in InventoryManager.get_display_entries():
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		var id: String = String(entry.get("id", ""))
		_item_rows.append(id)
		var label := "%s x%d" % [entry.get("name", id), int(entry.get("count", 0))]
		if entry.get("equipped", false):
			label += " [equipped]"
		_list.add_item(label)
	var selected := _item_rows.find(_selected_item_id)
	if selected < 0 and not _item_rows.is_empty():
		selected = 0
		_selected_item_id = String(_item_rows[0])
	if selected >= 0:
		_list.select(selected)
		_list.ensure_current_is_visible()
	else:
		_selected_item_id = ""
	_update_description()
	queue_redraw()

func _on_item_selected(index: int) -> void:
	if index < 0 or index >= _item_rows.size():
		return
	_selected_item_id = String(_item_rows[index])
	_update_description()

func _on_item_activated(index: int) -> void:
	if index < 0 or index >= _item_rows.size():
		return
	var item_id: String = String(_item_rows[index])
	if InventoryManager.is_equippable(item_id):
		InventoryManager.toggle_equip(item_id)

func _on_list_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_on_item_activated(_list.get_item_at_position(event.position, true))
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode in [KEY_HOME, KEY_END] and _list.item_count > 0:
			var index := 0 if event.keycode == KEY_HOME else _list.item_count - 1
			_list.select(index)
			_on_item_selected(index)
			_list.ensure_current_is_visible()
			_list.accept_event()
		elif event.keycode in [KEY_ENTER, KEY_KP_ENTER]:
			var selected := _list.get_selected_items()
			if not selected.is_empty():
				_on_item_activated(selected[0])
			_list.accept_event()

func _update_description() -> void:
	if _details == null:
		return
	if _selected_item_id.is_empty():
		_details.text = "No items yet. Collected records can be read here."
		return
	var definition: Dictionary = InventoryManager.get_item_definition(_selected_item_id)
	_details.text = "%s · %s\n%s" % [definition.get("name", _selected_item_id), definition.get("category", "item"), definition.get("description", "No description recorded.")]
	_details.scroll_to_line(0)

func _gui_input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT):
		return
	var y: float = event.position.y
	for slot in [["weapon", 40.0], ["charm", 66.0], ["armor", 92.0]]:
		if y >= float(slot[1]) and y < float(slot[1]) + 26.0:
			InventoryManager.unequip_slot(String(slot[0]))
			accept_event()
			return

func _draw() -> void:
	var font := ThemeDB.fallback_font
	var width := maxf(1, size.x - 16)
	draw_string(font, Vector2(8, 24), "Loadout · click equipment to equip", HORIZONTAL_ALIGNMENT_LEFT, width, 17)
	draw_string(font, Vector2(8, 52), "Weapon: %s" % _slot_label("weapon"), HORIZONTAL_ALIGNMENT_LEFT, width, 18)
	draw_string(font, Vector2(8, 78), "Charm: %s" % _slot_label("charm"), HORIZONTAL_ALIGNMENT_LEFT, width, 18)
	draw_string(font, Vector2(8, 104), "Armor: %s" % _slot_label("armor"), HORIZONTAL_ALIGNMENT_LEFT, width, 18)
	draw_string(font, Vector2(8, 134), "Items · select to read", HORIZONTAL_ALIGNMENT_LEFT, width, 17)

func _slot_label(slot: String) -> String:
	var item_id := InventoryManager.get_equipped(slot)
	if item_id.is_empty():
		return "(empty)"
	var definition: Dictionary = InventoryManager.get_item_definition(item_id)
	return "%s  [click to unequip]" % definition.get("name", item_id)
