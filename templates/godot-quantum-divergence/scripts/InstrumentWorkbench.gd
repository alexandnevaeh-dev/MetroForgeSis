extends CanvasLayer
## Native keyboard/mouse workbench. The station controller owns admission and application.
const Program = preload("res://scripts/InstrumentProgram.gd")
var world
var controller
var panel: PanelContainer
var instrument_choice: OptionButton
var choices: Dictionary = {}
var preview: Label
var feedback: Label
var apply_button: Button
var close_button: Button
var drafts: Dictionary = {}
var instrument: String = "photon"
var opened: bool = false
var opening_tick: int = -1
var applied: int = 0

func _init(owner_world, programming_controller) -> void:
	world = owner_world
	controller = programming_controller
	layer = 100
	process_mode = Node.PROCESS_MODE_ALWAYS

func _box(color: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(1)
	style.set_content_margin_all(10)
	return style

func _ready() -> void:
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	panel = PanelContainer.new()
	panel.position = Vector2(90,96)
	panel.size = Vector2(780,424)
	panel.add_theme_stylebox_override("panel",_box(Color("101e2c"),Color("52857e")))
	panel.add_theme_color_override("font_color",Color("d7e9ec"))
	panel.add_theme_font_size_override("font_size",14)
	root.add_child(panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",10)
	panel.add_child(column)
	var title := Label.new()
	title.text = "STABILIZER  /  INSTRUMENT WORKBENCH"
	title.add_theme_font_size_override("font_size",20)
	title.add_theme_color_override("font_color",Color("92e1d1"))
	column.add_child(title)
	var subtitle := Label.new()
	subtitle.text = "Compile a different behavior. Time is paused while the station is open."
	subtitle.add_theme_color_override("font_color",Color("a4bac7"))
	column.add_child(subtitle)
	instrument_choice = OptionButton.new()
	instrument_choice.add_item("Instrument 1  /  Photon slot")
	instrument_choice.add_item("Instrument 2  /  Tachyon slot")
	instrument_choice.item_selected.connect(_switch_instrument)
	column.add_child(instrument_choice)
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation",24)
	column.add_child(body)
	var slots := VBoxContainer.new()
	slots.custom_minimum_size.x = 290
	body.add_child(slots)
	for slot in ["waveform","operator","state","trigger"]:
		var row := HBoxContainer.new()
		var label := Label.new()
		label.text = slot.capitalize()
		label.custom_minimum_size.x = 92
		row.add_child(label)
		var choice := OptionButton.new()
		choice.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		choice.custom_minimum_size.y = 34
		choice.tooltip_text = "Choose the "+slot+" module; the behavior preview explains compatibility."
		for option in Program.OPTIONS[slot]: choice.add_item(Program.LABELS[option])
		choice.item_selected.connect(func(_index): _refresh_preview())
		choices[slot] = choice
		row.add_child(choice)
		slots.add_child(row)
	preview = Label.new()
	preview.custom_minimum_size = Vector2(390,178)
	preview.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	preview.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_child(preview)
	feedback = Label.new()
	feedback.custom_minimum_size.y = 24
	feedback.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(feedback)
	var actions := HBoxContainer.new()
	apply_button = Button.new()
	apply_button.text = "Apply to instrument"
	apply_button.custom_minimum_size = Vector2(210,36)
	apply_button.pressed.connect(_apply)
	actions.add_child(apply_button)
	close_button = Button.new()
	close_button.text = "Close  /  Esc"
	close_button.custom_minimum_size = Vector2(160,36)
	close_button.pressed.connect(close)
	actions.add_child(close_button)
	column.add_child(actions)
	var footer := Label.new()
	footer.text = "Tab moves between controls • Arrow keys select modules • Changes last for this run"
	footer.add_theme_color_override("font_color",Color("819cab"))
	footer.add_theme_font_size_override("font_size",12)
	column.add_child(footer)
	panel.hide()

func _recipe() -> Dictionary:
	var recipe: Dictionary = {}
	for slot in choices: recipe[slot] = Program.OPTIONS[slot][choices[slot].selected]
	return recipe

func _load_recipe(recipe: Dictionary) -> void:
	for slot in choices: choices[slot].select(Program.OPTIONS[slot].find(recipe[slot]))
	_refresh_preview()

func _switch_instrument(index: int) -> void:
	drafts[instrument] = _recipe()
	instrument = "photon" if index == 0 else "tachyon"
	_load_recipe(drafts[instrument])

func _refresh_preview() -> void:
	var recipe: Dictionary = _recipe()
	drafts[instrument] = recipe
	var compiled: Dictionary = controller.preview(recipe)
	apply_button.disabled = not compiled.accepted
	if not compiled.accepted:
		preview.text = "CANNOT COMPILE\n\n"+compiled.reason
		preview.add_theme_color_override("font_color",Color("e6b37f"))
		return
	var stats: Dictionary = compiled.definition
	preview.text = "%s\n\n%d energy  /  %s damage\n%.2fs windup  /  %.2fs cycle\n%.2fs life  /  640px range  /  %d reserved slots\n\n%s" % [compiled.label,stats.cost,stats.damage,stats.windup/60.0,stats.cooldown/60.0,stats.life/60.0,stats.slots,compiled.behavior]
	preview.add_theme_color_override("font_color",Color("d7e9ec"))
	feedback.text = ""

func open() -> Dictionary:
	var safe: Dictionary = controller.admission()
	if not safe.accepted:
		world.notice = safe.reason
		return safe
	drafts = world.instruments.programs.duplicate(true)
	instrument = world.selected
	instrument_choice.select(0 if instrument == "photon" else 1)
	_load_recipe(drafts[instrument])
	opening_tick = world.simulation_tick
	opened = true
	world._clear_game_requests()
	world.get_tree().paused = true
	panel.show()
	instrument_choice.grab_focus()
	world.queue_redraw()
	return {"accepted":true}

func _apply() -> void:
	var result: Dictionary = controller.apply(instrument,_recipe())
	if not result.accepted:
		feedback.text = result.reason
		return
	applied += 1
	feedback.text = "Compiled and applied. Energy and active shots are unchanged."
	feedback.add_theme_color_override("font_color",Color("92e1d1"))

func close() -> void:
	if not opened: return
	opened = false
	panel.hide()
	world._clear_game_requests()
	world.programming_release_guard = true
	world.get_tree().paused = false
	world.queue_redraw()

func _unhandled_key_input(event: InputEvent) -> void:
	if opened and event is InputEventKey and event.pressed and event.physical_keycode == KEY_ESCAPE:
		close()
		get_viewport().set_input_as_handled()
