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

	var boss := _current_room.get_node_or_null("Boss")
	if boss and boss.has_node("HealthComponent"):
		var health: HealthComponent = boss.get_node("HealthComponent")
		if health.is_alive():
			# Lock this room's exits — and let every RoomTransition's own deferred _ready() (see
			# _lock_room_exits) actually run — BEFORE announcing the room as loaded via
			# current_room_id/room_entered below. Anything reacting to those two (a real player's
			# UI, or an automated playtest bot that starts fighting the instant it observes
			# current_room_id match) must never be able to see a "loaded" boss room whose exits
			# aren't locked yet.
			await _lock_room_exits(_current_room, health)

	GameManager.current_room_id = room_id
	EventBus.room_entered.emit(room_id)

	var player := _current_room.get_node_or_null("Player")
	if player:
		_position_player_for_spawn(player, spawn_side)
		_move_camera_to_room(player)
		if has_node("/root/QualityPresentation"):
			QualityPresentation.apply_room(_current_room, room_id)

## Classic boss-arena pattern: seal the room's own RoomTransition triggers while its boss is
## alive, so nothing — a real player fumbling into an edge trigger mid-fight, or an automated
## playtest bot blindly walking straight at the boss's position every frame — can wander out of
## an in-progress fight and strand every reference this room's callers are holding (the room
## itself gets torn down and rebuilt with a brand new Player on any transition). Re-opens
## automatically on the boss's death signal.
func _lock_room_exits(room: Node, boss_health: HealthComponent) -> void:
	# RoomTransition._ready() (which is what actually adds it to the "room_transition" group)
	# is deferred for children of a node — this room — that's already inside the active
	# SceneTree by the time add_child() added it above, so the group is empty until the next
	# frame. Wait for it before trying to find and lock anything.
	await get_tree().process_frame
	var transitions := _room_transitions(room)
	for transition in transitions:
		transition.monitoring = false
	if not is_instance_valid(boss_health):
		return
	boss_health.died.connect(func() -> void:
		for transition in transitions:
			if is_instance_valid(transition):
				transition.monitoring = true
				# Enabling monitoring does not emit body_entered for a player already
				# standing in the door (e.g. crushed against a sealed exit as the boss dies).
				if transition.has_method("_on_body_entered"):
					for body in transition.get_overlapping_bodies():
						transition.call("_on_body_entered", body)
	, CONNECT_ONE_SHOT)

func _room_transitions(room: Node) -> Array:
	var result: Array = []
	for node in get_tree().get_nodes_in_group("room_transition"):
		if room.is_ancestor_of(node):
			result.append(node)
	return result

func transition_to_room(room_id: String, spawn_side: String = "left") -> void:
	if _transitioning or room_id.is_empty():
		return
	_transitioning = true
	var fader := get_node_or_null("TransitionFader")
	var skip_fade := has_node("/root/CombatFeedback") and CombatFeedback.is_automated_harness()
	if fader and fader.has_method("fade_out") and not skip_fade:
		await fader.fade_out(0.08)
	# This is called synchronously from RoomTransition's body_entered signal, which fires *during*
	# the physics server's own step — freeing the old room and add_child()-ing the new one from
	# here throws "Can't change this state while flushing queries" on the new room's own physics
	# nodes (one-way platforms, weak floors, its own RoomTransition triggers) configuring their
	# shapes in _ready(), because that's still nested inside the same physics flush. Waiting one
	# physics frame first moves the whole load outside it — real, reliably reproducible failure at
	# larger world sizes (more concurrent physics activity per step), not a cosmetic warning.
	await get_tree().physics_frame
	# _load_room is a coroutine now (it awaits the boss-room exit lock) — awaiting it here too
	# keeps _transitioning true for the room's *entire* load, not just its synchronous prefix,
	# so a second transition can't interleave with one that's still finishing.
	await _load_room(room_id, spawn_side)
	if fader and fader.has_method("fade_in") and not skip_fade:
		await fader.fade_in(0.08)
	_transitioning = false

func _current_room_width() -> float:
	if _current_room:
		var ground := _current_room.get_node_or_null("Ground")
		if ground != null and ground.get("room_width") != null:
			return float(ground.get("room_width"))
		var info: Dictionary = _room_data.get(GameManager.current_room_id, {})
		if typeof(info) == TYPE_DICTIONARY and info.has("width"):
			return float(info.get("width"))
	return float(ROOM_WIDTH)


func _current_floor_y(player: Node2D) -> float:
	if _current_room:
		var ground := _current_room.get_node_or_null("Ground")
		if ground != null and ground.get("room_height") != null and ground.get("tile_size") != null:
			var h := float(ground.get("room_height"))
			var ts := float(ground.get("tile_size"))
			if ts > 0.0:
				return floor((h - ts * 2.0) / ts) * ts
	return player.position.y


func _position_player_for_spawn(player: Node2D, spawn_side: String) -> void:
	var floor_y := _current_floor_y(player)
	var room_width := _current_room_width()
	match spawn_side:
		"right":
			player.position.x = room_width - SPAWN_MARGIN
		"left":
			player.position.x = SPAWN_MARGIN
		"bottom":
			player.position.x = room_width / 2.0
			player.position.y = floor_y
		"top":
			player.position.x = room_width / 2.0
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
