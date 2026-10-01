extends SceneTree
const ChunkGrid = preload("res://scripts/ChunkedGrid.gd")
const Grid = preload("res://scripts/MicrocellGrid.gd")
const Terrain = preload("res://scripts/MineArtTerrain.gd")
var passed: int = 0
var failed: int = 0
var tiles: Dictionary = {}

func check(value: bool, label: String) -> void:
	passed += int(value)
	failed += int(not value)
	print(("PASS " if value else "FAIL ")+label)

func _initialize() -> void:
	for name in ["bedrock-a","bedrock-b","catwalk","ore","sand","fluid"]:
		var image := Image.load_from_file("res://assets/mine-kit-candidate-v1/"+name+".png")
		assert(image != null)
		image.resize(32,32,Image.INTERPOLATE_NEAREST)
		tiles[name] = image
	call_deferred("run_tests")

func matches_cells(grid, image: Image, chunk: Vector2i) -> bool:
	for y in 128:
		for x in 128:
			var material: int = grid.material_at(chunk.x*32+x/4,chunk.y*32+y/4)
			if (image.get_pixel(x,y).a > 0) != (material != Grid.CellMaterial.EMPTY): return false
	return true

func run_tests() -> void:
	var grid = ChunkGrid.new(64,64,42)
	var terrain = Terrain.new(grid,tiles)
	var materials: Array[int] = [Grid.CellMaterial.SOLID,Grid.CellMaterial.UNSTABLE_ORE,Grid.CellMaterial.SAND,Grid.CellMaterial.FLUID]
	for index in materials.size():
		var x: int = 4+index*4
		assert(grid.set_material(x,10,materials[index]))
		var before: PackedByteArray = grid.cells.duplicate()
		var image := terrain.raster(Vector2i.ZERO)
		check(matches_cells(grid,image,Vector2i.ZERO),"material "+str(materials[index])+" raster exactly follows all 16384 pixel/cell memberships")
		check(grid.cells == before,"material "+str(materials[index])+" drawing never changes authoritative matter")
		check(image.get_pixel(x*4,40).a > 0,"material "+str(materials[index])+" appears inside its occupied cell")
		assert(grid.set_material(x,10,Grid.CellMaterial.EMPTY))
		check(terrain.raster(Vector2i.ZERO).get_pixel(x*4,40).a == 0,"material "+str(materials[index])+" disappears after actual removal")
	assert(grid.add_heat(10,15,.8))
	check(terrain.raster(Vector2i.ZERO).get_pixel(40,60).a == 0,"empty heated matter cannot become a phantom visible platform")
	assert(grid.set_material(31,20,Grid.CellMaterial.SOLID))
	var exposed := terrain.raster(Vector2i.ZERO).get_pixel(127,81)
	var revision: Array = terrain.revisions(Vector2i.ZERO)
	assert(grid.set_material(32,20,Grid.CellMaterial.SOLID))
	check(terrain.revisions(Vector2i.ZERO) != revision,"adjacent chunk mutation invalidates boundary face shading")
	var enclosed := terrain.raster(Vector2i.ZERO).get_pixel(127,81)
	check(exposed != enclosed,"shared chunk edge loses its exposed bevel when actual neighbor matter appears")
	assert(grid.set_material(32,20,Grid.CellMaterial.EMPTY))
	check(terrain.raster(Vector2i.ZERO).get_pixel(127,81) == exposed,"destroyed neighbor restores the exact exposed boundary face")
	assert(grid.set_material(25,20,Grid.CellMaterial.SOLID,true))
	var protected := terrain.raster(Vector2i.ZERO)
	check(not grid.set_material(25,20,Grid.CellMaterial.EMPTY),"protected support refuses actual removal")
	check(terrain.raster(Vector2i.ZERO).get_data() == protected.get_data(),"rejected protected edit leaves the displayed support unchanged")
	var protected_color := terrain.raster(Vector2i.ZERO).get_pixel(100,81)
	check(not grid.add_heat(25,20,.8),"protected support refuses heat according to the existing simulation rules")
	check(terrain.raster(Vector2i.ZERO).get_pixel(100,81) == protected_color,"rejected protected heat leaves its displayed support unchanged")
	assert(grid.set_material(24,20,Grid.CellMaterial.SOLID))
	var before_heat := terrain.raster(Vector2i.ZERO).get_pixel(96,81)
	assert(grid.add_heat(24,20,.8))
	check(terrain.raster(Vector2i.ZERO).get_pixel(96,81) != before_heat,"real heat changes mutable material's color")
	check(matches_cells(grid,terrain.raster(Vector2i.ZERO),Vector2i.ZERO),"heat, protected support and chunk edges preserve exact material membership")
	check(terrain.swatches.size() <= Terrain.MAX_SWATCHES,"material swatch cache stays within its explicit memory cap")
	print("QUANTUM_MINE_ART_TERRAIN_RESULTS "+JSON.stringify({"passed":passed,"failed":failed,"scope":"Authoritative matter raster, destruction, protected supports, chunk seam updates, heat and bounded presentation cache"}))
	quit(0 if failed == 0 else 1)
