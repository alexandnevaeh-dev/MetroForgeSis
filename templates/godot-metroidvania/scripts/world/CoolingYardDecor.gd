extends Node2D
## Overgrown cooling-yard dressing. No collision. Center kept clear for combat.

@export var room_width: int = 720
@export var room_height: int = 520
@export var tile_size: int = 32
@export var room_archetype: String = "combat"

const IRON := Color(0.28, 0.26, 0.18, 1)
const IRON_L := Color(0.40, 0.36, 0.24, 1)
const IRON_D := Color(0.12, 0.12, 0.08, 1)
const VINE := Color(0.22, 0.42, 0.18, 1)
const LEAF := Color(0.32, 0.54, 0.24, 1)
const BRASS := Color(0.46, 0.36, 0.18, 1)

func _ready() -> void:
	z_index = 4
	z_as_relative = false
	texture_filter = TEXTURE_FILTER_NEAREST
	var floor_y := float(int((room_height - tile_size * 2) / float(tile_size)) * tile_size)
	_sprite(_rack_image(72), Vector2(room_width * 0.16, floor_y - 40.0))
	_sprite(_rack_image(56), Vector2(room_width * 0.84, floor_y - 32.0))
	if room_archetype != "combat" and room_archetype != "arena":
		_sprite(_rack_image(64), Vector2(room_width * 0.50, floor_y - 36.0))
	_sprite(_machine_image(), Vector2(room_width * 0.72, floor_y - 28.0))
	_sprite(_mold_image(), Vector2(room_width * 0.34, floor_y - 12.0))
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


func _rack_image(h: int) -> Image:
	var img := Image.create(36, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 4, 0, 5, h, IRON)
	_fill_rect(img, 26, 0, 5, h, IRON)
	var y := 8
	while y < h - 4:
		_fill_rect(img, 0, y, 36, 4, IRON_L)
		y += 12
	_fill_rect(img, 28, 10, 3, h - 20, VINE)
	_ellipse(img, 32, 22, 4, 4, LEAF)
	_ellipse(img, 30, 38, 3, 3, LEAF)
	return img


func _machine_image() -> Image:
	var img := Image.create(48, 52, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 4, 12, 40, 36, IRON)
	_fill_rect(img, 10, 18, 28, 18, IRON_D)
	_fill_rect(img, 22, 0, 4, 52, IRON_D)
	_fill_rect(img, 20, 0, 3, 28, VINE)
	_ellipse(img, 28, 8, 5, 5, LEAF)
	_fill_rect(img, 8, 14, 32, 3, BRASS)
	return img


func _mold_image() -> Image:
	var img := Image.create(64, 20, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	_fill_rect(img, 0, 8, 64, 12, IRON_D)
	_fill_rect(img, 6, 4, 16, 12, IRON)
	_fill_rect(img, 26, 2, 16, 14, IRON)
	_fill_rect(img, 46, 4, 14, 12, IRON)
	_ellipse(img, 34, 6, 4, 4, LEAF)
	return img


func _try_swap_far() -> void:
	var parent := get_parent()
	if parent == null:
		return
	var far := parent.get_node_or_null("FarSky") as Sprite2D
	if far == null:
		return
	var path := "res://assets/backgrounds/biome_2/far.png"
	if ResourceLoader.exists(path):
		far.texture = load(path) as Texture2D
