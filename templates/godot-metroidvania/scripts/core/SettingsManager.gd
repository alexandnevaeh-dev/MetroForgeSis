extends Node
## Persists player/device preferences (audio volumes, screen shake, fullscreen) to
## user://settings.json — deliberately separate from SaveManager's savegame.json, since
## these are preferences that should survive starting a brand new game, not progress tied
## to a specific playthrough.

const SETTINGS_PATH := "user://settings.json"

var master_volume: float = 1.0
var music_volume: float = 0.7
var sfx_volume: float = 1.0
var screen_shake_enabled: bool = true
var reduce_flash: bool = false
var fullscreen_enabled: bool = false

func _ready() -> void:
	load_settings()

func set_master_volume(value: float) -> void:
	master_volume = clampf(value, 0.0, 1.0)
	_apply_audio()
	save_settings()

func set_music_volume(value: float) -> void:
	music_volume = clampf(value, 0.0, 1.0)
	_apply_audio()
	save_settings()

func set_sfx_volume(value: float) -> void:
	sfx_volume = clampf(value, 0.0, 1.0)
	_apply_audio()
	save_settings()

func set_screen_shake(enabled: bool) -> void:
	screen_shake_enabled = enabled
	save_settings()

func set_reduce_flash(enabled: bool) -> void:
	reduce_flash = enabled
	save_settings()

func set_fullscreen(enabled: bool) -> void:
	fullscreen_enabled = enabled
	DisplayServer.window_set_mode(
		DisplayServer.WINDOW_MODE_FULLSCREEN if enabled else DisplayServer.WINDOW_MODE_WINDOWED
	)
	save_settings()

func _apply_audio() -> void:
	# AudioManager's volume properties have their own clamping setters (see AudioManager.gd)
	# — safe to assign directly, and safe even before AudioManager._ready() has run, since
	# its setter guards on the music player existing.
	AudioManager.master_volume = master_volume
	AudioManager.music_volume = music_volume
	AudioManager.sfx_volume = sfx_volume

func save_settings() -> bool:
	var data := {
		"master_volume": master_volume,
		"music_volume": music_volume,
		"sfx_volume": sfx_volume,
		"screen_shake_enabled": screen_shake_enabled,
		"reduce_flash": reduce_flash,
		"fullscreen_enabled": fullscreen_enabled,
	}
	var file := FileAccess.open(SETTINGS_PATH, FileAccess.WRITE)
	if file == null:
		push_error("SettingsManager: failed to open settings file for writing")
		return false
	file.store_string(JSON.stringify(data))
	file.close()
	return true

func load_settings() -> bool:
	if not FileAccess.file_exists(SETTINGS_PATH):
		_apply_audio()
		return false

	var file := FileAccess.open(SETTINGS_PATH, FileAccess.READ)
	if file == null:
		_apply_audio()
		return false
	var text := file.get_as_text()
	file.close()

	var json := JSON.new()
	if json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		push_warning("SettingsManager: settings file is corrupt or unreadable")
		_apply_audio()
		return false

	var data: Dictionary = json.data
	master_volume = data.get("master_volume", master_volume)
	music_volume = data.get("music_volume", music_volume)
	sfx_volume = data.get("sfx_volume", sfx_volume)
	screen_shake_enabled = data.get("screen_shake_enabled", screen_shake_enabled)
	reduce_flash = data.get("reduce_flash", reduce_flash)
	fullscreen_enabled = data.get("fullscreen_enabled", fullscreen_enabled)

	_apply_audio()
	if fullscreen_enabled:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)
	return true
