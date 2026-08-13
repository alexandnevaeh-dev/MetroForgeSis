extends Node2D
## Loads generated overworld/dungeon areas from data/world/overworld.json and Y-sorts entities.

const PLAYER_SCENE := preload("res://scenes/player/Player.tscn")
const ENEMY_SCENE := preload("res://scenes/enemies/Enemy.tscn")
const BOSS_SCENE := preload("res://scenes/bosses/Boss.tscn")
const NPC_SCENE := preload("res://scenes/world/NPC.tscn")
const SAVE_SCENE := preload("res://scenes/world/SavePoint.tscn")

var _overworld: Dictionary = {}
var _current_area_id: String = ""
var _area_root: Node2D
var _entities: Node2D
var _player: Node2D
var _transitioning := false

func _ready() -> void:
	add_to_group("world_manager")
	y_sort_enabled = true
	_load_overworld()
	_area_root = Node2D.new()
	_area_root.name = "AreaRoot"
	_area_root.y_sort_enabled = true
	add_child(_area_root)
	var resume := GameManager.current_room_id if GameManager.current_room_id != "" else String(_overworld.get("startAreaId", "overworld"))
	load_area(resume)

func _load_overworld() -> void:
	var path := "res://data/world/overworld.json"
	if not FileAccess.file_exists(path):
		return
	var file := FileAccess.open(path, FileAccess.READ)
	var json := JSON.new()
	if json.parse(file.get_as_text()) == OK:
		_overworld = json.data
	file.close()

func transition_to_room(room_id: String, _spawn_side: String = "left") -> void:
	load_area(room_id)

func load_area(area_id: String) -> void:
	if _transitioning or area_id.is_empty():
		return
	_transitioning = true
	for child in _area_root.get_children():
		child.queue_free()
	await get_tree().process_frame

	var area := _find_area(area_id)
	if area.is_empty():
		_transitioning = false
		return

	_current_area_id = area_id
	GameManager.current_room_id = area_id
	EventBus.room_entered.emit(area_id)
	EventBus.room_discovered.emit(area_id)

	_entities = Node2D.new()
	_entities.name = "Entities"
	_entities.y_sort_enabled = true
	_area_root.add_child(_entities)

	_build_ground(area)
	_build_collision(area)
	_spawn_pois(area)

	var bounds := Rect2(Vector2.ZERO, Vector2(float(area.get("widthTiles", 16)) * float(area.get("tileSize", 16)), float(area.get("heightTiles", 12)) * float(area.get("tileSize", 16))))
	if _player and _player.has_node("Camera2D"):
		var cam = _player.get_node("Camera2D")
		if cam.has_method("set_map_bounds"):
			cam.set_map_bounds(bounds)
		cam.make_current()

	_transitioning = false

func _find_area(area_id: String) -> Dictionary:
	for area in _overworld.get("areas", []):
		if String(area.get("id", "")) == area_id:
			return area
	return {}

func _build_ground(area: Dictionary) -> void:
	var tile_size := float(area.get("tileSize", 16))
	var ground := ColorRect.new()
	ground.color = Color(0.22, 0.38, 0.22, 1) if String(area.get("kind", "")) == "overworld" else Color(0.28, 0.24, 0.2, 1)
	ground.size = Vector2(float(area.get("widthTiles", 16)) * tile_size, float(area.get("heightTiles", 12)) * tile_size)
	ground.z_index = -8
	_area_root.add_child(ground)

func _build_collision(area: Dictionary) -> void:
	var body := StaticBody2D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	_area_root.add_child(body)
	for rect in area.get("collisionRects", []):
		var shape := RectangleShape2D.new()
		shape.size = Vector2(float(rect.get("w", 16)), float(rect.get("h", 16)))
		var node := CollisionShape2D.new()
		node.shape = shape
		node.position = Vector2(float(rect.get("x", 0)), float(rect.get("y", 0))) + shape.size * 0.5
		body.add_child(node)
		var visual := ColorRect.new()
		visual.color = Color(0.12, 0.14, 0.18, 1)
		visual.position = Vector2(float(rect.get("x", 0)), float(rect.get("y", 0)))
		visual.size = shape.size
		visual.z_index = -4
		_area_root.add_child(visual)

func _spawn_pois(area: Dictionary) -> void:
	for poi in area.get("pois", []):
		var kind := String(poi.get("kind", ""))
		var pos := Vector2(float(poi.get("x", 0)), float(poi.get("y", 0)))
		match kind:
			"spawn":
				_ensure_player(pos)
			"npc":
				var npc := NPC_SCENE.instantiate()
				npc.position = pos
				if npc.get("npc_id") != null:
					npc.npc_id = String(poi.get("metadata", {}).get("npcId", "npc_000"))
				_entities.add_child(npc)
			"chest":
				var chest := ChestPickup.new()
				chest.position = pos
				chest.item_id = String(poi.get("metadata", {}).get("itemId", "scrap"))
				chest.chest_id = String(poi.get("id", ""))
				_entities.add_child(chest)
			"save":
				var save_pt := SAVE_SCENE.instantiate()
				save_pt.position = pos
				_entities.add_child(save_pt)
			"dungeon_entrance":
				var portal := AreaPortal.new()
				portal.position = pos
				portal.target_area_id = String(poi.get("metadata", {}).get("targetAreaId", "overworld"))
				_entities.add_child(portal)
			"enemy":
				var enemy := ENEMY_SCENE.instantiate()
				enemy.position = pos
				_entities.add_child(enemy)
			"boss":
				var boss := BOSS_SCENE.instantiate()
				boss.position = pos
				_entities.add_child(boss)
			"locked_door":
				var door := LockedDoor.new()
				door.position = pos
				door.key_id = String(poi.get("metadata", {}).get("keyId", "rusted_key"))
				door.target_area_id = String(poi.get("metadata", {}).get("targetAreaId", ""))
				door.door_id = String(poi.get("id", ""))
				_entities.add_child(door)
			"switch":
				var sw := FloorSwitch.new()
				sw.position = pos
				sw.opens_door_id = String(poi.get("metadata", {}).get("opensDoorId", ""))
				_entities.add_child(sw)
			"item_gate":
				var gate := ItemGate.new()
				gate.position = pos
				gate.item_id = String(poi.get("metadata", {}).get("itemId", "wind_disc"))
				_entities.add_child(gate)
			"victory":
				var shrine := VictoryShrine.new()
				shrine.position = pos
				_entities.add_child(shrine)
	if _player == null:
		_ensure_player(Vector2(64, 64))

func _ensure_player(pos: Vector2) -> void:
	if _player and is_instance_valid(_player):
		_player.position = pos
		return
	_player = PLAYER_SCENE.instantiate()
	_player.position = pos
	_entities.add_child(_player)
