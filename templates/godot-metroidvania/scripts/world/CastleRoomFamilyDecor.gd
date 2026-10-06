extends Node2D
## Original modular castle study; all props are behind the actor and noncolliding.
@export var room_id: String
var plan: Dictionary = {}
var atlas: Dictionary = {}

func _ready() -> void:
	var path := "res://data/visual/castle-room-families.json"
	if not FileAccess.file_exists(path):
		return
	plan = JSON.parse_string(FileAccess.get_file_as_string(path)).rooms.get(room_id, {})
	if plan.is_empty():
		return
	var atlas_path := "res://assets/architecture/stormglass-room-family/atlas.json"
	if FileAccess.file_exists(atlas_path):
		atlas = JSON.parse_string(FileAccess.get_file_as_string(atlas_path)).regions
	var background := get_parent().get_node_or_null("Background") as CanvasItem
	if background:
		background.visible = false
	var wall := ColorRect.new()
	wall.size = Vector2(float(plan.width), float(plan.height))
	wall.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wall.z_index = -35
	var material := ShaderMaterial.new()
	material.shader = load("res://scripts/world/CastleRegionMasonry.gdshader")
	material.set_shader_parameter("region_size", wall.size)
	wall.material = material
	add_child(wall)
	for level in range(plan.floors.size()):
		var floor_y := float(plan.floors[level])
		for x in range(1920, int(plan.width) - 256, 512):
			var supported := level == 0
			for rect: Dictionary in plan.platforms:
				if rect.y == floor_y and x - 128 >= rect.x and x + 128 <= rect.x + rect.width:
					supported = true
			if supported:
				place("arch", Vector2(x, floor_y), Vector2(1.5, 1.5))
				place("sconce", Vector2(x - 160, floor_y - 224), Vector2.ONE)
				var motif: String = {"gallery":"banner", "chapel":"window", "library":"shelf", "arena":"weapon_rack", "crypt":"sarcophagus", "laboratory":"apparatus", "mine":"support", "entrance":"statue"}.get(plan.family, "banner")
				place(motif, Vector2(x, floor_y), Vector2.ONE)
				if plan.family == "chapel":
					place("bell", Vector2(x + 192, floor_y - 256), Vector2.ONE)
	queue_redraw()

func place(asset: String, anchor: Vector2, size: Vector2) -> void:
	var sprite := Sprite2D.new()
	sprite.name = asset + "_" + str(get_child_count())
	if atlas.has(asset):
		var entry: Dictionary = atlas[asset]
		var rect: Array = entry.rect
		sprite.texture = load("res://assets/architecture/stormglass-room-family/architecture-atlas.png")
		sprite.region_enabled = true
		sprite.region_rect = Rect2(float(rect[0]), float(rect[1]), float(rect[2]), float(rect[3]))
		size = Vector2.ONE * (float(entry.worldHeight) / float(rect[3]))
	elif asset == "arch":
		sprite.texture = load("res://assets/architecture/stormglass/grand_arch.png")
		size = Vector2.ONE * (384.0 / sprite.texture.get_height())
	else:
		sprite.texture = load("res://assets/architecture/stormglass-room-family/" + asset + ".svg")
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sprite.scale = size
	var source_height: float = sprite.region_rect.size.y if sprite.region_enabled else sprite.texture.get_height()
	sprite.position = anchor - Vector2(0, source_height * size.y / 2)
	sprite.z_index = -12
	add_child(sprite)

func _draw() -> void:
	if plan.is_empty():
		return
	for rect: Dictionary in plan.platforms:
		if rect.width > 256 and rect.height == 32:
			draw_rect(Rect2(float(rect.x), float(rect.y) + 32, float(rect.width), 24), Color("1b2533"))
			draw_line(Vector2(float(rect.x), float(rect.y)), Vector2(float(rect.x + rect.width), float(rect.y)), Color("8293a1"), 4)
