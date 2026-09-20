extends Node
## Windowed smoke for CaptureGuard. Does not write Pass 6 World stills.

const CaptureGuard := preload("res://scripts/test/CaptureGuard.gd")


func _ready() -> void:
	if CaptureGuard.refuse_if_visual_unsupported():
		get_tree().quit(CaptureGuard.EXIT_DUMMY)
		return
	if not await CaptureGuard.await_frames(self, 3, 2.0):
		get_tree().quit(CaptureGuard.EXIT_TIMEOUT)
		return
	if not await CaptureGuard.await_post_draw(self, 2.0):
		get_tree().quit(CaptureGuard.EXIT_TIMEOUT)
		return
	var tex := get_viewport().get_texture()
	var img := tex.get_image() if tex else null
	if img == null or img.is_empty():
		printerr("CAPTURE_EMPTY_FRAMEBUFFER: windowed viewport image missing")
		get_tree().quit(1)
		return
	print(
		"CAPTURE_GUARD_WINDOWED_OK renderer=%s adapter=%s display=%s size=%dx%d"
		% [
			RenderingServer.get_current_rendering_method(),
			RenderingServer.get_video_adapter_name(),
			DisplayServer.get_name(),
			img.get_width(),
			img.get_height(),
		]
	)
	get_tree().quit(0)
