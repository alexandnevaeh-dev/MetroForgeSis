extends Area2D
## Generated NPCs open the dialogue overlay for branching conversation trees and shops for merchants.

@export var npc_id: String = ""
@export var npc_name: String = "Wanderer"
@export var role: String = "neutral"
@export var quest_ids: PackedStringArray = []
@export var shop_id: String = ""

var _player_in_range: bool = false
var _talk_opened_msec: int = -1000

@onready var name_label: Label = $NameLabel
@onready var prompt_label: Label = $PromptLabel
@onready var sprite: AnimatedSprite2D = $Sprite

func _ready() -> void:
	add_to_group("npcs")
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)
	name_label.text = npc_name
	name_label.visible = false
	prompt_label.visible = false

func _unhandled_input(event: InputEvent) -> void:
	if not _player_in_range or not event.is_action_pressed("interact"):
		return
	_try_talk()
	get_viewport().set_input_as_handled()

func _process(_delta: float) -> void:
	# action_press / gamepad both register here. _unhandled_input misses simulated presses.
	var overlay := _dialogue_overlay()
	var talking := false
	if overlay != null and overlay.has_method("is_active"):
		talking = bool(overlay.call("is_active"))
	if talking:
		prompt_label.visible = false
		name_label.visible = false
		_play_acting("talk")
		return
	if not _player_in_range:
		_play_acting("idle")
		return
	prompt_label.visible = true
	name_label.visible = true
	_play_acting("listen")
	if Input.is_action_just_pressed("interact"):
		_try_talk()


func _play_acting(anim: String) -> void:
	if sprite == null or sprite.sprite_frames == null:
		return
	if not sprite.sprite_frames.has_animation(anim):
		if anim == "listen" and sprite.sprite_frames.has_animation("idle"):
			anim = "idle"
		else:
			return
	if sprite.animation == anim and sprite.is_playing():
		return
	sprite.play(anim)

func _try_talk() -> void:
	if Time.get_ticks_msec() - _talk_opened_msec < 400:
		return
	var overlay := _dialogue_overlay()
	if overlay and overlay.has_method("is_active") and overlay.is_active():
		return
	_talk_opened_msec = Time.get_ticks_msec()
	prompt_label.visible = false
	name_label.visible = false
	_play_acting("talk")
	_begin_dialogue()

func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return
	_player_in_range = true
	name_label.visible = true
	prompt_label.visible = true
	_play_acting("listen")

func _on_body_exited(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return
	_player_in_range = false
	name_label.visible = false
	prompt_label.visible = false
	_play_acting("idle")

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
		var qid := DialogueManager.dialogue_id_for_quest(quest_ids[0])
		if not qid.is_empty() and DialogueManager.has_dialogue(qid):
			return qid
		var offer := "%s_offer" % quest_ids[0]
		if DialogueManager.has_dialogue(offer):
			return offer
	if role == "merchant" and not shop_id.is_empty():
		return "dlg_%s_greet" % npc_id
	if role == "lore":
		return "dlg_%s_lore" % npc_id
	var neutral := "dlg_%s_neutral" % npc_id
	if DialogueManager.has_dialogue(neutral):
		return neutral
	return ""

func _dialogue_overlay() -> Node:
	return get_tree().get_first_node_in_group("dialogue_overlay")
