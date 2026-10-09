extends Node2D
## Original pixel-detail archive assets. Origin is the measured support surface.
## No physics bodies, scene paintings, imported reference art or gameplay state.
var dimensions := Vector2(288,224)
var kind := "book-recess"
const STONE := Color("3c485b")
const EDGE := Color("a9a99b")
const WOOD := Color("59412e")
const BRASS := Color("b5a16b")
const PAPER := Color("c6b895")

func _draw() -> void:
	var w := dimensions.x
	var h := dimensions.y
	draw_rect(Rect2(-w*0.48,-5,w*0.96,5),Color("0a101b"))
	match kind:
		"book-recess": _book_recess(w,h)
		"scribe-desk": _desk(w,h)
		"ledger-pedestal": _ledger(w,h)
		"scroll-cabinet": _cabinet(w,h)

func _panel(rect: Rect2, face: Color) -> void:
	draw_rect(rect,face.darkened(0.5))
	draw_rect(rect.grow(-3),face)
	draw_line(rect.position+Vector2(3,3),rect.position+Vector2(rect.size.x-3,3),face.lightened(0.3),2)
	draw_line(rect.position+Vector2(3,3),rect.position+Vector2(3,rect.size.y-3),face.lightened(0.12),1)
	draw_line(rect.end-Vector2(rect.size.x-3,3),rect.end-Vector2(3,3),face.darkened(0.25),2)
	if rect.size.x>32 and rect.size.y>14:
		for grain in range(3):
			var y := rect.position.y+7+float(grain)*maxf(2,(rect.size.y-14)/3)
			draw_line(Vector2(rect.position.x+7,y),Vector2(rect.end.x-7-float(grain%2)*9,y+1),face.darkened(0.12),1)

func _book_recess(w: float,h: float) -> void:
	var left := -w*0.5
	# The alcove owns one local recess. Material courses elsewhere remain continuous.
	_panel(Rect2(left,-h,w,h),STONE)
	draw_rect(Rect2(left+16,-h+20,w-32,h-36),Color("111824"))
	for side in [-1,1]:
		var pier_x := float(side)*(w*0.5-12)
		for row in range(int(ceil(h/32.0))):
			_panel(Rect2(pier_x-10,-minf(h,float(row+1)*32),20,minf(30,h-float(row)*32)),STONE.lightened(float(row%3)*0.04))
		_panel(Rect2(pier_x-18,-20,36,20),STONE)
	var arc := PackedVector2Array()
	for step in range(25):
		var angle := PI+float(step)*PI/24.0
		arc.append(Vector2(cos(angle)*(w*0.5-24),-h+72+sin(angle)*48))
	draw_polyline(arc,EDGE.darkened(0.28),8,false)
	draw_polyline(arc,BRASS.darkened(0.3),1,false)
	for tier in range(4):
		var shelf_y := -24-float(tier)*(h-100)/4
		_panel(Rect2(left+32,shelf_y,w-64,8),WOOD)
		_books(left+40,shelf_y,w-80,14+float(tier%2)*4,tier)
	# Supported moulded base, small central rune and paired low-glare wall lamps.
	_panel(Rect2(left+12,-14,w-24,14),STONE)
	for side in [-1,1]:
		_lamp(Vector2(float(side)*(w*0.5-40),-h+94))

func _books(left: float,floor_y: float,width: float,height: float,salt: int) -> void:
	var x := left
	var index := 0
	var colors := [Color("67504c"),Color("485c68"),Color("555946"),Color("795c3a"),Color("545064")]
	while x+12<left+width:
		var bw := 8.0+float((index*7+salt*3)%9)
		var bh := height-float((index*11+salt*7)%12)
		var color: Color = colors[(index+salt)%colors.size()]
		_panel(Rect2(x,floor_y-bh,bw,bh),color)
		draw_rect(Rect2(x+2,floor_y-bh+5,maxf(2,bw-4),2),BRASS.darkened(0.2))
		draw_rect(Rect2(x+2,floor_y-7,maxf(2,bw-4),2),BRASS.darkened(0.4))
		x += bw+2
		index += 1

func _desk(w: float,h: float) -> void:
	# Furniture uses a 48-world-pixel player baseline: a desk is below chest
	# height, while the archive envelope can remain several characters tall.
	var top := -h+8
	for side in [-1,1]:
		var leg := float(side)*(w*0.5-24)
		_panel(Rect2(leg-6,top+10,12,h-20),WOOD)
		_panel(Rect2(leg-16,-8,32,8),WOOD)
	_panel(Rect2(-w*0.5+12,top+7,w-24,10),WOOD)
	for x in [-w*0.25,0,w*0.25]:
		draw_circle(Vector2(x,top+12),2,BRASS)
	_panel(Rect2(-w*0.5,top,w,8),WOOD.lightened(0.16))
	# Open ledger has independent page edges, spine and original ink marks.
	_panel(Rect2(-24,top-7,48,7),Color("354451"))
	draw_rect(Rect2(-22,top-9,20,5),PAPER)
	draw_rect(Rect2(2,top-9,20,5),PAPER.darkened(0.07))
	for line in range(3):
		draw_line(Vector2(-18,top-8+line),Vector2(-7+line,top-8+line),Color("655d54"),1)
		draw_line(Vector2(6,top-8+line),Vector2(18-line,top-8+line),Color("655d54"),1)
	_panel(Rect2(w*0.25,top-7,7,7),Color("263a4b"))
	draw_line(Vector2(w*0.25+4,top-7),Vector2(w*0.25+10,top-21),PAPER,1)
	_lamp(Vector2(-w*0.32,top-12))

func _ledger(w: float,h: float) -> void:
	_panel(Rect2(-w*0.5,-16,w,16),STONE)
	_panel(Rect2(-w*0.24,-h+22,w*0.48,h-38),STONE)
	_panel(Rect2(-w*0.38,-h+14,w*0.76,14),WOOD)
	_panel(Rect2(-w*0.28,-h,w*0.56,18),Color("534850"))
	for y in range(3):
		draw_rect(Rect2(-w*0.23,-h+4+y*3,w*0.46,1),PAPER.darkened(0.2))
	draw_rect(Rect2(-4,-h+1,8,17),BRASS)
	for link in range(7):
		draw_circle(Vector2(6+float(link)*3,-h+14+float(link)*5),3,BRASS.darkened(0.15),false,1)
	_panel(Rect2(-9,-h+36,18,18),STONE.darkened(0.2))
	draw_line(Vector2(0,-h+39),Vector2(0,-h+50),BRASS,1)
	draw_line(Vector2(-5,-h+43),Vector2(5,-h+46),BRASS,1)

func _cabinet(w: float,h: float) -> void:
	_panel(Rect2(-w*0.5,-h,w,h),WOOD)
	for row in range(4):
		for column in range(4):
			var cell := Rect2(-w*0.5+12+float(column)*(w-24)/4,-h+16+float(row)*(h-32)/4,(w-24)/4-6,(h-32)/4-7)
			_panel(cell,WOOD.darkened(0.35))
			for roll in range(3):
				var center := cell.position+Vector2(12+float(roll)*(cell.size.x-20)/3,cell.size.y*0.6)
				draw_circle(center,6,PAPER.darkened(float((row+column+roll)%3)*0.07))
				draw_circle(center,3,WOOD.lightened(0.12),false,1)
	_panel(Rect2(-w*0.5-4,-18,w+8,18),WOOD.lightened(0.1))
	_panel(Rect2(-w*0.5-4,-h-8,w+8,12),WOOD.lightened(0.1))

func _lamp(at: Vector2) -> void:
	draw_circle(at,18,Color(0.76,0.47,0.18,0.045))
	draw_circle(at,11,Color(0.86,0.57,0.23,0.06))
	draw_rect(Rect2(at-Vector2(4,4),Vector2(8,12)),BRASS.darkened(0.25))
	draw_rect(Rect2(at-Vector2(2,3),Vector2(4,7)),Color("e9bf76"))
	draw_line(at+Vector2(-7,8),at+Vector2(7,8),BRASS,2)
