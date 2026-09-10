extends Node2D

@export var start_room_id: String = "room_000"

const ROOM_WIDTH := 800
const SPAWN_MARGIN := 80

var _current_room: Node2D = null
var _room_data: Dictionary = {}
var _transitioning: bool = false
## Health-continuity fix: every room is its own scene with its own embedded Player node (see
## _load_room below), so the outgoing Player instance and its HealthComponent are destroyed on
## every transition. Without carrying the value forward here, an ordinary door — with no death,
## no save/load, and no explicit heal — silently restored the player to full health every single
## time, because the *new* Player's HealthComponent simply starts at its scene default. Captured
## fresh on every _load_room() call (reset first, then conditionally repopulated) so a player who
## died in the outgoing room never carries a stale positive value forward from an earlier,
## unrelated transition. -1.0 means "nothing to carry" (fresh game's first room, or the outgoing
## player was already dead).
var _carried_health: float = -1.0
var _carried_max_health: float = -1.0

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
	# Capture the outgoing player's current health BEFORE tearing the room down — see the
	# _carried_health doc comment above for why this exists. Reset unconditionally first so a
	# stale value from an earlier transition never survives a room where the player died without
	# ever leaving it (is_alive() correctly excludes that case below).
	_carried_health = -1.0
	_carried_max_health = -1.0
	if _current_room:
		var outgoing_player := _current_room.get_node_or_null("Player")
		if outgoing_player:
			var outgoing_health: HealthComponent = outgoing_player.get_node_or_null("HealthComponent")
			if outgoing_health and outgoing_health.is_alive():
				_carried_health = outgoing_health.current_health
				_carried_max_health = outgoing_health.max_health
		_current_room.queue_free()
		_current_room = null

	var scene_path := "res://scenes/rooms/%s.tscn" % room_id
	if not ResourceLoader.exists(scene_path):
		push_warning("Room scene not found: %s" % scene_path)
		return

	# A pending save/checkpoint restore (SaveManager.consume_pending_player_health(), consumed by
	# the new Player's own _ready() during add_child() below) must win over ordinary carryover —
	# check it *before* add_child() consumes the flag, so a death/load respawn always applies the
	# checkpoint's saved health rather than whatever the previous, unrelated instant happened to
	# hold. This keeps the two flows distinct: ordinary transitions carry current health forward;
	# a save/checkpoint load always restores the persisted value instead.
	var used_save_restore := SaveManager.has_pending_health_restore()

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
		if not used_save_restore and _carried_health >= 0.0:
			var incoming_health: HealthComponent = player.get_node_or_null("HealthComponent")
			if incoming_health:
				if _carried_max_health > 0.0:
					incoming_health.max_health = _carried_max_health
				incoming_health.current_health = _carried_health
				incoming_health.health_changed.emit(incoming_health.current_health, incoming_health.max_health)
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
			player.position.x = min(room_width - SPAWN_MARGIN, room_width / 2.0 + SPAWN_MARGIN)
			player.position.y = floor_y
		"top":
			player.position.x = min(room_width - SPAWN_MARGIN, room_width / 2.0 + SPAWN_MARGIN)
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
		var room_width := _current_room_width()
		var room_height := float(_current_room.get_node_or_null("Ground").get("room_height")) if _current_room and _current_room.get_node_or_null("Ground") else 600.0
		if camera.has_method("apply_room_bounds"):
			var ground := _current_room.get_node_or_null("Ground") if _current_room else null
			var kit := ""
			if ground:
				var kit_value = ground.get("visual_kit")
				if typeof(kit_value) == TYPE_STRING:
					kit = kit_value
			camera.apply_room_bounds(Vector2(room_width, room_height), kit)
		camera.make_current()
