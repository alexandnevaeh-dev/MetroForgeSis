extends Node
## Spawns short-lived sprite bursts for combat, ability, and boss-phase feedback.

const EFFECT_IDS := [
	"hit_spark",
	"death_puff",
	"dash_trail",
	"pickup_spark",
	"ability_unlock",
	"boss_phase_shift",
	"area_burst",
	"slam_shock",
]

var _textures: Dictionary = {}

func _ready() -> void:
	for effect_id in EFFECT_IDS:
		var path := "res://assets/vfx/%s.png" % effect_id
		if ResourceLoader.exists(path):
			_textures[effect_id] = load(path)
	EventBus.ability_acquired.connect(_on_ability_acquired)

func play(effect_id: String, global_position: Vector2, scale: float = 1.0) -> void:
	if not _textures.has(effect_id):
		return
	var host := get_tree().current_scene
	if host == null:
		return

	var sprite := Sprite2D.new()
	sprite.texture = _textures[effect_id]
	sprite.centered = true
	sprite.global_position = global_position
	sprite.scale = Vector2(scale, scale)
	sprite.z_index = 100
	host.add_child(sprite)

	var tween := create_tween()
	tween.tween_property(sprite, "scale", Vector2(scale * 1.5, scale * 1.5), 0.12)
	tween.parallel().tween_property(sprite, "modulate:a", 0.0, 0.2)
	tween.tween_callback(sprite.queue_free)

func play_ring(
	effect_id: String,
	global_position: Vector2,
	count: int = 8,
	radius: float = 48.0,
	scale: float = 1.0,
) -> void:
	for i in range(count):
		var angle := (TAU / float(count)) * float(i)
		var offset := Vector2(cos(angle), sin(angle)) * radius
		play(effect_id, global_position + offset, scale * 0.85)

func play_phase_shift(global_position: Vector2) -> void:
	play("boss_phase_shift", global_position, 2.0)
	play_ring("boss_phase_shift", global_position, 10, 56.0, 1.1)

func _on_ability_acquired(_ability_id: String) -> void:
	var player := get_tree().get_first_node_in_group("player")
	if player:
		play("ability_unlock", player.global_position, 1.3)
