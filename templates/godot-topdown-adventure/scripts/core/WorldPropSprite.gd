extends Sprite2D
## Static world interactable (pickup / save). Loads a generated PNG when present,
## otherwise a solid fallback so missing art never crashes the scene. Hides the sibling
## stub Label once real pixels are on screen.

@export var sprite_path: String = "assets/props/interact/pickup.png"
@export var fallback_color: Color = Color(0.95, 0.85, 0.3, 1)
@export var display_size: Vector2 = Vector2(20, 20)

func _ready() -> void:
	texture_filter = TEXTURE_FILTER_NEAREST
	centered = true
	offset = Vector2(0, -display_size.y * 0.5)
	var loaded := _load_texture()
	var label := get_parent().get_node_or_null("Label") as Label
	if label:
		label.visible = not loaded

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
