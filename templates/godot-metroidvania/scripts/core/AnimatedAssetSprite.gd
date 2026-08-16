extends AnimatedSprite2D

@export var sheet_path: String = "assets/characters/player_walk.png"
@export var frame_size: Vector2i = Vector2i(64, 64)
@export var frame_count: int = 4
@export var fallback_color: Color = Color(0.35, 0.55, 0.95, 1)

## Optional additional named animations — each a horizontal frame-strip sheet at the same
## frame_size/frame_count as the primary sheet above. Empty string means "not generated for
## this asset". Player, enemies, and bosses all get walk/attack/hurt sheets from the
## asset pipeline. A non-empty path pointing at a file that doesn't exist on disk falls
## back to a solid-color placeholder with a warning, not a crash.
@export var attack_sheet_path: String = ""
@export var hurt_sheet_path: String = ""
@export var death_sheet_path: String = ""

static var _clean_cache: Dictionary = {}

func _ready() -> void:
	_build_frames()
	_apply_contact_filter()
	play("idle")

func _apply_contact_filter() -> void:
	## Palette red/cream/magenta still composites at the feet after knockout.
	## Filter only the contact band so hats and weapon glow stay.
	if not ResourceLoader.exists("res://scripts/shaders/sprite_foot_clean.gdshader"):
		return
	var shader: Shader = load("res://scripts/shaders/sprite_foot_clean.gdshader")
	if shader == null:
		return
	var mat := ShaderMaterial.new()
	mat.shader = shader
	material = mat

## NVIDIA contact leftovers survive import as palette red/cream even when the
## authored PNG samples clean. Punch the contact band on a runtime Image so
## the compositor cannot draw those tokens under the feet.
func _clean_contact_texture(tex: Texture2D) -> Texture2D:
	if tex == null:
		return tex
	var key := tex.resource_path
	if key == "" or key == null:
		key = str(tex.get_rid())
	if _clean_cache.has(key):
		return _clean_cache[key]
	var img := tex.get_image()
	if img == null:
		_clean_cache[key] = tex
		return tex
	if img.is_compressed():
		if img.decompress() != OK:
			_clean_cache[key] = tex
			return tex
	img.convert(Image.FORMAT_RGBA8)
	var w := img.get_width()
	var h := img.get_height()
	var y0 := int(float(h) * 0.62)
	for y in range(y0, h):
		for x in range(w):
			var c := img.get_pixel(x, y)
			if c.a < 0.12:
				continue
			if _is_contact_leftover(c):
				img.set_pixel(x, y, Color(0, 0, 0, 0))
	var cleaned := ImageTexture.create_from_image(img)
	_clean_cache[key] = cleaned
	return cleaned

func _is_contact_leftover(c: Color) -> bool:
	var pale := minf(minf(c.r, c.g), c.b)
	var lum := 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
	var red_tick := c.r > 0.62 and c.g < 0.48 and c.b < 0.55
	var mag := c.r > 0.55 and c.b > 0.55 and c.g < 0.48
	var stitch := pale > 0.78 or (lum > 0.82 and absf(c.r - c.g) < 0.14)
	return red_tick or mag or stitch

func _build_frames() -> void:
	var frames := SpriteFrames.new()
	frames.add_animation("idle")
	frames.add_animation("walk")

	_load_animation_frames(frames, "walk", sheet_path, false)

	if not attack_sheet_path.is_empty():
		frames.add_animation("attack")
		frames.set_animation_loop("attack", false)
		_load_animation_frames(frames, "attack", attack_sheet_path, false)

	if not hurt_sheet_path.is_empty():
		frames.add_animation("hurt")
		frames.set_animation_loop("hurt", false)
		_load_animation_frames(frames, "hurt", hurt_sheet_path, false)

	if not death_sheet_path.is_empty():
		frames.add_animation("death")
		frames.set_animation_loop("death", false)
		_load_animation_frames(frames, "death", death_sheet_path, false)

	sprite_frames = frames
	texture_filter = TEXTURE_FILTER_NEAREST
	centered = true
	# Bottom-center on the CharacterBody origin (feet).
	offset = Vector2(0, -frame_size.y / 2.0)
	_load_pose_overrides(frames)
	if frames.get_frame_count("idle") == 0 and frames.get_frame_count("walk") > 0:
		frames.add_frame("idle", frames.get_frame_texture("walk", 0), 1.0)
	speed_scale = 1.0


## Loads canonical posed stills (player_idle_pose.png etc.) when generated.
## Pose files are single frames on the same canvas as frame_size — they replace
## the derived sheet for that animation name. Missing files are ignored.
func _load_pose_overrides(frames: SpriteFrames) -> void:
	var prefix := sheet_path.get_basename()
	if prefix.ends_with("_walk"):
		prefix = prefix.substr(0, prefix.length() - 5)
	var pose_anims := ["idle", "run", "jump_start", "jump", "fall", "land", "attack", "hurt", "death", "dash", "wall_slide", "wall_jump"]
	for anim in pose_anims:
		var pose_path := "%s_%s_pose.png" % [prefix, anim]
		var res_path := pose_path if pose_path.begins_with("res://") else "res://" + pose_path
		if not ResourceLoader.exists(res_path) and not FileAccess.file_exists(res_path):
			continue
		if not frames.has_animation(anim):
			frames.add_animation(anim)
			if anim in ["attack", "hurt", "death", "jump_start", "jump", "land", "dash"]:
				frames.set_animation_loop(anim, false)
		frames.clear(anim)
		var tex: Texture2D = _clean_contact_texture(load(res_path))
		if tex == null:
			continue
		var atlas := AtlasTexture.new()
		atlas.atlas = tex
		atlas.region = Rect2(0, 0, frame_size.x, frame_size.y)
		frames.add_frame(anim, atlas, 1.0)

## Loads a horizontal frame-strip sheet into the given animation. When `copy_to_idle` is
## true, this sheet's first frame is also used as the (currently single-frame) "idle"
## animation — used for the primary walk sheet, since a dedicated idle sheet isn't
## generated yet. Missing files get a solid-color placeholder frame and a warning instead
## of crashing the scene.
func _load_animation_frames(frames: SpriteFrames, anim: String, path: String, copy_to_idle: bool) -> void:
	var res_path := path if path.begins_with("res://") else "res://" + path
	if ResourceLoader.exists(res_path):
		var tex: Texture2D = _clean_contact_texture(load(res_path))
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
