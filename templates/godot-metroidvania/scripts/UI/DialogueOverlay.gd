extends CanvasLayer
## Branching dialogue UI — choice buttons, portraits, and quest actions from generated JSON.

signal dialogue_finished(context: Dictionary)

@onready var portrait: ColorRect = $Panel/HBox/Portrait
@onready var speaker_label: Label = $Panel/HBox/Content/SpeakerLabel
@onready var text_label: Label = $Panel/HBox/Content/TextLabel
@onready var choices_box: VBoxContainer = $Panel/HBox/Content/ChoicesBox
@onready var continue_button: Button = $Panel/HBox/Content/ContinueButton

var _dialogue_id: String = ""
var _line_index: int = 0
var _speaker_name: String = ""
var _context: Dictionary = {}
var _paused_for_dialogue: bool = false

const PORTRAIT_COLORS := {
	"merchant": Color(0.92, 0.72, 0.2),
	"lore": Color(0.65, 0.45, 0.85),
	"quest_giver": Color(0.35, 0.75, 0.55),
	"neutral": Color(0.75, 0.6, 0.45),
	"player": Color(0.37, 0.64, 0.98),
}

func _ready() -> void:
	add_to_group("dialogue_overlay")
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	continue_button.pressed.connect(_on_continue_pressed)

func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
	if event.is_action_pressed("interact") and continue_button.visible:
		_on_continue_pressed()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("pause"):
		close_dialogue()
		get_viewport().set_input_as_handled()

func start_dialogue(dialogue_id: String, speaker_name: String, context: Dictionary = {}) -> void:
	if not DialogueManager.has_dialogue(dialogue_id):
		return
	_dialogue_id = dialogue_id
	_line_index = 0
	_speaker_name = speaker_name
	_context = context.duplicate()
	_paused_for_dialogue = not get_tree().paused
	if _paused_for_dialogue:
		get_tree().paused = true
	visible = true
	_show_current_line()

func close_dialogue() -> void:
	if not visible:
		return
	visible = false
	_dialogue_id = ""
	_line_index = 0
	_clear_choices()
	if _paused_for_dialogue:
		get_tree().paused = false
	_paused_for_dialogue = false
	dialogue_finished.emit(_context)

func is_active() -> bool:
	return visible

func _show_current_line() -> void:
	_clear_choices()
	if _dialogue_id.is_empty():
		close_dialogue()
		return

	var line: Dictionary = DialogueManager.get_line_data(_dialogue_id, _line_index)
	if line.is_empty():
		close_dialogue()
		return

	var speaker: String = line.get("speaker", _speaker_name)
	if speaker.is_empty():
		speaker = _speaker_name
	speaker_label.text = speaker
	text_label.text = line.get("text", "")
	_apply_portrait(line.get("portrait", _context.get("role", "neutral")))
	var voice_path: String = line.get("voicePath", "")
	if voice_path.is_empty():
		voice_path = line.get("voice_path", "")
	if not voice_path.is_empty():
		AudioManager.play_dialogue_voice(voice_path)

	var choices: Array = line.get("choices", [])
	if choices.size() > 0:
		continue_button.visible = false
		for choice in choices:
			if typeof(choice) != TYPE_DICTIONARY:
				continue
			var button := Button.new()
			button.text = choice.get("text", "...")
			button.pressed.connect(_on_choice_pressed.bind(choice))
			choices_box.add_child(button)
	else:
		continue_button.visible = true

func _on_continue_pressed() -> void:
	_line_index += 1
	if _line_index >= DialogueManager.get_line_count(_dialogue_id):
		_finish_linear_dialogue()
		return
	_show_current_line()

func _on_choice_pressed(choice: Dictionary) -> void:
	var choice_id: String = choice.get("id", "")
	if not choice_id.is_empty():
		EventBus.dialogue_choice_made.emit(choice_id)

	var action: String = choice.get("action", "")
	if action == "accept_quest":
		var quest_id: String = _context.get("quest_id", "")
		if not quest_id.is_empty() and QuestManager.is_quest_available(quest_id):
			QuestManager.accept_quest(quest_id)
	elif action == "open_shop":
		var shop_id: String = _context.get("shop_id", "")
		close_dialogue()
		if not shop_id.is_empty():
			var shop_overlay := get_tree().get_first_node_in_group("shop_overlay")
			if shop_overlay:
				shop_overlay.open_shop(shop_id)
		return

	var next_id: String = choice.get("nextDialogueId", "")
	if not next_id.is_empty() and DialogueManager.has_dialogue(next_id):
		_dialogue_id = next_id
		_line_index = 0
		_show_current_line()
		return

	close_dialogue()

func _finish_linear_dialogue() -> void:
	if _context.get("role", "") == "quest_giver":
		var quest_id: String = _context.get("quest_id", "")
		if not quest_id.is_empty() and _dialogue_id.ends_with("_offer"):
			if QuestManager.is_quest_available(quest_id):
				QuestManager.accept_quest(quest_id)
	close_dialogue()

func _clear_choices() -> void:
	for child in choices_box.get_children():
		child.queue_free()

func _apply_portrait(portrait_key: String) -> void:
	portrait.color = PORTRAIT_COLORS.get(portrait_key, PORTRAIT_COLORS["neutral"])
