extends Node
func _ready() -> void:
	var body:=CharacterBody2D.new()
	body.collision_mask=1
	var collider:=CollisionShape2D.new()
	var shape:=RectangleShape2D.new()
	shape.size=Vector2(20,20)
	collider.shape=shape
	body.add_child(collider)
	add_child(body)
	await get_tree().physics_frame
	var bot:=PlaytestAgent.new()
	var start:=Time.get_ticks_msec()
	var path:=bot._plan_walk(body,Vector2(1000,0))
	print(JSON.stringify({"reachable":not path.is_empty(),"points":path.size(),"elapsedMs":Time.get_ticks_msec()-start}))
	get_tree().quit(0 if not path.is_empty() else 1)
