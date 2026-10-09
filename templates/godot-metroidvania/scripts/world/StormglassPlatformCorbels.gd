extends Node2D
## Original stone cantilevers attached to the rear wall beneath a flat landing.
## Their upper ledge meets the collision underside; they never add collision.
var span := 0.0
var stone := Color("526079")

func _draw() -> void:
	for center in [span * 0.2, span * 0.8]:
		var left: float = center - 12.0
		var right: float = center + 12.0
		var profile := PackedVector2Array([Vector2(left,0),Vector2(right,0),Vector2(right,12),Vector2(center+7,12),Vector2(center+7,23),Vector2(center+2,23),Vector2(center+2,34),Vector2(center-4,34),Vector2(left,48)])
		draw_colored_polygon(profile,stone)
		draw_line(Vector2(left+1,2),Vector2(right-1,2),stone.lightened(0.24),2.0)
		draw_line(Vector2(right-1,3),Vector2(right-1,11),stone.darkened(0.25),2.0)
		for step in [12.0,23.0,34.0]:
			var edge: float = center+7.0 if step==12.0 else center+2.0 if step==23.0 else center-4.0
			draw_line(Vector2(left+2,step),Vector2(edge,step),stone.darkened(0.3),1.0)
		draw_line(Vector2(left+3,5),Vector2(left+3,39),stone.lightened(0.07),1.0)
