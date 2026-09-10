extends Area2D
## The primary, designed save interaction: player enters -> checkpoint recorded (room +
## full health) -> EventBus.save_triggered emitted -> SaveManager writes to disk. This is
## an Area2D body_entered handler, so it fires once per entry, not per-frame — touching a
## SavePoint repeatedly (e.g. standing in the zone) does not spam saves.

## NVIDIA NIM (or any configured provider) may have generated a nicer checkpoint icon at this
## conventional path (see packages/assets/src/visual-enhancement/planner.ts) — use it when
## present, otherwise keep the flat-color Sprite ColorRect exactly as before. A zero-provider
## game never has this file, so this is a pure additive enhancement, never a regression.
const GENERATED_TEXTURE_PATH := "res://assets/generated/checkpoint/interactive_checkpoint.png"

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	_apply_generated_texture_if_present()

func _apply_generated_texture_if_present() -> void:
	if not ResourceLoader.exists(GENERATED_TEXTURE_PATH):
		return
	var generated := $GeneratedSprite as Sprite2D
	var fallback := $Sprite as ColorRect
	if generated == null:
		return
	generated.texture = load(GENERATED_TEXTURE_PATH)
	generated.visible = true
	if fallback:
		fallback.visible = false

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
