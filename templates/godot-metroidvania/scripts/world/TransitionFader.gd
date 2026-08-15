extends CanvasLayer
## Presentation-only fade overlay. Does not alter RoomTransition physics.

@onready var fade_rect: ColorRect = $FadeRect

func fade_out(duration: float = 0.08) -> void:
	if fade_rect == null:
		return
	fade_rect.visible = true
	fade_rect.color.a = 0.0
	var tween := create_tween()
	tween.tween_property(fade_rect, "color:a", 1.0, maxf(0.01, duration))
	await tween.finished

func fade_in(duration: float = 0.08) -> void:
	if fade_rect == null:
		return
	fade_rect.visible = true
	var tween := create_tween()
	tween.tween_property(fade_rect, "color:a", 0.0, maxf(0.01, duration))
	await tween.finished
	fade_rect.visible = false
