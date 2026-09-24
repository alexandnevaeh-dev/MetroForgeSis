extends SceneTree
func _initialize() -> void:
	var controller = load("res://scripts/player/TopDownPlayerController.gd").new()
	var sprite := AnimatedSprite2D.new()
	var frames := SpriteFrames.new()
	var image := Image.create(8,8,false,Image.FORMAT_RGBA8)
	image.fill(Color.WHITE)
	var texture := ImageTexture.create_from_image(image)
	for clip in ["idle", "walk", "attack", "hurt"]:
		frames.add_animation(clip)
		frames.set_animation_loop(clip, clip in ["idle", "walk"])
		frames.add_frame(clip, texture)
		frames.add_frame(clip, texture)
	sprite.sprite_frames=frames
	controller.sprite=sprite
	controller._attack_state=controller.AttackState.RECOVERY
	sprite.animation="attack"
	sprite.stop()
	sprite.set_frame_and_progress(1,1.0)
	controller._update_sprite()
	assert(not sprite.is_playing(), "Completed attack restarted")
	assert(sprite.frame==1, "Attack final pose lost")
	controller._play_facing_animation("attack", true)
	assert(sprite.is_playing() and sprite.frame==0, "Consecutive attack did not restart")
	controller._attack_state=controller.AttackState.READY
	controller._stun_time=0.1
	sprite.animation="hurt"
	sprite.stop()
	sprite.set_frame_and_progress(1,1.0)
	controller._update_sprite()
	assert(not sprite.is_playing(), "Completed hurt restarted")
	assert(sprite.frame==1)
	controller._stun_time=0.0
	controller._update_sprite()
	assert(sprite.animation=="idle")
	controller._attack_state=controller.AttackState.STARTUP
	controller._update_sprite()
	assert(sprite.animation=="attack" and sprite.is_playing(), "New attack did not start")
	sprite.free()
	controller.free()
	print("ONE_SHOT_STATE_TRANSITIONS_PASS")
	quit()
