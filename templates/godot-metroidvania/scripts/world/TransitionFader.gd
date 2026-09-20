extends CanvasLayer
## Presentation-only fade overlay. Does not alter RoomTransition physics.

@onready var fade_rect: ColorRect = $FadeRect
var _fade_tween: Tween = null

func fade_out(duration: float = 0.08) -> void:
	if fade_rect == null:
		return
	fade_rect.visible = true
	fade_rect.color.a = 0.0
	if _fade_tween:
		_fade_tween.kill()
	_fade_tween = create_tween()
	_fade_tween.tween_property(fade_rect, "color:a", 1.0, maxf(0.01, duration))
	await _fade_tween.finished
	_fade_tween = null

func wait_until_black() -> void:
	if fade_rect == null:
		return
	if fade_rect.color.a >= 0.99:
		return
	if _fade_tween and _fade_tween.is_running():
		await _fade_tween.finished

func fade_in(duration: float = 0.08) -> void:
	if fade_rect == null:
		return
	fade_rect.visible = true
	if _fade_tween:
		_fade_tween.kill()
	_fade_tween = create_tween()
	_fade_tween.tween_property(fade_rect, "color:a", 0.0, maxf(0.01, duration))
	await _fade_tween.finished
	_fade_tween = null
	fade_rect.visible = false
