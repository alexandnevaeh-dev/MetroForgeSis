extends Node2D
## Flooded quench tunnel dressing. No collision. Keeps the walk/combat band clear.

@export var room_width: int = 720
@export var room_height: int = 520
@export var tile_size: int = 32
@export var room_archetype: String = "traversal"

const IRON := Color(0.18, 0.28, 0.32, 1)
const IRON_L := Color(0.32, 0.46, 0.48, 1)
const IRON_D := Color(0.08, 0.12, 0.14, 1)
const GLASS := Color(0.12, 0.52, 0.56, 1)
const GLASS_L := Color(0.38, 0.82, 0.84, 1)
const BRASS := Color(0.48, 0.74, 0.73, 1)

func _ready() -> void:
	z_index = 4
	z_as_relative = false
	texture_filter = TEXTURE_FILTER_NEAREST
	var floor_y := float(int((room_height - tile_size * 2) / float(tile_size)) * tile_size)
	_sprite(_pipe_image(), Vector2(room_width * 0.5, floor_y - 118.0))
	_sprite(_valve_image(), Vector2(room_width * 0.22, floor_y - 42.0))
	_sprite(_valve_image(), Vector2(room_width * 0.78, floor_y - 50.0))
	if room_archetype != "combat" and room_archetype != "arena":
		_sprite(_tank_image(), Vector2(room_width * 0.12, floor_y - 64.0))
		_sprite(_tank_image(), Vector2(room_width * 0.88, floor_y - 72.0))
	_sprite(_molds_image(), Vector2(room_width * 0.62, floor_y - 14.0))
	_sprite(_steam_image(), Vector2(room_width * 0.40, floor_y - 88.0))
	_try_swap_far()


func _sprite(img: Image, pos: Vector2) -> void:
	var spr := Sprite2D.new()
	spr.texture = ImageTexture.create_from_image(img)
	spr.centered = true
	spr.texture_filter = TEXTURE_FILTER_NEAREST
	spr.position = pos
	add_child(spr)


func _fill_rect(img: Image, x: int, y: int, w: int, h: int, c: Color) -> void:
	for j in range(h):
		for i in range(w):
			var px := x + i
			var py := y + j
			if px >= 0 and py >= 0 and px < img.get_width() and py < img.get_height():
				img.set_pixel(px, py, c)


func _ellipse(img: Image, cx: float, cy: float, rx: float, ry: float, c: Color) -> void:
	var x0 := int(cx - rx) - 1
	var y0 := int(cy - ry) - 1
	var x1 := int(cx + rx) + 1
	var y1 := int(cy + ry) + 1
	for y in range(y0, y1 + 1):
		for x in range(x0, x1 + 1):
			if x < 0 or y < 0 or x >= img.get_width() or y >= img.get_height():
				continue
			var nx := (x + 0.5 - cx) / rx
			var ny := (y + 0.5 - cy) / ry
			if nx * nx + ny * ny <= 1.0:
				img.set_pixel(x, y, c)


func _pipe_image() -> Image:
	var img := Image.create(maxi(room_width - 80, 160), 18, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 0, 4, img.get_width(), 10, IRON)
	_fill_rect(img, 0, 6, img.get_width(), 4, GLASS)
	_fill_rect(img, 0, 4, img.get_width(), 2, IRON_L)
	return img


func _valve_image() -> Image:
	var img := Image.create(40, 40, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_ellipse(img, 20, 20, 16, 16, IRON)
	_ellipse(img, 20, 20, 10, 10, IRON_D)
	_fill_rect(img, 4, 18, 32, 4, BRASS)
	_fill_rect(img, 18, 4, 4, 32, BRASS)
	_ellipse(img, 20, 20, 3, 3, GLASS_L)
	return img


func _tank_image() -> Image:
	var img := Image.create(36, 72, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 4, 8, 28, 60, IRON)
	_fill_rect(img, 8, 16, 20, 28, GLASS)
	_fill_rect(img, 10, 20, 10, 6, GLASS_L)
	_fill_rect(img, 14, 0, 8, 10, IRON_L)
	return img


func _molds_image() -> Image:
	var img := Image.create(96, 22, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 0, 10, 96, 12, IRON_D)
	for i in range(3):
		var x := 6 + i * 30
		_fill_rect(img, x, 4, 24, 14, IRON)
		_fill_rect(img, x + 4, 8, 16, 6, GLASS)
	return img


func _steam_image() -> Image:
	var img := Image.create(48, 40, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_ellipse(img, 12, 28, 6, 8, Color(0.7, 0.86, 0.86, 0.45))
	_ellipse(img, 24, 18, 8, 10, Color(0.75, 0.9, 0.9, 0.4))
	_ellipse(img, 36, 10, 7, 8, Color(0.8, 0.92, 0.92, 0.35))
	return img


func _try_swap_far() -> void:
	var parent := get_parent()
	if parent == null:
		return
	var far := parent.get_node_or_null("FarSky") as Sprite2D
	if far == null:
		return
	var path := "res://assets/backgrounds/biome_1/far.png"
	if ResourceLoader.exists(path):
		far.texture = load(path) as Texture2D
