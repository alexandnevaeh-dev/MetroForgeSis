extends Node
func _ready() -> void:
	var player:=CharacterBody2D.new()
	player.collision_mask=1
	var shape:=CollisionShape2D.new()
	var rect:=RectangleShape2D.new()
	rect.size=Vector2(20,20)
	shape.shape=rect
	player.add_child(shape)
	add_child(player)
	for box in [Rect2(-50,-50,100,10),Rect2(-50,40,100,10),Rect2(-50,-40,10,80),Rect2(40,-40,10,80)]:
		var wall:=StaticBody2D.new()
		wall.position=box.position+box.size/2
		var collider:=CollisionShape2D.new()
		var wall_shape:=RectangleShape2D.new()
		wall_shape.size=box.size
		collider.shape=wall_shape
		wall.add_child(collider)
		add_child(wall)
	await get_tree().physics_frame
	await get_tree().physics_frame
	var bot:=PlaytestAgent.new()
	var path:=bot._plan_walk(player,Vector2(200,0))
	var passed:=path.is_empty() and player.position==Vector2.ZERO
	print("BLOCKED_ROUTE_REJECTED="+str(passed))
	get_tree().quit(0 if passed else 1)
