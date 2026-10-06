extends Node
func _ready() -> void:
 var failures=[]
 for size in [64,128,256]:
  var sprite=load("res://scripts/core/AnimatedAssetSprite.gd").new()
  sprite.sheet_path=""
  sprite.frame_size=Vector2i(size,size)
  sprite.world_frame_height=48.0
  add_child(sprite)
  for iteration in range(3):
   sprite._build_frames()
   if abs(sprite.scale.y*size-48.0)>0.001:failures.append("height drift")
   if abs(sprite.offset.y+size/2.0)>0.001:failures.append("anchor drift")
  sprite.queue_free()
 var legacy=load("res://scripts/core/AnimatedAssetSprite.gd").new()
 legacy.sheet_path=""
 legacy.scale=Vector2(0.7,0.8)
 add_child(legacy)
 if legacy.scale!=Vector2(0.7,0.8):failures.append("legacy scale changed")
 legacy.queue_free()
 print("WORLD_SCALE_REGRESSION_PASS=",failures.is_empty()," ",failures)
 await get_tree().process_frame
 get_tree().quit(0 if failures.is_empty() else 1)
