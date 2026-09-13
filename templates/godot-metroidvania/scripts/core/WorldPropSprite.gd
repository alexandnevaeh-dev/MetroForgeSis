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
	_rest_offset = offset
	var loaded := _load_texture()
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
			return true
	var img := Image.create(int(display_size.x), int(display_size.y), false, Image.FORMAT_RGBA8)
	img.fill(fallback_color)
	texture = ImageTexture.create_from_image(img)
	return false
