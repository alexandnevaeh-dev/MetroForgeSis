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
	var run := absf(finish.x-start.x)
	if run < 1.0:
		return
	# Courses follow the actual flight length, including short service-well
	# segments. Detail is original relief work, not repeated facade images.
	var face := stone.lerp(Color("a8a596"),0.30)
	var recess := stone.darkened(0.65)
	var edge := Color("c7c4ac")
	draw_colored_polygon(PackedVector2Array([start,finish,finish+Vector2(0,thickness),start+Vector2(0,thickness)]),recess)
	var courses := maxi(1,int(ceil(run/48.0)))
	for block in range(courses):
		var a := start.lerp(finish,float(block)/courses)+Vector2(0,2)
		var b := start.lerp(finish,float(block+1)/courses)+Vector2(0,2)
		var tone := face.lightened(float((block*7+int(start.y))%5)*0.018)
		var lower := Vector2(0,thickness-4)
		draw_colored_polygon(PackedVector2Array([a,b,b+lower,a+lower]),tone)
		draw_line(a,b,tone.lightened(0.22),2.0)
		draw_line(a+lower,b+lower,recess,2.0)
		draw_line(a,a+lower,recess,2.0)
		# Recessed ashlar boss and a small diamond echo the floor's carved panels.
		var inset_a := a.lerp(b,0.12)+Vector2(0,7)
		var inset_b := a.lerp(b,0.88)+Vector2(0,7)
		var relief := Vector2(0,maxf(4.0,thickness-18.0))
		draw_colored_polygon(PackedVector2Array([inset_a,inset_b,inset_b+relief,inset_a+relief]),tone.darkened(0.18))
		draw_line(inset_a,inset_b,edge.darkened(0.25),1.0)
		draw_line(inset_a+relief,inset_b+relief,recess,1.0)
		var centre := (inset_a+inset_b+relief)*0.5
		draw_colored_polygon(PackedVector2Array([centre+Vector2(0,-4),centre+Vector2(4,0),centre+Vector2(0,4),centre+Vector2(-4,0)]),trim.darkened(0.25))
		draw_line(centre+Vector2(-3,0),centre+Vector2(0,-3),edge.darkened(0.1),1.0)
		for grain in range(3):
			var p := a.lerp(b,float(grain+1)/4.0)+Vector2(0,4.0+float((block+grain*3)%3))
			draw_rect(Rect2(p,Vector2(2,1)),tone.darkened(0.24))
	# Fixed world-space tread width retains stone scale on split flights.
	# At the authored 192/720 pitch, each top stays within 3px of collision.
	var treads := maxi(1,int(ceil(run/22.0)))
	for step in range(treads):
		var a := start.lerp(finish,float(step)/treads)
		var b := start.lerp(finish,float(step+1)/treads)
		var y := (a.y+b.y)*0.5
		var left := minf(a.x,b.x)
		var width := absf(b.x-a.x)
		draw_rect(Rect2(left,y,width,8.0),face.lightened(0.15))
		draw_rect(Rect2(left,y+1,width,2.0),edge.darkened(0.14))
		draw_line(Vector2(left,y),Vector2(left+width,y),edge,1.0)
		draw_line(Vector2(left,y+7),Vector2(left+width,y+7),recess,2.0)
		draw_line(Vector2(left+width-1,y+2),Vector2(left+width-1,y+6),face.darkened(0.3),1.0)
	draw_line(start+Vector2(0,thickness-5),finish+Vector2(0,thickness-5),trim.darkened(0.2),2.0)
	# Banded newels and metal balusters end at each real segment, preserving
	# the readable opening of the service well. They never add collision.
	draw_line(start-Vector2(0,40),finish-Vector2(0,40),recess,4.0)
	draw_line(start-Vector2(0,40),finish-Vector2(0,40),trim,2.0)
	var posts := maxi(2,int(ceil(run/80.0)))
	for support in range(posts+1):
		var p := start.lerp(finish,float(support)/posts)
		draw_line(p+Vector2(0,2),p-Vector2(0,40),recess,4.0)
		draw_line(p,p-Vector2(0,40),trim.darkened(0.15),2.0)
		draw_rect(Rect2(p-Vector2(3,3),Vector2(6,3)),edge.darkened(0.3))
		draw_rect(Rect2(p-Vector2(3,29),Vector2(6,3)),trim)
		draw_circle(p-Vector2(0,42),3.0,trim.darkened(0.2))
		draw_rect(Rect2(p-Vector2(1,44),Vector2(2,2)),edge)
