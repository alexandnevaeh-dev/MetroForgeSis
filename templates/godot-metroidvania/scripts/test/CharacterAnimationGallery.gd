extends Node2D

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")

const ACTORS := [
	{"label": "Player", "scene": "res://scenes/player/Player.tscn", "position": Vector2(180, 440)},
	{"label": "Security Walker", "scene": "res://scenes/enemies/Enemy.tscn", "position": Vector2(440, 440)},
	{"label": "Sentry Drone", "scene": "res://scenes/enemies/Enemy.tscn", "position": Vector2(700, 360)},
	{"label": "Heavy Charger", "scene": "res://scenes/enemies/Enemy.tscn", "position": Vector2(960, 440)},
	{"label": "Transit Warden", "scene": "res://scenes/bosses/Boss.tscn", "position": Vector2(1260, 430)},
	{"label": "Transit Survivor", "scene": "res://scenes/world/NPC.tscn", "position": Vector2(1600, 440)},
]

var _sprites: Array[AnimatedSprite2D] = []
var _clip_index := 0
@onready var _status: Label = $CanvasLayer/Status

func _ready() -> void:
	for spec in ACTORS:
		var scene := load(spec.scene) as PackedScene
		if scene == null:
			continue
		var actor := scene.instantiate() as Node2D
		add_child(actor)
		actor.global_position = spec.position
		actor.scale = Vector2(3.0, 3.0)
		actor.set_physics_process(false)
		var camera := actor.get_node_or_null("Camera2D") as Camera2D
		if camera:
			camera.enabled = false
		var sprite := actor.get_node_or_null("Sprite") as AnimatedSprite2D
		if sprite:
			_sprites.append(sprite)
		var caption := Label.new()
		caption.text = String(spec.label)
		caption.position = spec.position + Vector2(-70, 180)
		caption.size = Vector2(160, 30)
		caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		add_child(caption)
	_show_clip()
	if OS.get_environment("METROFORGE_GALLERY_CAPTURE") == "1":
		if CaptureGuard.refuse_if_visual_unsupported():
			get_tree().quit(CaptureGuard.EXIT_DUMMY)
			return
		if not await CaptureGuard.await_frames(self, 8, 2.0):
			get_tree().quit(CaptureGuard.EXIT_TIMEOUT)
			return
		var image := get_viewport().get_texture().get_image()
		if image and not image.is_empty():
			image.save_png(ProjectSettings.globalize_path("res://qa/character-animation-gallery.png"))
		get_tree().quit()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_right"):
		_clip_index += 1
		_show_clip()
	elif event.is_action_pressed("ui_left"):
		_clip_index -= 1
		_show_clip()

func _show_clip() -> void:
	var names: Array[String] = []
	for sprite in _sprites:
		if sprite.sprite_frames:
			for clip_name in sprite.sprite_frames.get_animation_names():
				if not names.has(String(clip_name)):
					names.append(String(clip_name))
	names.sort()
	if names.is_empty():
		_status.text = "No character clips loaded"
		return
	_clip_index = posmod(_clip_index, names.size())
	var clip := names[_clip_index]
	for sprite in _sprites:
		if sprite.sprite_frames and sprite.sprite_frames.has_animation(clip):
			sprite.play(clip)
	var provider := "external industrial-transit pack" if FileAccess.file_exists("res://assets/characters/player_animations.json") else "generated asset pipeline"
	_status.text = "%s | provider: %s" % [clip, provider]