extends Node
func _ready():
 for player in AudioManager._sfx_pool:
  player.stop()
 AudioManager.play_sfx("ui_click")
 var slot = AudioManager._sfx_pool[0]
 assert(slot.playing and slot.bus == "UI", "UI click must use UI volume bus")
 slot.stop()
 AudioManager.play_sfx("jump")
 assert(slot.playing and slot.bus == "SFX", "Reused slot must return to SFX bus")
 await get_tree().process_frame
 slot.stop()
 AudioManager.play_sfx("door")
 assert(slot.playing and slot.bus == "SFX", "Gameplay alias must retain gameplay mix")
 print("PASS: UI bus routing, pooled slot reuse and gameplay alias routing")
 get_tree().quit()
