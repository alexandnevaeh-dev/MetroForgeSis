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
	# Real, generic ground danger-zone ring (e.g. metroforge-research-facility's
	# assets/vfx/attack_warning.png) — a boss's telegraph was previously body-tint-only
	# (BossController._set_telegraph_visual()'s red modulate); this gives a second, spatial
	# "where" signal distinct from the "that" signal the tint already provided.
	"attack_warning",
	# Real ranged-projectile streak texture (Projectile.gd swaps its own placeholder for this
	# directly by path already; registered here too so VFXManager.play("ranged_projectile", ...)
	# also works for any caller that wants a one-shot muzzle-flash rather than the live projectile).
	"ranged_projectile",
]

var _textures: Dictionary = {}
var _animations: Dictionary = {}

func _ready() -> void:
	for effect_id in EFFECT_IDS:
		var path := "res://assets/vfx/%s.png" % effect_id
		if ResourceLoader.exists(path):
			_textures[effect_id] = load(path)
	var metadata_path := "res://assets/vfx/effects.json"
	if FileAccess.file_exists(metadata_path):
		var metadata: Variant = JSON.parse_string(FileAccess.get_file_as_string(metadata_path))
		if metadata is Dictionary:
			for effect_id in metadata:
				if not _textures.has(effect_id) or not metadata[effect_id] is Dictionary:
					continue
				var spec: Dictionary = metadata[effect_id]
				var count: int = int(spec.get("frameCount", 0))
				var width: int = int(spec.get("frameWidth", 0))
				var height: int = int(spec.get("frameHeight", 0))
				var fps: float = float(spec.get("fps", 0))
				var texture: Texture2D = _textures[effect_id]
				if count < 2 or count > 32 or width < 1 or height < 1 or fps <= 0 or fps > 60:
					continue
				if texture.get_width() != count * width or texture.get_height() != height:
					continue
				var frames := SpriteFrames.new()
				frames.add_animation("burst")
				frames.set_animation_loop("burst", false)
				frames.set_animation_speed("burst", fps)
				for frame in range(count):
					var region := AtlasTexture.new()
					region.atlas = texture
					region.region = Rect2(frame * width, 0, width, height)
					frames.add_frame("burst", region)
				_animations[effect_id] = frames
	EventBus.ability_acquired.connect(_on_ability_acquired)

func play(effect_id: String, global_position: Vector2, scale: float = 1.0) -> void:
	if not _textures.has(effect_id):
		return
	var host := get_tree().current_scene
	if host == null:
		return
	if _animations.has(effect_id):
		var effect := AnimatedSprite2D.new()
		effect.sprite_frames = _animations[effect_id]
		effect.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		effect.z_index = 100
		effect.scale = Vector2(scale, scale)
		effect.set_meta("effect_id", effect_id)
		host.add_child(effect)
		effect.global_position = global_position
		effect.animation_finished.connect(effect.queue_free)
		effect.play("burst")
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

## Resolve ActorSockets.global_socket on `actor` (or its Sockets child) then play.
func play_at_socket(
	actor: Node,
	socket_id: String,
	effect_id: String,
	scale: float = 1.0,
	fallback_offset: Vector2 = Vector2.ZERO,
) -> void:
	var origin := Vector2.ZERO
	if actor is Node2D:
		origin = (actor as Node2D).global_position
	var pos := origin + fallback_offset
	var sockets := _resolve_sockets(actor)
	if sockets != null and sockets.has_method("global_socket"):
		pos = sockets.call("global_socket", socket_id, pos)
	play(effect_id, pos, scale)

func _resolve_sockets(actor: Node) -> Node:
	if actor == null:
		return null
	if actor.has_method("global_socket") and actor.has_method("set_facing"):
		return actor
	var child := actor.get_node_or_null("Sockets")
	if child:
		return child
	return null

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
