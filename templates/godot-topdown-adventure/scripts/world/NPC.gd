extends Area2D
## Generated NPCs open the dialogue overlay for branching conversation trees and shops for merchants.

@export var npc_id: String = ""
@export var npc_name: String = "Wanderer"
@export var role: String = "neutral"
@export var quest_ids: PackedStringArray = []
@export var shop_id: String = ""

var _player_in_range: bool = false

@onready var name_label: Label = $NameLabel
@onready var prompt_label: Label = $PromptLabel

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)
	name_label.text = npc_name
	prompt_label.visible = false

func _unhandled_input(event: InputEvent) -> void:
	if not _player_in_range or not event.is_action_pressed("interact"):
		return
	var overlay := _dialogue_overlay()
	if overlay and overlay.is_active():
		return
	_begin_dialogue()
	get_viewport().set_input_as_handled()

func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return
	_player_in_range = true
	prompt_label.visible = true

func _on_body_exited(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return
	_player_in_range = false
	prompt_label.visible = false

func _begin_dialogue() -> void:
	AudioManager.play_sfx("ui_click")
	EventBus.npc_talked.emit(npc_id)
	var dialogue_id := _resolve_dialogue_id()
	var overlay := _dialogue_overlay()
	if dialogue_id.is_empty() or overlay == null:
		return
	var context := {
		"npc_id": npc_id,
		"role": role,
		"quest_id": quest_ids[0] if not quest_ids.is_empty() else "",
		"shop_id": shop_id,
	}
	overlay.start_dialogue(dialogue_id, npc_name, context)

func _resolve_dialogue_id() -> String:
	if role == "quest_giver" and not quest_ids.is_empty():
		return DialogueManager.dialogue_id_for_quest(quest_ids[0])
	if role == "merchant" and not shop_id.is_empty():
		return "dlg_%s_greet" % npc_id
	if role == "lore":
		return "dlg_%s_lore" % npc_id
	return "dlg_%s_neutral" % npc_id

func _dialogue_overlay() -> Node:
	return get_tree().get_first_node_in_group("dialogue_overlay")
