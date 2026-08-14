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

## Public accessor for PlaytestAgent.gd / other external inspectors — _entities is otherwise
## just GDScript's underscore-convention-private, not engine-enforced, but a real method here
## keeps callers from reaching into the manager's internals directly.
func get_current_entities() -> Node2D:
	return _entities

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
	var exits: Array = []
	var boss: Node = null
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
				exits.append(portal)
			"enemy":
				var enemy := ENEMY_SCENE.instantiate()
				enemy.position = pos
				_entities.add_child(enemy)
			"boss":
				var b := BOSS_SCENE.instantiate()
				b.position = pos
				b.boss_id = String(poi.get("metadata", {}).get("bossId", "boss_final"))
				_entities.add_child(b)
				boss = b
			"locked_door":
				var door := LockedDoor.new()
				door.position = pos
				door.key_id = String(poi.get("metadata", {}).get("keyId", "rusted_key"))
				door.target_area_id = String(poi.get("metadata", {}).get("targetAreaId", ""))
				door.door_id = String(poi.get("id", ""))
				_entities.add_child(door)
				exits.append(door)
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
	if boss:
		_lock_arena_exits(boss, exits)

## Classic boss-arena pattern: seal the room's own exits while its boss is alive, so neither a
## real player nor the free-roaming boss AI can carry someone out of an in-progress fight through
## the back door. Re-opens automatically on the boss's death signal.
func _lock_arena_exits(boss: Node, exits: Array) -> void:
	# Freshly-instantiated exits set monitoring = true in their own _ready() (AreaPortal.gd/
	# LockedDoor.gd), and add_child() defers _ready() on a node whose parent is already inside
	# the tree — it runs *after* this function's caller (_spawn_pois), not before. Locking here
	# synchronously would just get silently overwritten a moment later; wait a frame so every
	# exit's own _ready() has already run before this applies the lock on top of it.
	await get_tree().process_frame
	for exit in exits:
		if is_instance_valid(exit) and exit is Area2D:
			exit.monitoring = false
			exit.monitorable = false
	if not is_instance_valid(boss):
		return
	var health := boss.get_node_or_null("HealthComponent")
	if health and health.has_signal("died"):
		health.died.connect(func():
			# died fires from inside HurtboxComponent's own area_entered handling (the killing
			# blow's signal chain), and Godot rejects monitoring/monitorable writes made while
			# still inside an Area2D's in/out signal callback — set_deferred applies them right
			# after physics processing finishes instead of raising "blocked during in/out signal".
			for exit in exits:
				if is_instance_valid(exit) and exit is Area2D:
					exit.set_deferred("monitoring", true)
					exit.set_deferred("monitorable", true)
		)

func _ensure_player(pos: Vector2) -> void:
	if _player and is_instance_valid(_player):
		_player.position = pos
		return
	_player = PLAYER_SCENE.instantiate()
	_player.position = pos
	_entities.add_child(_player)
