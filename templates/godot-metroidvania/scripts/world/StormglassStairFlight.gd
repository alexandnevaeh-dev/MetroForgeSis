extends Node2D
@export var start := Vector2.ZERO
@export var finish := Vector2.ZERO
@export var thickness := 32.0
var stone := Color("46516b")
var trim := Color("a99467")
var _active_flight := 0
var _last_actor_id := 0

func _ready() -> void:
	process_physics_priority = -50
	set_physics_process(String(get_parent().name) == "StairFlight_0")

## Switchback flights overlap in the side-view projection. Select the floor
## under the feet and omit other flight bodies from this actor's collision,
## so the next flight cannot become a low ceiling over the current passage.
## Player movement remains CharacterBody2D physics; no position assignment.
func _physics_process(_delta: float) -> void:
	var room := get_parent().get_parent()
	var player := room.get_node_or_null("Player") as CharacterBody2D
	if player == null:
		return
	# The broad entry balcony overlaps the last flight in projection. Keep its
	# solid landing available from above, and clear it while climbing underneath.
	var balcony := room.get_node_or_null("Platform_7") as StaticBody2D
	if balcony:
		var shape := balcony.get_node("CollisionShape2D") as CollisionShape2D
		var floor_y: float = balcony.position.y-shape.shape.size.y*0.5
		if player.position.y > floor_y+8.0:
			player.add_collision_exception_with(balcony)
		else:
			player.remove_collision_exception_with(balcony)
	var direction := Input.get_axis("move_left","move_right")
	var descending := Input.is_action_pressed("move_down")
	var best := INF
	var selected := _active_flight
	for index in range(7):
		var body := room.get_node_or_null("StairFlight_"+str(index)) as StaticBody2D
		if body == null:
			continue
		var face = body.get_node("StoneFlight")
		var a: Vector2 = face.start
		var b: Vector2 = face.finish
		if player.position.x < minf(a.x,b.x)-64.0 or player.position.x > maxf(a.x,b.x)+64.0:
			continue
		var y := lerpf(a.y,b.y,(player.position.x-a.x)/(b.x-a.x))
		var score := absf(player.position.y-y)
		if direction == 0 and index == _active_flight and score < 20.0:
			score -= 8.0
		var flight_direction := signf(a.x-b.x) if descending else signf(b.x-a.x)
		if score < 20.0 and direction != 0 and flight_direction==direction:
			score -= 8.0
		if score < best:
			best = score
			selected = index
	if selected == _active_flight and _last_actor_id == player.get_instance_id():
		return
	_active_flight = selected
	_last_actor_id = player.get_instance_id()
	for index in range(7):
		var body := room.get_node_or_null("StairFlight_"+str(index)) as StaticBody2D
		if body:
			if index == _active_flight:
				player.remove_collision_exception_with(body)
			else:
				player.add_collision_exception_with(body)
func _draw() -> void:
	draw_colored_polygon(PackedVector2Array([start,finish,finish+Vector2(0,thickness),start+Vector2(0,thickness)]),stone.darkened(0.25))
	for block in range(16):
		var a := start.lerp(finish,float(block)/16.0)+Vector2(0,2)
		var b := start.lerp(finish,float(block+1)/16.0)+Vector2(0,2)
		var lower := Vector2(0,thickness-4)
		var tone := stone.lightened(float((block*7)%5)*0.025)
		draw_colored_polygon(PackedVector2Array([a,b,b+lower,a+lower]),tone)
		for grain in range(3):
			var p := a.lerp(b,float(grain+1)/4.0)+Vector2(0,8.0+float((block+grain*3)%4)*3.0)
			draw_line(p,p+Vector2(4.0,1.0),tone.darkened(0.16),1.0)
	draw_line(start,finish,stone.lightened(0.35),3.0)
	draw_line(start+Vector2(0,thickness),finish+Vector2(0,thickness),stone.darkened(0.55),3.0)
	draw_line(start+Vector2(0,thickness-5),finish+Vector2(0,thickness-5),trim.darkened(0.3),2.0)
	for step in range(1,16):
		var p := start.lerp(finish,float(step)/16.0)
		draw_line(p,p+Vector2(0,thickness),Color("293249"),2.0)
	# Shallow stone treads follow the smooth collision incline. Their centre
	# stays on that incline, keeping the visual rise within three world pixels.
	for step in range(32):
		var a := start.lerp(finish,float(step)/32.0)
		var b := start.lerp(finish,float(step+1)/32.0)
		var y := (a.y+b.y)*0.5
		var left := minf(a.x,b.x)
		var right := maxf(a.x,b.x)
		draw_rect(Rect2(left,y,right-left,8.0),stone.lightened(0.15))
		draw_line(Vector2(left,y),Vector2(right,y),stone.lightened(0.4),2.0)
		draw_line(Vector2(left,y+7),Vector2(right,y+7),stone.darkened(0.3),1.0)
	draw_line(start-Vector2(0,40),finish-Vector2(0,40),trim,2.0)
	for support in range(1,9):
		var p := start.lerp(finish,float(support)/9.0)
		draw_line(p,p-Vector2(0,40),Color("71664e"),2.0)
