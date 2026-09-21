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
const BUS_UI := "UI"
const BUS_AMBIENCE := "Ambience"

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
@export var ui_volume: float = 0.8:
	set(value):
		ui_volume = clampf(value, 0.0, 1.0)
		_apply_bus_volumes()
@export var ambience_volume: float = 0.45:
	set(value):
		ambience_volume = clampf(value, 0.0, 1.0)
		_apply_bus_volumes()

var _sfx_pool: Array[AudioStreamPlayer] = []
var _sfx_pool_cursor := 0
var _voice_player: AudioStreamPlayer
var _music_player: AudioStreamPlayer
var _current_music_id: String = ""
var _sfx_cache: Dictionary = {}
var _missing_sfx_warned: Dictionary = {}
var _last_played_frame: Dictionary = {}
## Map requested ids onto synthesized DEFAULT_SFX names when a dedicated clip is absent.
const SFX_ALIASES := {
	"player_hurt": "hit",
	"player_attack": "hit",
	"enemy_attack": "hit",
	"boss_attack": "hit",
	"checkpoint": "ability",
	"door": "ui_click",
}

func _ready() -> void:
	# Dialogue and menus pause gameplay; their audio and music must remain active.
	process_mode = Node.PROCESS_MODE_ALWAYS
	_ensure_buses()
	for i in range(SFX_POOL_SIZE):
		var player := AudioStreamPlayer.new()
		player.bus = BUS_SFX
		add_child(player)
		_sfx_pool.append(player)

	_voice_player = AudioStreamPlayer.new()
	_voice_player.bus = BUS_SFX
	add_child(_voice_player)

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
		if loop and stream.loop_end <= stream.loop_begin:
			stream.loop_begin = 0
			stream.loop_end = maxi(1, roundi(stream.get_length() * stream.mix_rate))
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

	var stream := _load_sfx_file(sfx_name)
	if stream == null:
		var alias := String(SFX_ALIASES.get(sfx_name, ""))
		if not alias.is_empty() and alias != sfx_name:
			stream = _load_sfx_file(alias)
	if stream == null and not _missing_sfx_warned.has(sfx_name):
		_missing_sfx_warned[sfx_name] = true
		if _sfx_dir_has_any():
			push_warning("AudioManager: SFX file not found: %s%s.wav" % [SFX_DIR, sfx_name])

	_sfx_cache[sfx_name] = stream
	return stream


func _load_sfx_file(sfx_name: String) -> AudioStream:
	var path := "%s%s.wav" % [SFX_DIR, sfx_name]
	if not ResourceLoader.exists(path):
		return null
	return load(path)


func _sfx_dir_has_any() -> bool:
	var dir := DirAccess.open(SFX_DIR)
	if dir == null:
		return false
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		if not dir.current_is_dir() and name.ends_with(".wav"):
			dir.list_dir_end()
			return true
		name = dir.get_next()
	dir.list_dir_end()
	return false

## Plays a one-shot dialogue voice clip from a res:// path when TTS assets were generated.
## Silently no-ops if the file is missing so dialogue still works without voice lines.
func stop_dialogue_voice() -> void:
	_voice_player.stop()
	_voice_player.stream = null

func play_dialogue_voice(voice_path: String) -> void:
	stop_dialogue_voice()
	if voice_path.is_empty() or not ResourceLoader.exists(voice_path):
		return
	var stream := load(voice_path) as AudioStream
	if stream == null:
		return
	# Voice is one-shot; never mutate a cached resource used by music or another player.
	stream = stream.duplicate() as AudioStream
	if stream is AudioStreamWAV:
		stream.loop_mode = AudioStreamWAV.LOOP_DISABLED
	_voice_player.stream = stream
	_voice_player.play()

func _load_music(track_id: String) -> AudioStream:
	var path := "%s%s.wav" % [MUSIC_DIR, track_id]
	if not ResourceLoader.exists(path):
		return null
	return load(path)

func _ensure_buses() -> void:
	_ensure_bus(BUS_MUSIC)
	_ensure_bus(BUS_SFX)
	_ensure_bus(BUS_UI)
	_ensure_bus(BUS_AMBIENCE)
	_apply_profile_mix()

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
	_set_bus_volume(BUS_UI, ui_volume)
	_set_bus_volume(BUS_AMBIENCE, ambience_volume)
	if _music_player:
		_music_player.volume_db = 0.0

func _apply_profile_mix() -> void:
	var path := "res://data/quality/apply_audio_bus_mix.json"
	if not FileAccess.file_exists(path):
		return
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	master_volume = float(parsed.get("master", master_volume))
	music_volume = float(parsed.get("music", music_volume))
	sfx_volume = float(parsed.get("sfx", sfx_volume))
	ui_volume = float(parsed.get("ui", ui_volume))
	ambience_volume = float(parsed.get("ambience", ambience_volume))

func _set_bus_volume(bus_name: String, linear: float) -> void:
	var idx := AudioServer.get_bus_index(bus_name)
	if idx < 0:
		return
	AudioServer.set_bus_volume_db(idx, linear_to_db(maxf(0.0001, linear)))
