extends Node
func _ready():
 process_mode = Node.PROCESS_MODE_ALWAYS
 var overlay = load("res://scenes/world/DialogueOverlay.tscn").instantiate()
 add_child(overlay)
 overlay.start_dialogue("quest_000_offer", "Test", {})
 AudioManager.play_dialogue_voice("res://audio/music/biome_0.wav")
 assert(AudioManager._voice_player.playing and AudioManager._voice_player.can_process())
 assert(AudioManager._voice_player.stream.loop_mode == AudioStreamWAV.LOOP_DISABLED)
 for i in range(12):
  AudioManager.play_sfx("jump")
  await get_tree().process_frame
 assert(AudioManager._voice_player.playing, "SFX must not steal voice playback")
 overlay._show_current_line()
 assert(not AudioManager._voice_player.playing, "Advancing must stop old voice")
 AudioManager.play_dialogue_voice("res://audio/music/biome_0.wav")
 overlay.close_dialogue()
 assert(not AudioManager._voice_player.playing, "Closing must stop voice")
 print("PASS: voice isolation, pause playback, line replacement and close cleanup")
 get_tree().quit()
