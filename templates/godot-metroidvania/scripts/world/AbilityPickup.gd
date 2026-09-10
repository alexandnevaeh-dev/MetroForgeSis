extends Area2D

@export var ability_id: String = "dash"
@export var display_name: String = "Dash"

## See SavePoint.gd's identical comment — additive-only, zero-provider games never see this file.
const GENERATED_TEXTURE_PATH := "res://assets/generated/pickup/interactive_ability_pickup.png"

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
	if body.is_in_group("player") and not GameManager.has_ability(ability_id):
		GameManager._on_ability_acquired(ability_id)
		EventBus.ability_acquired.emit(ability_id)
		AudioManager.play_sfx("ability")
		queue_free()
