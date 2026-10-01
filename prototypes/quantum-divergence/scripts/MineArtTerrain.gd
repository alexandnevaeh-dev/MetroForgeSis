extends RefCounted
## Textured microcell raster follows authoritative matter. Presentation cannot add solids.
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Contact = preload("res://scripts/MaterialContact.gd")
const MAX_SWATCHES: int = 4096
var grid
var tiles: Dictionary
var swatches: Dictionary = {}

func _init(material_grid, material_tiles: Dictionary) -> void:
	grid = material_grid
	tiles = material_tiles

func revisions(chunk: Vector2i) -> Array:
	# Face shading must refresh when a neighboring chunk changes, including seams.
	var values: Array = [grid.render_epoch]
	for offset in [Vector2i.ZERO,Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]: values.append(grid.render_revisions.get(chunk+offset,0))
	return values

func _swatch(name: String, x: int, y: int, faces: int, heat: int) -> Image:
	var key: String = "%s:%d:%d:%d:%d" % [name,x%8,y%8,faces,heat]
	if swatches.has(key): return swatches[key]
	var texture: Image = tiles[name]
	var image := texture.get_region(Rect2i((x%8)*4,(y%8)*4,4,4))
	if faces & 1: image.fill_rect(Rect2i(0,0,4,1),Color("9ab6c8") if name == "catwalk" else Color("627a94"))
	if faces & 2: image.fill_rect(Rect2i(0,3,4,1),Color("18263d"))
	if faces & 4: image.fill_rect(Rect2i(0,0,1,4),Color("21334b"))
	if faces & 8: image.fill_rect(Rect2i(3,0,1,4),Color("536a85"))
	if heat > 0 or name == "fluid":
		for iy in 4:
			for ix in 4:
				var color := image.get_pixel(ix,iy)
				if heat > 0: color = color.lerp(Color("ff8c4f"),float(heat)/15.0)
				if name == "fluid": color.a = .82
				image.set_pixel(ix,iy,color)
	if swatches.size() < MAX_SWATCHES: swatches[key] = image
	return image

func raster(chunk: Vector2i) -> Image:
	var result := Image.create(128,128,false,Image.FORMAT_RGBA8)
	var origin: Vector2i = chunk*32
	for y in 32:
		for x in 32:
			var wx: int = origin.x+x
			var wy: int = origin.y+y
			if not grid.in_bounds(wx,wy): continue
			var index: int = wy*grid.width+wx
			var material: int = grid.cells[index]
			if material == Grid.CellMaterial.EMPTY: continue
			var name: String = "bedrock-a" if (wx/8+wy/8)%2 == 0 else "bedrock-b"
			if material == Grid.CellMaterial.SOLID and grid.immutable[index] == 1: name = "catwalk"
			elif material == Grid.CellMaterial.UNSTABLE_ORE: name = "ore"
			elif material == Grid.CellMaterial.SAND: name = "sand"
			elif material == Grid.CellMaterial.FLUID: name = "fluid"
			var faces: int = 0
			if Contact.solid(material):
				if not Contact.solid(grid.material_at(wx,wy-1)): faces |= 1
				if not Contact.solid(grid.material_at(wx,wy+1)): faces |= 2
				if not Contact.solid(grid.material_at(wx-1,wy)): faces |= 4
				if not Contact.solid(grid.material_at(wx+1,wy)): faces |= 8
			var heat: int = clampi(roundi(grid.heat[index]*15.0),0,15)
			result.blit_rect(_swatch(name,wx,wy,faces,heat),Rect2i(0,0,4,4),Vector2i(x*4,y*4))
	return result
