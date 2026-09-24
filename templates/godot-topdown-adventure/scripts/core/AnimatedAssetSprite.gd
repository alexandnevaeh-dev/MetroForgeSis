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
## Was never wired at all in this template despite the asset pipeline always generating
## `<id>_death.png` for every character/enemy/boss (packages/assets/src/asset-pipeline.ts's
## buildDeathSheetAsset — genre-agnostic, the same call side-view's own Boss.tscn already
## consumes via this exact export name) — no top-down actor ever showed a death animation.
@export var death_sheet_path: String = ""

## A single-pose still image (e.g. "assets/bosses/boss_final.png") generated at this actor's
## *real* frame size, used to correct `frame_size` above at runtime instead of trusting it — the
## asset pipeline's `compiledSpriteFrameSize()` returns 96x96 for a non-final boss and 128x128
## for the final one (packages/assets/src/asset-pipeline.ts), so one fixed `frame_size` hardcoded
## on a shared Boss.tscn cannot be correct for both. Confirmed directly: this template's
## Boss.tscn shipped with frame_size=48x48 against real 128x128-per-frame sheets, so every walk/
## attack/hurt frame was a wrong, tiny top-left crop of the real sprite (a hood-shaped fragment,
## tinted red by the telegraph modulate — the reported "plain triangle"), never the sheet's
## actual per-frame content. Empty string (the default) skips this and trusts `frame_size` as
## exported, so every non-boss actor (correctly sized already) is unaffected.
@export var reference_pose_path: String = ""

## Optional authored strips: {"walk": {"N": "assets/characters/player_walk_N.png", ...}}.
## Eight exact facing names are supported; missing entries retain the legacy animation.
## Strips share frame_size, but their frame count is derived independently.
@export var directional_sheets: Dictionary = {}
@export_range(1.0, 60.0) var directional_fps: float = 10.0
const FACINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

func resolve_animation(action: String, direction: String) -> StringName:
	var directional := action + "_" + direction
	if sprite_frames and sprite_frames.has_animation(directional):
		return StringName(directional)
	return StringName(action)

func _load_directional_frames(frames: SpriteFrames) -> void:
	for action in ["idle", "walk", "attack", "hurt", "death"]:
		var sheets = directional_sheets.get(action, {})
		if not sheets is Dictionary:
			push_warning("Directional animation must map facings to paths: " + action)
			continue
		for direction in FACINGS:
			var path = sheets.get(direction, "")
			if not path is String or path.is_empty():
				continue
			var resource_path: String = path if path.begins_with("res://") else "res://" + path
			if not ResourceLoader.exists(resource_path):
				push_warning("Missing directional strip: " + resource_path)
				continue
			var texture = load(resource_path)
			if not texture is Texture2D or frame_size.x <= 0 or frame_size.y <= 0:
				continue
			if texture.get_height() != frame_size.y or texture.get_width() % frame_size.x != 0:
				push_warning("Directional strip dimensions do not match frame_size: " + resource_path)
				continue
			var name: String = action + "_" + direction
			frames.add_animation(name)
			frames.set_animation_loop(name, action in ["idle", "walk"])
			frames.set_animation_speed(name, directional_fps)
			@warning_ignore("integer_division")
			var count: int = texture.get_width() / frame_size.x
			for index in range(count):
				var atlas := AtlasTexture.new()
				atlas.atlas = texture
				atlas.region = Rect2(index * frame_size.x, 0, frame_size.x, frame_size.y)
				frames.add_frame(name, atlas)
	# A directional walk's first pose is preferable to a sideways generic idle.
	for direction in FACINGS:
		var walk: String = "walk_" + direction
		var idle: String = "idle_" + direction
		if frames.has_animation(walk) and not frames.has_animation(idle):
			frames.add_animation(idle)
			frames.add_frame(idle, frames.get_frame_texture(walk, 0))


func _ready() -> void:
	_build_frames()
	play("walk")

## Runtime re-skin entry point — lets a controller swap this actor's entire sheet family (e.g.
## a field enemy picking its real melee/ranged/heavy art by combat type, set after `_ready()` has
## already run once with Enemy.tscn's shared default paths) without duplicating `_build_frames()`'s
## own logic. Any path left empty ("") keeps its current value rather than clearing it, so a caller
## only needs to name the paths it actually wants to change. No-op safe: if none of the new paths
## point at a file that exists, `_load_animation_frames()`'s own fallback-placeholder behavior
## applies exactly as it would from `_ready()`, so this can never leave the sprite in a broken
## half-built state. The currently-playing animation name is preserved across the rebuild (falling
## back to "walk" if the old one no longer exists in the new sheet set, e.g. switching to a family
## with no death sheet while "death" was playing).
func configure_and_rebuild(
	new_sheet_path: String = "",
	new_attack_sheet_path: String = "",
	new_hurt_sheet_path: String = "",
	new_death_sheet_path: String = "",
	new_reference_pose_path: String = "",
) -> void:
	if not new_sheet_path.is_empty():
		sheet_path = new_sheet_path
	if not new_attack_sheet_path.is_empty():
		attack_sheet_path = new_attack_sheet_path
	if not new_hurt_sheet_path.is_empty():
		hurt_sheet_path = new_hurt_sheet_path
	if not new_death_sheet_path.is_empty():
		death_sheet_path = new_death_sheet_path
	if not new_reference_pose_path.is_empty():
		reference_pose_path = new_reference_pose_path
	var current_anim := animation
	_build_frames()
	play(current_anim if sprite_frames.has_animation(current_anim) else "walk")

func _build_frames() -> void:
	_resolve_frame_size_from_reference_pose()

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

	if not death_sheet_path.is_empty():
		frames.add_animation("death")
		frames.set_animation_loop("death", false)
		_load_animation_frames(frames, "death", death_sheet_path, false)

	_load_directional_frames(frames)
	sprite_frames = frames
	# `centered = false` with a large 2D offset (frame_size.x/2, frame_size.y) is mathematically
	# the same bottom-center anchor as `centered = true` with offset (0, -frame_size.y/2) — but at
	# 128x128 (the final boss's real size — see reference_pose_path above), the `centered = false`
	## form renders only a small top-left fragment of the real texture instead of the whole frame,
	# confirmed directly by toggling nothing but this property with the same real boss sprite:
	# offset zeroed out drew the full, correct character; restoring the real offset atop
	# `centered = false` reproduced the fragment again. Every actor in this template stayed at
	# 32-48px, where the bug never showed. Side-view's own AnimatedAssetSprite.gd already uses
	# this exact `centered = true` form (and already renders 128x128 bosses correctly) — adopting
	# the same convention here instead of chasing the underlying engine behavior further. The two
	# forms are equivalent for every existing actor (same anchor point, just derived differently),
	# so this is not expected to shift the player/enemy/NPC sprites already using this script.
	centered = true
	offset = Vector2(0, -frame_size.y / 2.0)

## Overrides `frame_size` from the real dimensions of `reference_pose_path`, when set and the
## file actually exists — a single-pose still is never a frame-strip, so its width/height *is*
## exactly one frame's real size, more trustworthy than a value hand-typed into a shared .tscn.
func _resolve_frame_size_from_reference_pose() -> void:
	if reference_pose_path.is_empty():
		return
	var res_path := reference_pose_path if reference_pose_path.begins_with("res://") else "res://" + reference_pose_path
	if not ResourceLoader.exists(res_path):
		return
	var tex: Texture2D = load(res_path)
	if tex == null or tex.get_width() <= 0 or tex.get_height() <= 0:
		return
	frame_size = Vector2i(tex.get_width(), tex.get_height())

## Loads a horizontal frame-strip sheet into the given animation. When `copy_to_idle` is
## true, this sheet's first frame is also used as the (currently single-frame) "idle"
## animation — used for the primary walk sheet, since a dedicated idle sheet isn't
## generated yet. Missing files get a solid-color placeholder frame and a warning instead
## of crashing the scene.
func _load_animation_frames(frames: SpriteFrames, anim: String, path: String, copy_to_idle: bool) -> void:
	var res_path := path if path.begins_with("res://") else "res://" + path
	# ResourceLoader.exists() can be true (the .import metadata is on disk) for a moment before
	# load() can actually return the compiled texture — observed directly running RuntimeSmokeTest
	# immediately after a large fresh --import pass under heavy concurrent machine load, where
	# load() returned null for a real, present, correctly-imported file and crashed the very next
	# .get_width() call. A freshly generated PNG may also exist on disk before the import cache
	# registers it at all, so check FileAccess too. Either way, fall through to the placeholder
	# path below on a null load() instead of crashing the whole script.
	if (ResourceLoader.exists(res_path) or FileAccess.file_exists(res_path)) and load(res_path) != null:
		var tex: Texture2D = load(res_path)
		# Derive the real frame count from the sheet's actual width instead of trusting the single
		# shared `frame_count` export — a sheet whose actual layout doesn't match `frame_count`
		# (the same class of mismatch `frame_size` had — see reference_pose_path above) would
		# otherwise crop a partial or out-of-bounds frame instead of the sheet's real content.
		# Falls back to `frame_count` when the width isn't a clean multiple of frame_size.x.
		var sheet_frame_count := frame_count
		if frame_size.x > 0:
			var tex_width := tex.get_width()
			if tex_width > 0 and tex_width % frame_size.x == 0:
				@warning_ignore("integer_division")  # exact multiple guaranteed by the modulo check above
				sheet_frame_count = tex_width / frame_size.x
		for i in range(sheet_frame_count):
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
