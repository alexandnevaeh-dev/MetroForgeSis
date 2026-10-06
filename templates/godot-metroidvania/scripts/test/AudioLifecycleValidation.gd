extends Node
## Controlled production AudioManager fixture; Dummy audio, no listening claim.
var checks: Array = []
func check(label: String, condition: bool) -> void:
	checks.append({"label": label, "passed": condition})
func _ready() -> void:
	var audio = get_node("/root/AudioManager")
	check("window close interception enabled", not get_tree().auto_accept_quit)
	audio.play_music("boss")
	await get_tree().create_timer(0.2).timeout
	check("music starts", audio._music_player.playing)
	check("music id tracked", audio.get_current_music_id() == "boss")
	check("music playback active", audio._music_player.has_stream_playback())
	var old_player = audio._music_player
	audio.play_music("boss")
	check("same track reuses player", audio._music_player == old_player)
	audio.play_sfx("hit")
	check("SFX cache populated", audio._sfx_cache.has("hit"))
	audio.play_dialogue_voice("res://audio/sfx/hit.wav")
	check("voice is one shot", audio._voice_player.stream.loop_mode == AudioStreamWAV.LOOP_DISABLED)
	check("voice resource is independent", audio._voice_player.stream != audio._sfx_cache.hit)
	await get_tree().create_timer(0.1).timeout
	audio.stop_music()
	check("stop clears track id", audio.get_current_music_id().is_empty())
	check("stop clears stream", audio._music_player.stream == null)
	check("stop clears playback", not audio._music_player.has_stream_playback())
	audio.play_music("boss")
	check("music restarts after stop", audio._music_player.playing)
	await get_tree().create_timer(0.2).timeout
	if "--paused-close" in OS.get_cmdline_user_args():
		get_tree().paused = true
		Engine.time_scale = 0.0
		audio.notification(NOTIFICATION_WM_CLOSE_REQUEST)
	else:
		audio.request_quit()
	# Duplicate shutdown requests must preserve the original exit code.
	audio.request_quit(7)
	check("shutdown latched", audio._quit_requested)
	check("shutdown clears music", audio._music_player.stream == null)
	check("shutdown clears voice", audio._voice_player.stream == null)
	check("shutdown clears cache", audio._sfx_cache.is_empty())
	var pool_cleared := true
	for player in audio._sfx_pool:
		pool_cleared = pool_cleared and player.stream == null and not player.playing
	check("shutdown clears SFX pool", pool_cleared)
	audio.play_music("boss")
	audio.play_sfx("hit")
	audio.play_dialogue_voice("res://audio/sfx/hit.wav")
	check("shutdown blocks late music", audio._music_player.stream == null)
	check("shutdown blocks late voice", audio._voice_player.stream == null)
	check("shutdown blocks late SFX", audio._sfx_cache.is_empty())
	var passed := true
	for row in checks:
		passed = passed and row.passed
	var proof := {"passed":passed,"checks":checks,"mode":"paused-close" if "--paused-close" in OS.get_cmdline_user_args() else "request-quit","scope":"Native controlled AudioManager lifecycle with real game WAVs and Dummy audio; notification simulated in Godot, no OS window input or listening acceptance."}
	var file := FileAccess.open("res://audio-proof.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(proof, "\t"))
	file.close()
	print("AUDIO_LIFECYCLE_RESULT ", JSON.stringify({"passed":passed,"checks":checks.size(),"mode":proof.mode}))
