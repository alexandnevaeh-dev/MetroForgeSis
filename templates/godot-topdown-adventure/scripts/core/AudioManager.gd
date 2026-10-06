extends Node
## Authoritative audio playback for the generated game. WorldManager and every gameplay
## script route sound through here rather than owning their own AudioStreamPlayer, so
## volume/mute/future-settings changes apply uniformly in one place.

const SFX_POOL_SIZE := 8
const SFX_DIR := "res://audio/sfx/"
const MUSIC_DIR := "res://audio/music/"
const BUS_MASTER := "Master"
const BUS_MUSIC := "Music"
const BUS_SFX := "SFX"

## Volume categories — 0..1 linear, applied to Godot audio buses so Master/Music/SFX
## can be mixed independently. SettingsManager writes these properties.
@export var master_volume: float = 1.0:
	set(value):
		master_volume = clampf(value, 0.0, 1.0)
		_apply_bus_volumes()
@export var music_volume: float = 0.7:
	set(value):
		music_volume = clampf(value, 0.0, 1.0)
		_apply_bus_volumes()
@export var sfx_volume: float = 1.0:
	set(value):
		sfx_volume = clampf(value, 0.0, 1.0)
		_apply_bus_volumes()

var _sfx_pool: Array[AudioStreamPlayer] = []
var _sfx_pool_cursor := 0
var _music_player: AudioStreamPlayer
var _current_music_id: String = ""
var _sfx_cache: Dictionary = {}
var _missing_sfx_warned: Dictionary = {}
var _last_played_frame: Dictionary = {}

func _ready() -> void:
	_ensure_buses()
	for i in range(SFX_POOL_SIZE):
		var player := AudioStreamPlayer.new()
		player.bus = BUS_SFX
		add_child(player)
		_sfx_pool.append(player)

	_music_player = AudioStreamPlayer.new()
	_music_player.bus = BUS_MUSIC
	add_child(_music_player)
	_apply_bus_volumes()

## Plays a one-shot SFX by id (e.g. "jump", "hit", "boss_hit" — matches the generated
## audio/sfx/<id>.wav filenames). Reuses a pooled AudioStreamPlayer instead of allocating
## one per call, and silently no-ops (with a one-time warning) if the file wasn't generated
## rather than crashing — a project shouldn't fail to run because one SFX is missing.
func play_sfx(sfx_name: String) -> void:
	if sfx_name.is_empty():
		return

	# Collapse truly simultaneous duplicate triggers (e.g. several hits landing the same
	# physics frame) so they don't all stack into an overloud single instant — but two
	# calls even one frame apart are treated as distinct and both play.
	var frame := Engine.get_process_frames()
	if _last_played_frame.get(sfx_name, -1) == frame:
		return
	_last_played_frame[sfx_name] = frame

	var stream := _load_sfx(sfx_name)
	if stream == null:
		return

	var player := _next_sfx_player()
	player.stream = stream
	player.volume_db = 0.0
	player.play()

## Switches background music to the given track id (matches audio/music/<id>.wav —
## biome ids in exploration rooms, "boss" in boss arenas). No-ops if that track is
## already playing, so same-biome room transitions don't restart the loop.
func play_music(track_id: String, loop: bool = true) -> void:
	if track_id.is_empty():
		return
	if track_id == _current_music_id and _music_player.playing:
		return

	var stream := _load_music(track_id)
	if stream == null:
		push_warning("AudioManager: music track not found: %s" % track_id)
		return

	if stream is AudioStreamWAV:
		(stream as AudioStreamWAV).loop_mode = (
			AudioStreamWAV.LOOP_FORWARD if loop else AudioStreamWAV.LOOP_DISABLED
		)

	_current_music_id = track_id
	_music_player.stream = stream
	_music_player.volume_db = 0.0
	_apply_bus_volumes()
	_music_player.play()

func stop_music() -> void:
	_music_player.stop()
	_current_music_id = ""

func get_current_music_id() -> String:
	return _current_music_id

func _next_sfx_player() -> AudioStreamPlayer:
	# Prefer an idle player so two different SFX overlapping don't cut each other off;
	# only steal the least-recently-used slot once every pooled player is busy.
	for player in _sfx_pool:
		if not player.playing:
			return player
	_sfx_pool_cursor = (_sfx_pool_cursor + 1) % _sfx_pool.size()
	return _sfx_pool[_sfx_pool_cursor]

func _load_sfx(sfx_name: String) -> AudioStream:
	if _sfx_cache.has(sfx_name):
		return _sfx_cache[sfx_name]

	var path := "%s%s.wav" % [SFX_DIR, sfx_name]
	var stream: AudioStream = null
	if ResourceLoader.exists(path):
		stream = load(path)
	elif not _missing_sfx_warned.has(sfx_name):
		push_warning("AudioManager: SFX file not found: %s" % path)
		_missing_sfx_warned[sfx_name] = true

	_sfx_cache[sfx_name] = stream
	return stream

## Plays a one-shot dialogue voice clip from a res:// path when TTS assets were generated.
## Silently no-ops if the file is missing so dialogue still works without voice lines.
func play_dialogue_voice(voice_path: String) -> void:
	if voice_path.is_empty():
		return
	if not ResourceLoader.exists(voice_path):
		return

	var stream: AudioStream = load(voice_path)
	if stream == null:
		return

	var player := _next_sfx_player()
	player.stream = stream
	player.volume_db = 0.0
	player.play()

func _load_music(track_id: String) -> AudioStream:
	var path := "%s%s.wav" % [MUSIC_DIR, track_id]
	if not ResourceLoader.exists(path):
		return null
	return load(path)

func _ensure_buses() -> void:
	_ensure_bus(BUS_MUSIC)
	_ensure_bus(BUS_SFX)

func _ensure_bus(bus_name: String) -> void:
	if AudioServer.get_bus_index(bus_name) != -1:
		return
	AudioServer.add_bus()
	var idx := AudioServer.bus_count - 1
	AudioServer.set_bus_name(idx, bus_name)
	AudioServer.set_bus_send(idx, BUS_MASTER)

func _apply_bus_volumes() -> void:
	_set_bus_volume(BUS_MASTER, master_volume)
	_set_bus_volume(BUS_MUSIC, music_volume)
	_set_bus_volume(BUS_SFX, sfx_volume)
	if _music_player:
		_music_player.volume_db = 0.0

func _set_bus_volume(bus_name: String, linear: float) -> void:
	var idx := AudioServer.get_bus_index(bus_name)
	if idx < 0:
		return
	AudioServer.set_bus_volume_db(idx, linear_to_db(maxf(0.0001, linear)))
