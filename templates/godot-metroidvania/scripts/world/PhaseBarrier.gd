extends StaticBody2D

## Solid until the player phase-dashes through it.

## See SavePoint.gd's identical comment — additive-only, zero-provider games never see this file.
## Does not touch the existing "Visual" node's default invisibility when no texture is present.
const GENERATED_TEXTURE_PATH := "res://assets/generated/gate/interactive_ability_gate.png"


func _ready() -> void:

	add_to_group("phase_barrier")

	collision_layer = 64

	collision_mask = 0

	_apply_generated_texture_if_present()
	_refresh_phase_state()

func _refresh_phase_state() -> void:
	# PhaseAbility drives the player's layer-7 collision mask for its configured dash window.
	# Keep the barrier solid after pickup so crossing it requires the real phase-dash input.
	collision_layer = 64
	visible = true


func _apply_generated_texture_if_present() -> void:
	if not ResourceLoader.exists(GENERATED_TEXTURE_PATH):
		return
	var generated := $GeneratedSprite as Sprite2D
	if generated == null:
		return
	generated.texture = load(GENERATED_TEXTURE_PATH)
	generated.visible = true

