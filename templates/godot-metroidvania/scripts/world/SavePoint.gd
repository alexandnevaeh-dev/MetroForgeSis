extends Area2D
## The primary, designed save interaction: player enters -> checkpoint recorded (room +
## full health) -> EventBus.save_triggered emitted -> SaveManager writes to disk. This is
## an Area2D body_entered handler, so it fires once per entry, not per-frame — touching a
## SavePoint repeatedly (e.g. standing in the zone) does not spam saves.

func _ready() -> void:
	body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node2D) -> void:
	if not body.is_in_group("player"):
		return

	var health_component: HealthComponent = body.get_node_or_null("HealthComponent")
	var max_health := 100.0
	if health_component:
		max_health = health_component.max_health
		health_component.heal(max_health)

	SaveManager.set_checkpoint(GameManager.current_room_id, max_health, max_health)
	# No dedicated "save" SFX exists in the generated audio set (see packages/procedural/src/
	# audio.ts DEFAULT_SFX) — reusing "ability" gives a distinct, pleasant confirmation chime
	# rather than silence or a mismatched sound like "hit".
	AudioManager.play_sfx("ability")
	EventBus.save_triggered.emit()
