extends Sprite2D

@export var asset_path: String = ""
@export var fallback_color: Color = Color.WHITE
@export var fallback_size: Vector2i = Vector2i(24, 40)

func _ready() -> void:
	_apply_texture()

func _apply_texture() -> void:
	if not asset_path.is_empty():
		var path := asset_path if asset_path.begins_with("res://") else "res://" + asset_path
		if ResourceLoader.exists(path):
			texture = load(path)
			_configure_sprite()
			return
	_create_fallback()

func _create_fallback() -> void:
	var img := Image.create(fallback_size.x, fallback_size.y, false, Image.FORMAT_RGBA8)
	img.fill(fallback_color)
	texture = ImageTexture.create_from_image(img)
	_configure_sprite()

func _configure_sprite() -> void:
	centered = false
	if texture:
		offset = Vector2(texture.get_width() / 2.0, texture.get_height())
