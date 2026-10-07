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
			var variation := float((row * 7 + column * 3) % 7) * 0.015
			var material := stone.lightened(variation)
			draw_rect(face, material)
			# Warm upper bevel and cool lower recess tie the masonry to the
			# relief lighting in the Gothic facade kit. All detail stays in face.
			if face.size.y > 8.0:
				draw_rect(Rect2(left,top+2.0,face.size.x,2.0),material.lightened(0.06))
				draw_rect(Rect2(left,bottom-5.0,face.size.x,4.0),material.darkened(0.12))
			if face.size.x > 8.0:
				draw_rect(Rect2(right-3.0,top,2.0,face.size.y),material.darkened(0.14))
			draw_line(face.position, Vector2(right, top), material.lightened(0.14), 1.0)
			draw_line(Vector2(left, bottom-1.0), Vector2(right, bottom-1.0), stone.darkened(0.3), 1.0)
			if face.size.x > 18.0 and face.size.y > 12.0:
				for fleck in range(5):
					var fx := left+4.0+float((row*17+column*29+fleck*13)%int(face.size.x-8.0))
					var fy := top+4.0+float((row*11+column*7+fleck*9)%int(face.size.y-8.0))
					draw_rect(Rect2(fx,fy,2.0,1.0),material.lightened(0.08) if fleck%2==0 else material.darkened(0.1))
			# Sparse, deterministic wear belongs to the brick, never beyond its face.
			if (row*13+column*7)%11 == 0 and face.size.x > 16.0 and face.size.y > 12.0:
				var crack := Vector2(left+face.size.x*0.6, top+4.0)
				draw_line(crack, crack+Vector2(-3.0, 5.0), stone.darkened(0.35), 1.0)
				draw_line(crack+Vector2(-3.0,5.0), crack+Vector2(1.0,9.0), stone.darkened(0.35), 1.0)
