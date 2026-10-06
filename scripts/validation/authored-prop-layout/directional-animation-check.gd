extends SceneTree
func _initialize() -> void:
	var sprite = load("res://scripts/core/AnimatedAssetSprite.gd").new()
	sprite.frame_size=Vector2i(8,8)
	for spec in [["north",32,8],["east",64,8],["invalid",31,8]]:
		var image := Image.create(spec[1],spec[2],false,Image.FORMAT_RGBA8)
		image.fill(Color.WHITE)
		var texture := ImageTexture.create_from_image(image)
		assert(ResourceSaver.save(texture,"user://"+spec[0]+".tres")==OK)
	# Resource paths normally point at imported PNGs. Test resources avoid introducing artwork.
	var north := "res://direction-north.tres"
	var east := "res://direction-east.tres"
	var invalid := "res://direction-invalid.tres"
	for pair in [["north",north],["east",east],["invalid",invalid]]:
		assert(ResourceSaver.save(load("user://"+pair[0]+".tres"),pair[1])==OK)
	sprite.directional_sheets={"walk":{"N":north,"E":east,"W":invalid},"attack":{"N":north}}
	var frames := SpriteFrames.new()
	for name in ["walk","idle","attack"]:
		frames.add_animation(name)
		frames.add_frame(name,load(north))
	sprite._load_directional_frames(frames)
	sprite.sprite_frames=frames
	assert(frames.get_frame_count("walk_N")==4)
	assert(frames.get_frame_count("walk_E")==8)
	assert(not frames.has_animation("walk_W"))
	assert(frames.has_animation("idle_N"))
	assert(not frames.get_animation_loop("attack_N"))
	assert(sprite.resolve_animation("walk","W")==&"walk")
	var controller = load("res://scripts/player/TopDownPlayerController.gd").new()
	controller.sprite=sprite
	controller.facing_name="N"
	controller.facing=Vector2.UP
	controller.velocity=Vector2.UP*20
	controller._update_sprite()
	assert(sprite.animation==&"walk_N" and not sprite.flip_h)
	sprite.set_frame_and_progress(2,0.5)
	controller.facing_name="E"
	controller.facing=Vector2.RIGHT
	controller._update_sprite()
	assert(sprite.animation==&"walk_E" and sprite.frame==5)
	controller.facing_name="W"
	controller.facing=Vector2.LEFT
	controller._update_sprite()
	assert(sprite.animation==&"walk" and sprite.flip_h)
	controller.facing_name="N"
	controller.facing=Vector2.UP
	controller._attack_state=controller.AttackState.STARTUP
	controller._update_sprite()
	assert(sprite.animation==&"attack_N" and not sprite.flip_h)
	controller.facing_name="E"
	controller._update_sprite()
	assert(sprite.animation==&"attack_N")
	controller._attack_state=controller.AttackState.READY
	controller.velocity=Vector2.ZERO
	controller.facing_name="N"
	controller._update_sprite()
	assert(sprite.animation==&"idle_N")
	sprite.free()
	controller.free()
	print("DIRECTIONAL_STRIPS_AND_PHASE_PASS")
	quit()
