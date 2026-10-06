extends Object
## Shared guards for screenshot and motion-capture tools.
## Dummy/headless DisplayServer cannot produce a GPU framebuffer; get_image() and
## frame_post_draw can hang past --quit-after. Refuse those launches immediately.
## Visual evidence must be taken windowed (Metal Forward+). Headless remains valid
## for CombatMicroTest, PlaytestRunner, and other nonvisual checks.
## AcceptancePlaytest records stills/motion and must also refuse dummy.

const REFUSE_MESSAGE := "CAPTURE_REFUSED: dummy renderer cannot capture screenshots or motion. Relaunch windowed without --headless (Metal Forward+)."
const EXIT_DUMMY := 2
const EXIT_TIMEOUT := 3


static func is_dummy_renderer() -> bool:
	if DisplayServer.get_name() == "headless":
		return true
	if OS.has_feature("headless"):
		return true
	var method := String(RenderingServer.get_current_rendering_method()).to_lower()
	return method == "dummy"


static func refuse_if_visual_unsupported() -> bool:
	if not is_dummy_renderer():
		return false
	print(REFUSE_MESSAGE)
	printerr(REFUSE_MESSAGE)
	return true


static func await_frames(host: Node, count: int, timeout_s: float = 2.0) -> bool:
	var tree := host.get_tree() if host else null
	if tree == null:
		print("CAPTURE_TIMEOUT: no SceneTree for process frames")
		printerr("CAPTURE_TIMEOUT: no SceneTree for process frames")
		return false
	var deadline := Time.get_ticks_msec() + int(timeout_s * 1000.0)
	var seen := 0
	while seen < count:
		if Time.get_ticks_msec() >= deadline:
			print("CAPTURE_TIMEOUT: process_frame %d/%d exceeded %.1fs" % [seen, count, timeout_s])
			printerr("CAPTURE_TIMEOUT: process_frame")
			return false
		await tree.process_frame
		seen += 1
	return true


static func await_physics_frames(host: Node, count: int, timeout_s: float = 0.0) -> bool:
	var tree := host.get_tree() if host else null
	if tree == null:
		print("CAPTURE_TIMEOUT: no SceneTree for physics frames")
		printerr("CAPTURE_TIMEOUT: no SceneTree for physics frames")
		return false
	if timeout_s <= 0.0:
		timeout_s = maxf(3.0, float(count) * 0.05 + 2.0)
	var deadline := Time.get_ticks_msec() + int(timeout_s * 1000.0)
	var seen := 0
	while seen < count:
		if Time.get_ticks_msec() >= deadline:
			print("CAPTURE_TIMEOUT: physics_frame %d/%d exceeded %.1fs" % [seen, count, timeout_s])
			printerr("CAPTURE_TIMEOUT: physics_frame")
			return false
		await tree.physics_frame
		seen += 1
	return true


static func await_post_draw(host: Node, timeout_s: float = 2.0) -> bool:
	var tree := host.get_tree() if host else null
	if tree == null:
		print("CAPTURE_TIMEOUT: no SceneTree for frame_post_draw")
		printerr("CAPTURE_TIMEOUT: no SceneTree for frame_post_draw")
		return false
	if is_dummy_renderer():
		print(REFUSE_MESSAGE)
		printerr(REFUSE_MESSAGE)
		return false
	var got := false
	var cb := func(): got = true
	RenderingServer.frame_post_draw.connect(cb, CONNECT_ONE_SHOT)
	RenderingServer.force_draw(true)
	var deadline := Time.get_ticks_msec() + int(timeout_s * 1000.0)
	var frames := 0
	# Empty test scenes may never emit frame_post_draw. Two process ticks plus
	# force_draw matches WorldVisualCapture and unblocks if the signal is silent.
	while Time.get_ticks_msec() < deadline:
		await tree.process_frame
		frames += 1
		if got or frames >= 2:
			if RenderingServer.frame_post_draw.is_connected(cb):
				RenderingServer.frame_post_draw.disconnect(cb)
			return true
	if RenderingServer.frame_post_draw.is_connected(cb):
		RenderingServer.frame_post_draw.disconnect(cb)
	print("CAPTURE_TIMEOUT: RenderingServer.frame_post_draw exceeded %.1fs" % timeout_s)
	printerr("CAPTURE_TIMEOUT: frame_post_draw")
	return false
