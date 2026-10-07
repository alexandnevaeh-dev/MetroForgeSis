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
## Genuine multi-frame run cycle (production standard). Same treatment as the sheets above —
## loaded as a real animation, not looked up via _load_pose_overrides()'s single-frame
## <id>_run_pose.png convention (the asset pipeline no longer generates that file for the
## player; see asset-pipeline.ts's buildRunSheetAsset).
@export var run_sheet_path: String = ""

## Generalized way to add a new multi-frame animation without adding another named @export like
## the ones above — maps animation name -> sheet path (e.g.
## {"idle": "assets/characters/player_idle.png", "jump_start": "assets/characters/player_jump_start.png"}).
## Player animation production pass: idle/jump_start/jump/fall/land/dash/wall_slide/wall_jump/
## swim/attack_2/attack_3 all arrive this way instead of nine more named exports.
@export var extra_animation_sheets: Dictionary = {}

static var _clean_cache: Dictionary = {}
var _clip_presentations: Dictionary = {}
var _default_presentation_scale := Vector2.ONE
var _default_presentation_offset := Vector2.ZERO
var _has_frame_anchors := false
var _presentation_flip := false

func _ready() -> void:
	_build_frames()
	_default_presentation_scale = scale
	_default_presentation_offset = offset
	animation_changed.connect(_apply_clip_presentation)
	frame_changed.connect(_on_presentation_frame_changed)
	_apply_contact_filter()
	play("idle")

func _process(_delta: float) -> void:
	if _has_frame_anchors and flip_h != _presentation_flip:
		_apply_clip_presentation()

func _on_presentation_frame_changed() -> void:
	if _clip_presentations.get(String(animation),{}).has("frameOffsets"):
		_apply_clip_presentation()

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

	if not run_sheet_path.is_empty():
		frames.add_animation("run")
		_load_animation_frames(frames, "run", run_sheet_path, false)

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

	for anim_name in extra_animation_sheets:
		var extra_path: String = extra_animation_sheets[anim_name]
		if extra_path.is_empty():
			continue
		if not frames.has_animation(anim_name):
			frames.add_animation(anim_name)
		else:
			# "idle" (and potentially "walk") already exist from the hardcoded primary-sheet
			# animations above — a real multi-frame idle sheet replaces that placeholder
			# single-frame "idle" entry rather than crashing on a duplicate add_animation().
			frames.clear(anim_name)
		_load_animation_frames(frames, anim_name, extra_path, false)

	_load_prefixed_sheets(frames)

	sprite_frames = frames
	texture_filter = TEXTURE_FILTER_NEAREST
	centered = true
	# Bottom-center on the CharacterBody origin (feet). Generated and authored strips commonly
	# keep 2-3 transparent rows below the boots. At the gameplay camera zoom that read as a
	# conspicuous hover, so measure the first grounded frame and lower the art by that inset.
	offset = Vector2(0, -frame_size.y / 2.0 + _ground_contact_inset(frames))
	_load_pose_overrides(frames)
	# Real per-clip FPS/loop from the asset pipeline's metadata sidecar, applied last so it wins
	# regardless of whether the animation came from a named sheet export, extra_animation_sheets,
	# or a pose override — replaces the single global playback speed and the hardcoded
	# loop-exclusion list for any character that ships a sidecar (player, this pass).
	_load_animation_metadata(frames)
	if frames.get_frame_count("idle") == 0 and frames.get_frame_count("walk") > 0:
		frames.add_frame("idle", frames.get_frame_texture("walk", 0), 1.0)
	speed_scale = 1.0


func _ground_contact_inset(frames: SpriteFrames) -> float:
	var grounded_animation := "idle" if frames.has_animation("idle") and frames.get_frame_count("idle") > 0 else "walk"
	if not frames.has_animation(grounded_animation) or frames.get_frame_count(grounded_animation) == 0:
		return 0.0
	var texture := frames.get_frame_texture(grounded_animation, 0)
	if texture == null:
		return 0.0
	var image := texture.get_image()
	if image == null:
		return 0.0
	if image.is_compressed() and image.decompress() != OK:
		return 0.0
	image.convert(Image.FORMAT_RGBA8)
	for y in range(image.get_height() - 1, maxi(-1, image.get_height() / 2), -1):
		for x in range(image.get_width()):
			if image.get_pixel(x, y).a >= 0.12:
				return clampf(float(image.get_height() - 1 - y), 0.0, 6.0)
	return 0.0


## Shared basename both _load_pose_overrides() and _load_animation_metadata() derive their
## per-character file paths from (`<prefix>_<anim>_pose.png`, `<prefix>_animations.json`).
func _sheet_prefix() -> String:
	var prefix := sheet_path.get_basename()
	if prefix.ends_with("_walk"):
		prefix = prefix.substr(0, prefix.length() - 5)
	elif prefix.ends_with("_run"):
		prefix = prefix.substr(0, prefix.length() - 4)
	return prefix


func _load_prefixed_sheets(frames: SpriteFrames) -> void:
	## When the assembler only patches walk/hurt/death/attack, still pick up idle/fly/telegraph
	## sheets that share the same character prefix (enemy_001_idle.png next to enemy_001_walk.png).
	var prefix := _sheet_prefix()
	var extras := ["idle", "fly", "hover", "telegraph", "recovery", "talk", "listen", "attack_2", "attack_3", "attack_projectile", "attack_burst"]
	for anim_name in extras:
		var path := "%s_%s.png" % [prefix, anim_name]
		var res_path := path if path.begins_with("res://") else "res://" + path
		if not ResourceLoader.exists(res_path) and not FileAccess.file_exists(res_path):
			continue
		if not frames.has_animation(anim_name):
			frames.add_animation(anim_name)
		else:
			frames.clear(anim_name)
		var looping: bool = anim_name in ["idle", "fly", "hover", "telegraph", "recovery", "talk", "listen"]
		frames.set_animation_loop(anim_name, looping)
		_load_animation_frames(frames, anim_name, path, false)


## Applies real per-animation FPS/loop from a JSON sidecar the asset pipeline writes next to a
## character's sheets (`<prefix>_animations.json`, e.g. player_animations.json) — canonical
## per-clip metadata (production pass §24) instead of one global playback speed and a hardcoded
## loop-exclusion list. A character without a sidecar (enemies/bosses, this pass) is unaffected;
## an animation name the sidecar doesn't mention keeps whatever loop/speed it already has.
func _load_animation_metadata(frames: SpriteFrames) -> void:
	var meta_path := "%s_animations.json" % _sheet_prefix()
	var res_path := meta_path if meta_path.begins_with("res://") else "res://" + meta_path
	if not FileAccess.file_exists(res_path):
		return
	var file := FileAccess.open(res_path, FileAccess.READ)
	if file == null:
		return
	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	for anim_name in parsed:
		if not frames.has_animation(anim_name):
			continue
		var entry = parsed[anim_name]
		if typeof(entry) != TYPE_DICTIONARY:
			continue
		if entry.has("fps") and (not typeof(entry.fps) in [TYPE_INT,TYPE_FLOAT] or not is_finite(float(entry.fps)) or float(entry.fps)<=0.0):
			continue
		if entry.has("loop") and not typeof(entry.loop)==TYPE_BOOL:
			continue
		if entry.has("sourceSheet") or entry.has("sourceFrames"):
			if not _load_source_regions(frames,String(anim_name),entry):
				continue
		if entry.has("fps"):
			frames.set_animation_speed(anim_name, float(entry["fps"]))
		if entry.has("loop"):
			frames.set_animation_loop(anim_name, bool(entry["loop"]))

## Loads canonical posed stills (player_idle_pose.png etc.) when generated — but ONLY for an
## animation that doesn't already have a real multi-frame production sheet. This is a general
## rule, not a per-name exclusion list: "production sheet wins over still pose" is decided by
## actually checking how many frames are already loaded (frames.get_frame_count(anim) > 1),
## never by hardcoding which animation names happen to have sheets today. The run-cycle fix
## solved this once for "run" specifically; this generalizes it so the next new multi-frame
## sheet (walk upgrade, jump_start, swim, attack_2, ...) never needs the same fix repeated.
## Pose files are single frames on the same canvas as frame_size. Missing files are ignored.
func _load_pose_overrides(frames: SpriteFrames) -> void:
	var prefix := _sheet_prefix()
	var pose_anims := ["idle", "run", "jump_start", "jump", "fall", "land", "attack", "hurt", "death", "dash", "wall_slide", "wall_jump", "swim"]
	for anim in pose_anims:
		if frames.has_animation(anim) and frames.get_frame_count(anim) > 1:
			continue  # a real multi-frame production sheet already won this animation name
		var pose_path := "%s_%s_pose.png" % [prefix, anim]
		var res_path := pose_path if pose_path.begins_with("res://") else "res://" + pose_path
		if not ResourceLoader.exists(res_path) and not FileAccess.file_exists(res_path):
			continue
		if not frames.has_animation(anim):
			frames.add_animation(anim)
			if anim in ["attack", "hurt", "death", "jump_start", "jump", "land", "dash", "wall_jump"]:
				frames.set_animation_loop(anim, false)
		frames.clear(anim)
		var tex: Texture2D = _clean_contact_texture(load(res_path))
		if tex == null:
			continue
		var atlas := AtlasTexture.new()
		atlas.filter_clip = true
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
	# Freshly generated PNGs may exist on disk before Godot's import cache registers them, and
	# load() can briefly return null for a real, present file right after a large --import pass.
	# Check both FileAccess and ResourceLoader, and guard the null so the player falls back to the
	# placeholder frame instead of crashing.
	if ResourceLoader.exists(res_path) or FileAccess.file_exists(res_path):
		var tex: Texture2D = _clean_contact_texture(load(res_path))
		if tex != null:
			# Derive the real frame count from the sheet's actual width instead of trusting the
			# single shared `frame_count` export — different animations (e.g. a 12-frame run cycle
			# vs a 4-frame walk/attack/hurt/death sheet) legitimately have different lengths. Falls
			# back to frame_count when the width isn't a clean multiple of frame_size.x.
			var sheet_frame_count := frame_count
			if frame_size.x > 0:
				var tex_width := tex.get_width()
				var tex_height := tex.get_height()
				if tex_height > 0 and tex_height != frame_size.y:
					push_warning(
						"AnimatedAssetSprite: '%s' sheet height %d does not match frame_size.y %d — check boss_final 160px compilation"
						% [anim, tex_height, frame_size.y]
					)
				if tex_width > 0 and tex_width % frame_size.x == 0:
					@warning_ignore("integer_division")  # exact multiple guaranteed by the modulo check above
					sheet_frame_count = tex_width / frame_size.x
				elif tex_width > 0:
					push_warning(
						"AnimatedAssetSprite: '%s' width %d is not a multiple of frame_size.x %d — frames will crop"
						% [anim, tex_width, frame_size.x]
					)
			for i in range(sheet_frame_count):
				var atlas := AtlasTexture.new()
				atlas.filter_clip = true
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

## Generated strips may carry larger source cells. Keep their pixels intact and use one
## shared display scale/foot anchor, rather than slicing them as arbitrary 64px cells.
func _load_source_regions(frames: SpriteFrames, anim: String, entry: Dictionary) -> bool:
	var path := "res://"+String(entry.get("sourceSheet",""))
	var regions: Variant = entry.get("sourceRegions",[])
	var display_scale := float(entry.get("displayScale",0.0))
	var anchor_y := float(entry.get("footAnchorY",-1.0))
	var anchors: Variant = entry.get("frameFootAnchors")
	var has_anchors := entry.has("frameFootAnchors")
	var independent := entry.has("sourceFrames")
	var paths: Variant = entry.get("sourceFrames",[])
	if not regions is Array or regions.is_empty() or not is_finite(display_scale) or display_scale<=0.0 or (not has_anchors and (not is_finite(anchor_y) or anchor_y<0.0)):
		return false
	if independent:
		if entry.has("sourceSheet") or not has_anchors or not paths is Array or paths.size()!=regions.size() or not typeof(entry.get("frameCount")) in [TYPE_INT,TYPE_FLOAT] or not is_finite(float(entry.frameCount)) or float(entry.frameCount)!=regions.size():
			return false
		for source in paths:
			if not source is String or not source.begins_with("assets/") or not source.ends_with(".png") or source.contains("\\") or source.contains(":") or source.split("/").has("..") or not ResourceLoader.exists("res://"+source):
				return false
	elif not ResourceLoader.exists(path):
		return false
	if has_anchors and (not anchors is Array or anchors.size()!=regions.size()):
		return false
	var texture: Texture2D = null if independent else load(path)
	if not independent and texture == null:
		return false
	var prepared: Array[AtlasTexture] = []
	var common_height := -1.0
	var frame_offsets: Array[Vector2] = []
	for value in regions:
		if independent:
			texture = load("res://"+String(paths[prepared.size()]))
			if texture == null:
				return false
		if not value is Array or value.size()!=4:
			return false
		for coordinate in value:
			if not typeof(coordinate) in [TYPE_INT,TYPE_FLOAT] or not is_finite(float(coordinate)):
				return false
		var rect := Rect2(float(value[0]),float(value[1]),float(value[2]),float(value[3]))
		if rect.size.x<=0.0 or rect.size.y<=0.0 or not Rect2(Vector2.ZERO,texture.get_size()).encloses(rect) or (not has_anchors and anchor_y>rect.size.y):
			return false
		if has_anchors:
			var anchor: Variant = anchors[prepared.size()]
			if not anchor is Array or anchor.size()!=2 or not typeof(anchor[0]) in [TYPE_INT,TYPE_FLOAT] or not typeof(anchor[1]) in [TYPE_INT,TYPE_FLOAT]:
				return false
			var point := Vector2(float(anchor[0]),float(anchor[1]))
			if not is_finite(point.x) or not is_finite(point.y) or point.x<0 or point.y<0 or point.x>rect.size.x or point.y>rect.size.y:
				return false
			frame_offsets.append(rect.size*0.5-point)
		if common_height>=0.0 and common_height!=rect.size.y:
			return false
		common_height=rect.size.y
		var atlas := AtlasTexture.new()
		atlas.atlas=texture
		atlas.region=rect
		atlas.filter_clip=true
		prepared.append(atlas)
	frames.clear(anim)
	for atlas in prepared:
		frames.add_frame(anim,atlas,1.0)
	_clip_presentations[anim]={"scale":display_scale,"offset":Vector2(0,common_height*0.5-anchor_y)}
	if has_anchors:
		_clip_presentations[anim]["frameOffsets"] = frame_offsets
		_has_frame_anchors = true
	return true

func _apply_clip_presentation() -> void:
	var direction := -1.0 if scale.x<0.0 else 1.0
	var presentation: Dictionary = _clip_presentations.get(String(animation),{})
	var factor := float(presentation.get("scale",1.0))
	scale=Vector2(absf(_default_presentation_scale.x)*factor*direction,_default_presentation_scale.y*factor)
	offset=presentation.get("offset",_default_presentation_offset)
	var frame_offsets: Array = presentation.get("frameOffsets",[])
	if not frame_offsets.is_empty():
		offset=frame_offsets[clampi(frame,0,frame_offsets.size()-1)]
		if flip_h:
			offset.x=-offset.x
	_presentation_flip=flip_h

## Parent controllers set family scale after this sprite's _ready(). Preserve
## clip presentation factors instead of replacing their rendered scale.
func set_base_presentation_scale(base_scale: Vector2) -> bool:
	if not is_finite(base_scale.x) or not is_finite(base_scale.y) or base_scale.x<=0.0 or base_scale.y<=0.0:
		return false
	_default_presentation_scale=base_scale
	_apply_clip_presentation()
	return true
