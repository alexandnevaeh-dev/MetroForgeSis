extends Node2D
## Brick faces occupy exactly their collision rectangle. Drawing commands avoid
## thousands of decorative nodes and cannot enlarge the playable geometry.
var dimensions := Vector2.ZERO
var stone := Color("46516b")
var roof := false

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, dimensions), Color("090c14"))
	var first_row := maxi(0,int(floor(dimensions.y/32.0))-3) if roof else 0
	for row in range(first_row,int(ceil(dimensions.y / 32.0))):
		var shift := -32.0 if row % 2 else 0.0
		for column in range(int(ceil(dimensions.x / 64.0)) + 1):
			var left := maxf(0.0, column * 64.0 + shift)
			var right := minf(dimensions.x, column * 64.0 + shift + 62.0)
			var top := row * 32.0
			var bottom := minf(dimensions.y, top + 30.0)
			if right <= left or bottom <= top:
				continue
			var face := Rect2(left, top, right-left, bottom-top)
			var variation := float((row * 7 + column * 3) % 5) * 0.025
			draw_rect(face, stone.lightened(variation))
			draw_line(face.position, Vector2(right, top), stone.lightened(0.2), 1.0)
			draw_line(Vector2(left, bottom-1.0), Vector2(right, bottom-1.0), stone.darkened(0.3), 1.0)
			# Sparse, deterministic wear belongs to the brick, never beyond its face.
			if (row*13+column*7)%11 == 0 and face.size.x > 16.0 and face.size.y > 12.0:
				var crack := Vector2(left+face.size.x*0.6, top+4.0)
				draw_line(crack, crack+Vector2(-3.0, 5.0), stone.darkened(0.35), 1.0)
				draw_line(crack+Vector2(-3.0,5.0), crack+Vector2(1.0,9.0), stone.darkened(0.35), 1.0)
