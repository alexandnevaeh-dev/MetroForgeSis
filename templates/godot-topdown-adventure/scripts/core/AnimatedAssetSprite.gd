extends AnimatedSprite2D

@export var sheet_path: String = "assets/characters/player_walk.png"
@export var frame_size: Vector2i = Vector2i(32, 32)
@export var frame_count: int = 4
@export var fallback_color: Color = Color(0.35, 0.55, 0.95, 1)

## Optional additional named animations — each a horizontal frame-strip sheet at the same
## frame_size/frame_count as the primary sheet above. Empty string means "not generated for
## this asset". Player, enemies, and bosses all get walk/attack/hurt sheets from the
## asset pipeline. A non-empty path pointing at a file that doesn't exist on disk falls
## back to a solid-color placeholder with a warning, not a crash.
@export var attack_sheet_path: String = ""
@export var hurt_sheet_path: String = ""

func _ready() -> void:
	_build_frames()
	play("walk")

func _build_frames() -> void:
	var frames := SpriteFrames.new()
	frames.add_animation("idle")
	frames.add_animation("walk")

	_load_animation_frames(frames, "walk", sheet_path, true)

	if not attack_sheet_path.is_empty():
		frames.add_animation("attack")
		frames.set_animation_loop("attack", false)
		_load_animation_frames(frames, "attack", attack_sheet_path, false)

	if not hurt_sheet_path.is_empty():
		frames.add_animation("hurt")
		frames.set_animation_loop("hurt", false)
		_load_animation_frames(frames, "hurt", hurt_sheet_path, false)

	sprite_frames = frames
	centered = false
	offset = Vector2(frame_size.x / 2.0, frame_size.y)

## Loads a horizontal frame-strip sheet into the given animation. When `copy_to_idle` is
## true, this sheet's first frame is also used as the (currently single-frame) "idle"
## animation — used for the primary walk sheet, since a dedicated idle sheet isn't
## generated yet. Missing files get a solid-color placeholder frame and a warning instead
## of crashing the scene.
func _load_animation_frames(frames: SpriteFrames, anim: String, path: String, copy_to_idle: bool) -> void:
	var res_path := path if path.begins_with("res://") else "res://" + path
	if ResourceLoader.exists(res_path):
		var tex: Texture2D = load(res_path)
		for i in range(frame_count):
			var atlas := AtlasTexture.new()
			atlas.atlas = tex
			atlas.region = Rect2(i * frame_size.x, 0, frame_size.x, frame_size.y)
			frames.add_frame(anim, atlas, 1.0)
			if i == 0 and copy_to_idle:
				frames.add_frame("idle", atlas, 1.0)
		return

	push_warning("AnimatedAssetSprite: sheet not found for '%s': %s" % [anim, res_path])
	var img := Image.create(frame_size.x, frame_size.y, false, Image.FORMAT_RGBA8)
	img.fill(fallback_color)
	var fallback := ImageTexture.create_from_image(img)
	frames.add_frame(anim, fallback, 1.0)
	if copy_to_idle:
		frames.add_frame("idle", fallback, 1.0)
