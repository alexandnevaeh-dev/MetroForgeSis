extends Node2D

@export var start_room_id: String = "room_000"

const ROOM_WIDTH := 800
const SPAWN_MARGIN := 80

var _current_room: Node2D = null
var _room_data: Dictionary = {}
var _transitioning: bool = false

func _ready() -> void:
	add_to_group("world_manager")
	EventBus.room_entered.connect(_on_room_entered)
	_load_room_data()
	# SaveManager.load_game() (called from TitleScreen's Continue button, before this scene
	# is even loaded) sets GameManager.current_room_id to the checkpoint room. A fresh game
	# leaves it empty, so this correctly falls back to start_room_id.
	var resume_room_id := GameManager.current_room_id if GameManager.current_room_id != "" else start_room_id
	_load_room(resume_room_id, "left")

func _load_room_data() -> void:
	var path := "res://data/rooms/rooms.json"
	if FileAccess.file_exists(path):
		var file := FileAccess.open(path, FileAccess.READ)
		var json := JSON.new()
		if json.parse(file.get_as_text()) == OK:
			_room_data = json.data.get("rooms", {})
		file.close()

func _load_room(room_id: String, spawn_side: String = "left") -> void:
	if _current_room:
		_current_room.queue_free()
		_current_room = null

	var scene_path := "res://scenes/rooms/%s.tscn" % room_id
	if not ResourceLoader.exists(scene_path):
		push_warning("Room scene not found: %s" % scene_path)
		return

	var scene: PackedScene = load(scene_path)
	_current_room = scene.instantiate()
	add_child(_current_room)
	GameManager.current_room_id = room_id
	EventBus.room_entered.emit(room_id)

	var player := _current_room.get_node_or_null("Player")
	if player:
		_position_player_for_spawn(player, spawn_side)
		_move_camera_to_room(player)

func transition_to_room(room_id: String, spawn_side: String = "left") -> void:
	if _transitioning or room_id.is_empty():
		return
	_transitioning = true
	_load_room(room_id, spawn_side)
	_transitioning = false

func _position_player_for_spawn(player: Node2D, spawn_side: String) -> void:
	var floor_y := player.position.y
	match spawn_side:
		"right":
			player.position.x = ROOM_WIDTH - SPAWN_MARGIN
		"left":
			player.position.x = SPAWN_MARGIN
		"bottom":
			player.position.x = ROOM_WIDTH / 2.0
			player.position.y = floor_y
		"top":
			player.position.x = ROOM_WIDTH / 2.0
			player.position.y = 120.0
		_:
			player.position.x = SPAWN_MARGIN
	player.position.y = player.position.y if spawn_side in ["top", "bottom"] else floor_y

func _on_room_entered(room_id: String) -> void:
	var room_info: Dictionary = _room_data.get(room_id, {})
	if String(room_info.get("archetype", "")) == "boss":
		AudioManager.play_music("boss")
		return
	var biome_id: String = room_info.get("biomeId", "biome_0")
	AudioManager.play_music(biome_id)

func _move_camera_to_room(player: Node2D) -> void:
	var camera := player.get_node_or_null("Camera2D")
	if camera:
		camera.make_current()
