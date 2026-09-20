extends Node2D
## Opening-room pouring bay: frozen conduit-ingot pour. No collision.
## Built from nearest-neighbor ImageTextures so it reads even without authored PNGs.

@export var room_width: int = 720
@export var room_height: int = 520
@export var tile_size: int = 32

const IRON := Color(0.22, 0.18, 0.16, 1)
const IRON_L := Color(0.38, 0.32, 0.26, 1)
const IRON_D := Color(0.10, 0.09, 0.08, 1)
const BRASS := Color(0.54, 0.40, 0.22, 1)
const BRASS_L := Color(0.74, 0.56, 0.30, 1)
const SLAG := Color(0.80, 0.42, 0.16, 1)
const SLAG_L := Color(0.95, 0.72, 0.28, 1)
const GLASS := Color(0.18, 0.55, 0.58, 1)
const GLASS_L := Color(0.40, 0.82, 0.78, 1)
const SOOT := Color(0.08, 0.07, 0.07, 1)

func _ready() -> void:
	z_index = 4
	z_as_relative = false
	texture_filter = TEXTURE_FILTER_NEAREST
	var floor_y := float(int((room_height - tile_size * 2) / float(tile_size)) * tile_size)
	_sprite(_rail_image(), Vector2(room_width * 0.5, floor_y - 168.0))
	_sprite(_traveller_image(), Vector2(room_width * 0.52, floor_y - 148.0))
	_sprite(_ladle_image(), Vector2(room_width * 0.52, floor_y - 78.0))
	_sprite(_drip_image(), Vector2(room_width * 0.52, floor_y - 28.0))
	_sprite(_trough_image(), Vector2(room_width * 0.50, floor_y - 10.0))
	_sprite(_molds_image(), Vector2(room_width * 0.72, floor_y - 18.0))
	_sprite(_crucible_image(), Vector2(room_width * 0.22, floor_y - 36.0))
	_sprite(_mite_image(), Vector2(room_width * 0.38, floor_y - 22.0))
	_try_swap_far_sky()


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


func _rail_image() -> Image:
	var img := Image.create(maxi(room_width - 48, 128), 28, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 0, 6, img.get_width(), 16, IRON)
	_fill_rect(img, 0, 6, img.get_width(), 3, IRON_L)
	_fill_rect(img, 0, 19, img.get_width(), 3, IRON_D)
	_fill_rect(img, 0, 12, img.get_width(), 2, SOOT)
	var x := 8
	while x < img.get_width():
		_fill_rect(img, x, 10, 3, 8, BRASS)
		x += 28
	return img


func _traveller_image() -> Image:
	var img := Image.create(72, 36, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 4, 2, 64, 20, IRON)
	_fill_rect(img, 4, 2, 64, 4, BRASS_L)
	_fill_rect(img, 30, 18, 12, 16, IRON_D)
	_fill_rect(img, 32, 18, 8, 16, BRASS)
	return img


func _ladle_image() -> Image:
	var img := Image.create(112, 96, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 50, 0, 12, 36, IRON)
	_fill_rect(img, 52, 0, 4, 36, BRASS)
	_fill_rect(img, 18, 32, 76, 8, IRON_L)
	_ellipse(img, 56, 62, 42, 26, IRON)
	_ellipse(img, 56, 62, 34, 20, IRON_D)
	_ellipse(img, 56, 64, 26, 14, SLAG)
	_ellipse(img, 50, 60, 10, 6, SLAG_L)
	_ellipse(img, 62, 66, 8, 4, GLASS_L)
	return img


func _drip_image() -> Image:
	var img := Image.create(28, 48, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 12, 0, 4, 28, SLAG)
	_fill_rect(img, 13, 0, 2, 28, SLAG_L)
	_ellipse(img, 14, 36, 8, 10, GLASS)
	_ellipse(img, 14, 34, 4, 5, GLASS_L)
	return img


func _trough_image() -> Image:
	var img := Image.create(maxi(int(room_width * 0.62), 160), 28, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 0, 8, img.get_width(), 16, IRON_D)
	_fill_rect(img, 0, 8, img.get_width(), 3, IRON)
	_fill_rect(img, 6, 12, img.get_width() - 12, 8, SLAG)
	_fill_rect(img, 10, 13, img.get_width() - 28, 3, GLASS)
	_fill_rect(img, 18, 14, 40, 2, SLAG_L)
	return img


func _molds_image() -> Image:
	var img := Image.create(120, 40, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 0, 24, 120, 12, IRON)
	for i in range(3):
		var x := 8 + i * 38
		_fill_rect(img, x, 8, 32, 22, IRON_D)
		_fill_rect(img, x + 4, 12, 24, 12, GLASS)
		_fill_rect(img, x + 6, 14, 8, 4, GLASS_L)
		_fill_rect(img, x + 4, 20, 24, 3, BRASS)
	return img


func _crucible_image() -> Image:
	var img := Image.create(56, 64, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 8, 20, 40, 40, IRON)
	_fill_rect(img, 8, 20, 40, 6, BRASS)
	_fill_rect(img, 14, 28, 28, 24, IRON_D)
	_ellipse(img, 28, 36, 12, 8, SLAG)
	_ellipse(img, 26, 34, 5, 3, SLAG_L)
	return img


func _try_swap_far_sky() -> void:
	var parent := get_parent()
	if parent == null:
		return
	var far := parent.get_node_or_null("FarSky") as Sprite2D
	if far == null:
		return
	var path := "res://assets/backgrounds/biome_0/pouring_bay_far.png"
	if ResourceLoader.exists(path):
		far.texture = load(path) as Texture2D


func _mite_image() -> Image:
	var img := Image.create(56, 40, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_ellipse(img, 26, 22, 18, 12, IRON)
	_ellipse(img, 26, 20, 8, 6, SLAG)
	_ellipse(img, 26, 18, 3, 2, SLAG_L)
	_fill_rect(img, 40, 14, 14, 5, IRON_L)
	_fill_rect(img, 2, 16, 12, 4, IRON_L)
	_fill_rect(img, 10, 28, 5, 10, IRON_D)
	_fill_rect(img, 22, 28, 5, 10, IRON_D)
	_fill_rect(img, 34, 28, 5, 10, IRON_D)
	return img
