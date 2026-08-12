extends Node
## Authoritative audio playback for the generated game. WorldManager and every gameplay
## script route sound through here rather than owning their own AudioStreamPlayer, so
## volume/mute/future-settings changes apply uniformly in one place.

const SFX_POOL_SIZE := 8
const SFX_DIR := "res://audio/sfx/"
const MUSIC_DIR := "res://audio/music/"

## Volume categories — deliberately simple exported floats (0..1) rather than a full
## settings system (that's a separate, larger piece of work) but shaped so a future
## SettingsMenu can just assign AudioManager.master_volume etc. directly.
@export var master_volume: float = 1.0:
	set(value):
		master_volume = clampf(value, 0.0, 1.0)
		_apply_music_volume()
@export var music_volume: float = 0.7:
	set(value):
		music_volume = clampf(value, 0.0, 1.0)
		_apply_music_volume()
@export var sfx_volume: float = 1.0:
	set(value):
		sfx_volume = clampf(value, 0.0, 1.0)

var _sfx_pool: Array[AudioStreamPlayer] = []
var _sfx_pool_cursor := 0
var _music_player: AudioStreamPlayer
var _current_music_id: String = ""
var _sfx_cache: Dictionary = {}
var _missing_sfx_warned: Dictionary = {}
var _last_played_frame: Dictionary = {}

func _ready() -> void:
	for i in range(SFX_POOL_SIZE):
		var player := AudioStreamPlayer.new()
		add_child(player)
		_sfx_pool.append(player)

	_music_player = AudioStreamPlayer.new()
	add_child(_music_player)
	_apply_music_volume()

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
	player.volume_db = linear_to_db(maxf(0.0001, sfx_volume * master_volume))
	player.play()

## Switches background music to the given track id (matches audio/music/<id>.wav, which
## in practice is the biome id). No-ops if that track is already playing, so calling this
## on every room transition within the same biome doesn't restart the loop audibly.
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
	_apply_music_volume()
	_music_player.play()

func stop_music() -> void:
	_music_player.stop()
	_current_music_id = ""

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

func _load_music(track_id: String) -> AudioStream:
	var path := "%s%s.wav" % [MUSIC_DIR, track_id]
	if not ResourceLoader.exists(path):
		return null
	return load(path)

func _apply_music_volume() -> void:
	if _music_player:
		_music_player.volume_db = linear_to_db(maxf(0.0001, music_volume * master_volume))
