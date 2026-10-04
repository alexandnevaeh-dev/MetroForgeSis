extends RefCounted
## Enemy and boss terminal clips use the same duration and pause-aware completion rule.
## Avoid awaiting an unqualified animation_finished signal that another clip can satisfy.

static func duration_seconds(sprite: AnimatedSprite2D, clip: StringName) -> float:
	if sprite == null or sprite.sprite_frames == null or not sprite.sprite_frames.has_animation(clip):
		return 0.0
	var frames := sprite.sprite_frames
	var fps := frames.get_animation_speed(clip)
	var rate := absf(sprite.speed_scale)
	if not is_finite(fps) or fps <= 0.0 or not is_finite(rate) or rate <= 0.0:
		return 0.0
	var weight := 0.0
	for index in range(frames.get_frame_count(clip)):
		var duration := frames.get_frame_duration(clip, index)
		if not is_finite(duration) or duration <= 0.0:
			return 0.0
		weight += duration
	var seconds := weight / (fps * rate)
	return seconds if is_finite(seconds) else 0.0

static func finish_terminal_clip(owner: Node, sprite: AnimatedSprite2D, clip: StringName) -> bool:
	var duration := duration_seconds(sprite, clip)
	if duration <= 0.0:
		return is_instance_valid(owner) and owner.is_inside_tree()
	var tree := owner.get_tree()
	var elapsed := 0.0
	var previous := Time.get_ticks_msec()
	while elapsed < duration + 0.05 and is_instance_valid(owner) and owner.is_inside_tree():
		await tree.process_frame
		var now := Time.get_ticks_msec()
		if not tree.paused:
			elapsed += maxf(0.0, float(now - previous) * 0.001) * Engine.time_scale
		previous = now
	return is_instance_valid(owner) and owner.is_inside_tree()
