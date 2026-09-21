extends Node
func _ready():
 process_mode = Node.PROCESS_MODE_ALWAYS
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
 get_tree().paused = true
 await get_tree().process_frame
 AudioManager.play_sfx("ui_click")
 if not AudioManager._music_player.can_process() or AudioManager._music_player.stream_paused:
  print("FAIL: pause interrupts music")
  get_tree().quit(1)
  return
 var ui_active = false
 for player in AudioManager._sfx_pool:
  if player.playing and player.can_process() and not player.stream_paused:
   ui_active = true
 if not ui_active:
  print("FAIL: UI sound unavailable during pause")
  get_tree().quit(1)
  return
 get_tree().paused = false
 AudioManager.stop_music()
 if AudioManager._music_player.playing:
  print("FAIL: stop_music did not stop playback")
  get_tree().quit(1)
  return
 print("PASS: music loops, pause keeps audio active, and explicit stop works")
 get_tree().quit(0)
