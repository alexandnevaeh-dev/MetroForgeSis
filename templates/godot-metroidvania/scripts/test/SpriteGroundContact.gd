extends RefCounted
## Measure visible source pixels in actor-local space, not transparent cell bounds.
static func measure(sprite: AnimatedSprite2D) -> Dictionary:
	if sprite == null or sprite.sprite_frames == null or not sprite.sprite_frames.has_animation(sprite.animation):
		return {"valid":false}
	var texture := sprite.sprite_frames.get_frame_texture(sprite.animation,sprite.frame)
	if texture == null:
		return {"valid":false}
	var image := texture.get_image()
	if image == null or image.is_empty():
		return {"valid":false}
	if image.is_compressed() and image.decompress()!=OK:
		return {"valid":false}
	var bottom := -1
	for y in range(image.get_height()-1,-1,-1):
		for x in range(image.get_width()):
			# Ignore faint alpha residue; the sole must contain visible opaque pixels.
			if image.get_pixel(x,y).a>=0.5:
				bottom=y+1
				break
		if bottom>=0:
			break
	if bottom<0:
		return {"valid":false}
	var origin_y := float(image.get_height())*0.5 if sprite.centered else 0.0
	var contact := sprite.transform*Vector2(sprite.offset.x,sprite.offset.y+bottom-origin_y)
	return {"valid":true,"bottomY":contact.y,"opaqueBottom":bottom,"frameHeight":image.get_height()}

static func aligned(sprite: AnimatedSprite2D) -> bool:
	var measured := measure(sprite)
	return bool(measured.get("valid",false)) and float(measured.bottomY)>=-1.0 and float(measured.bottomY)<=6.0
