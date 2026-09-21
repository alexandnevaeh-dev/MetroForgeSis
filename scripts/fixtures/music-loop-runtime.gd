extends Node
func _ready():
 AudioManager.play_music("biome_0")
 var stream = AudioManager._music_player.stream
 var length = stream.get_length()
 if stream.loop_end <= stream.loop_begin or length <= 0 or length > 30:
  print("FAIL: invalid music loop fixture or endpoints")
  get_tree().quit(1)
  return
 await get_tree().create_timer(length + 0.3).timeout
 if not AudioManager._music_player.playing:
  print("FAIL: music stopped before looping")
  get_tree().quit(1)
  return
 AudioManager.stop_music()
 if AudioManager._music_player.playing:
  print("FAIL: stop_music did not stop playback")
  get_tree().quit(1)
  return
 print("PASS: music loops past full duration and stops explicitly")
 get_tree().quit(0)
