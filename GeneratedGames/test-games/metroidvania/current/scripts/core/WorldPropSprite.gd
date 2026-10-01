extends Sprite2D
## Static world interactable (pickup / save / ability). Loads a generated PNG when present,
## otherwise a solid fallback so missing art never crashes the scene. Hides the sibling
## "Item" / "Save Point" / "Ability" Label once real pixels are on screen.

@export var sprite_path: String = "assets/props/interact/pickup.png"
@export var fallback_color: Color = Color(0.95, 0.85, 0.3, 1)
@export var display_size: Vector2 = Vector2(20, 20)
@export var bob_pixels: float = 2.0
@export var bob_speed: float = 1.8
@export var pulse: bool = true

var _rest_offset := Vector2.ZERO

func _ready() -> void:
	texture_filter = TEXTURE_FILTER_NEAREST
	centered = true
	offset = Vector2(0, -display_size.y * 0.5)
	var loaded := _load_texture()
	_rest_offset = offset
	var label := get_parent().get_node_or_null("Label") as Label
	if label:
		label.visible = not loaded

func _process(_delta: float) -> void:
	var t := Time.get_ticks_msec() * 0.001
	if bob_pixels > 0.0:
		offset = _rest_offset + Vector2(0, sin(t * TAU * bob_speed) * bob_pixels)
	if pulse:
		var glow := 0.92 + 0.08 * sin(t * TAU * 1.1)
		modulate = Color(glow, glow, minf(1.0, glow + 0.04), 1.0)

func _load_texture() -> bool:
	var res_path := sprite_path if sprite_path.begins_with("res://") else "res://" + sprite_path
	if ResourceLoader.exists(res_path) or FileAccess.file_exists(res_path):
		var tex: Texture2D = load(res_path)
		if tex:
			texture = tex
			_apply_authored_presentation(res_path, tex)
			return true
	var img := Image.create(int(display_size.x), int(display_size.y), false, Image.FORMAT_RGBA8)
	img.fill(fallback_color)
	texture = ImageTexture.create_from_image(img)
	return false


func _apply_authored_presentation(res_path: String, tex: Texture2D) -> void:
	# Shared static sprite metadata keeps a shrine's authored base at the gameplay anchor.
	# Assets without metadata retain their existing presentation.
	var metadata_path := res_path.get_basename() + "_animations.json"
	if not FileAccess.file_exists(metadata_path):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(metadata_path))
	if not parsed is Dictionary:
		return
	var spec: Variant = parsed.get("idle")
	if not spec is Dictionary or int(spec.get("frameCount", 1)) != 1:
		return
	var density := float(spec.get("pixelsPerUnit", 1.0))
	var pivot := Vector2(float(spec.get("pivotX", 0.5)), float(spec.get("pivotY", 0.0)))
	if not is_finite(density) or density <= 0.0 or not pivot.is_finite() \
		or pivot.x < 0.0 or pivot.x > 1.0 or pivot.y < 0.0 or pivot.y > 1.0:
		return
	scale = Vector2.ONE / density
	offset = Vector2(tex.get_width() * (0.5 - pivot.x), tex.get_height() * (pivot.y - 0.5))
