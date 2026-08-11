extends AnimatedSprite2D

@export var sheet_path: String = "assets/characters/player_walk.png"
@export var frame_size: Vector2i = Vector2i(32, 32)
@export var frame_count: int = 4
@export var fallback_color: Color = Color(0.35, 0.55, 0.95, 1)

func _ready() -> void:
	_build_frames()
	play("walk")

func _build_frames() -> void:
	var frames := SpriteFrames.new()
	frames.add_animation("idle")
	frames.add_animation("walk")

	var path := sheet_path if sheet_path.begins_with("res://") else "res://" + sheet_path
	if ResourceLoader.exists(path):
		var tex: Texture2D = load(path)
		for i in range(frame_count):
			var atlas := AtlasTexture.new()
			atlas.atlas = tex
			atlas.region = Rect2(i * frame_size.x, 0, frame_size.x, frame_size.y)
			frames.add_frame("walk", atlas, 1.0)
			if i == 0:
				frames.add_frame("idle", atlas, 1.0)
		sprite_frames = frames
		centered = false
		offset = Vector2(frame_size.x / 2.0, frame_size.y)
		return

	var img := Image.create(frame_size.x, frame_size.y, false, Image.FORMAT_RGBA8)
	img.fill(fallback_color)
	var fallback := ImageTexture.create_from_image(img)
	frames.add_frame("idle", fallback)
	frames.add_frame("walk", fallback)
	sprite_frames = frames
	centered = false
	offset = Vector2(frame_size.x / 2.0, frame_size.y)
