extends Area2D
## The primary, designed save interaction: player enters -> checkpoint recorded (room +
## full health) -> EventBus.save_triggered emitted -> SaveManager writes to disk. This is
## an Area2D body_entered handler, so it fires once per entry, not per-frame — touching a
## SavePoint repeatedly (e.g. standing in the zone) does not spam saves.

## Same real-asset-if-present, flat-color-fallback pattern the side-view template's SavePoint.gd
## already uses (see packages/assets/src/visual-enhancement/planner.ts) — genuinely generated at
## this conventional path for every project (procedural baseline, real AI art when a provider is
## configured), previously never referenced anywhere in the top-down template despite existing on
## disk for every project ever generated.
const GENERATED_TEXTURE_PATH := "res://assets/generated/checkpoint/interactive_checkpoint.png"

## Readable inactive/active state this milestone asks for: a checkpoint that has actually been
## used this room-visit reads differently from one the player hasn't touched yet — a bright,
## slightly enlarged highlight, not just a color the player has to already know the meaning of.
const ACTIVE_MODULATE := Color(1.35, 1.3, 0.85, 1.0)
const ACTIVE_SCALE := Vector2(1.12, 1.12)

@onready var _sprite: Sprite2D = $GeneratedSprite
@onready var _fallback: ColorRect = $Sprite

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	_apply_generated_texture_if_present()

func _apply_generated_texture_if_present() -> void:
	if not ResourceLoader.exists(GENERATED_TEXTURE_PATH):
		return
	if _sprite == null:
		return
	_sprite.texture = load(GENERATED_TEXTURE_PATH)
	_sprite.visible = true
	if _fallback:
		_fallback.visible = false

## Tints/enlarges whichever visual is actually showing (the generated sprite, or the flat-color
## fallback) — never `self`, which would also recolor the "Save Point" label above it.
func _set_active(active: bool) -> void:
	var target: CanvasItem = _sprite if _sprite and _sprite.visible else _fallback
	if target == null:
		return
	# A real "booting up" beat (per the reference board's dark -> booting -> lit progression)
	# instead of an instant snap to the active tint/scale.
	var tween := create_tween()
	tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_ELASTIC)
	tween.tween_property(target, "modulate", ACTIVE_MODULATE if active else Color.WHITE, 0.4)
	tween.parallel().tween_property(target, "scale", ACTIVE_SCALE if active else Vector2.ONE, 0.4)

func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return

	var health_component: HealthComponent = body.get_node_or_null("HealthComponent")
	var max_health := 100.0
	if health_component:
		max_health = health_component.max_health
		health_component.heal(max_health)

	SaveManager.set_checkpoint(GameManager.current_room_id, max_health, max_health)
	AudioManager.play_sfx("ability")
	EventBus.object_activated.emit("save_%s" % GameManager.current_room_id)
	EventBus.save_triggered.emit()
	_set_active(true)
