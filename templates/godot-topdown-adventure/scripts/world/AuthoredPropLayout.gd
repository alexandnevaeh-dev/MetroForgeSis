extends RefCounted
## Optional authored image layout. Collision rectangles are relative to the ground anchor
## in source-image pixels. Empty rectangles explicitly mean no collision.
static func _number(value: Variant) -> bool:
	return (typeof(value) == TYPE_INT or typeof(value) == TYPE_FLOAT) and is_finite(float(value))

static func validate(data: Dictionary, image_size: Vector2) -> String:
	if data.get("version") != 1:
		return "Unsupported prop layout version"
	var size: Variant = data.get("sourceSize")
	var anchor: Variant = data.get("anchorPx")
	if not size is Array or size.size() != 2 or not _number(size[0]) or not _number(size[1]):
		return "Invalid source size"
	if Vector2(float(size[0]), float(size[1])) != image_size:
		return "Source size does not match texture"
	if not anchor is Array or anchor.size() != 2 or not _number(anchor[0]) or not _number(anchor[1]):
		return "Invalid ground anchor"
	if float(anchor[0]) < 0 or float(anchor[1]) < 0 or float(anchor[0]) > image_size.x or float(anchor[1]) > image_size.y:
		return "Ground anchor outside image"
	var factor: Variant = data.get("displayScale")
	if not _number(factor) or float(factor) <= 0 or float(factor) > 4:
		return "Invalid display scale"
	var rects: Variant = data.get("collisionRectsPx")
	if not rects is Array or rects.size() > 16:
		return "Invalid collision rectangles"
	for rect: Variant in rects:
		if not rect is Dictionary:
			return "Invalid collision rectangle"
		for key in ["x", "y", "width", "height"]:
			if not _number(rect.get(key)):
				return "Invalid collision coordinate"
		if float(rect.width) <= 0 or float(rect.height) <= 0:
			return "Empty collision rectangle"
		if abs(float(rect.x)) + float(rect.width) > image_size.x * 2 or abs(float(rect.y)) + float(rect.height) > image_size.y * 2:
			return "Collision rectangle exceeds layout bounds"
	return ""

static func create(texture: Texture2D, data: Dictionary) -> Node2D:
	if texture == null or not validate(data, texture.get_size()).is_empty():
		return null
	var prop := Node2D.new()
	prop.scale = Vector2.ONE * float(data.displayScale)
	var sprite := Sprite2D.new()
	sprite.name = "Artwork"
	sprite.texture = texture
	sprite.centered = false
	sprite.position = -Vector2(float(data.anchorPx[0]), float(data.anchorPx[1]))
	prop.add_child(sprite)
	if not data.collisionRectsPx.is_empty():
		var body := StaticBody2D.new()
		body.name = "Footprints"
		body.collision_layer = 1
		body.collision_mask = 0
		for rect: Dictionary in data.collisionRectsPx:
			var shape := CollisionShape2D.new()
			var rectangle := RectangleShape2D.new()
			rectangle.size = Vector2(float(rect.width), float(rect.height))
			shape.shape = rectangle
			shape.position = Vector2(float(rect.x), float(rect.y)) + rectangle.size / 2
			body.add_child(shape)
		prop.add_child(body)
	return prop
