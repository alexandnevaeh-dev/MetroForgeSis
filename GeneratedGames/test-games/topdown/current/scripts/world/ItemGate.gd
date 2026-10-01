class_name ItemGate
extends StaticBody2D
## A solid overworld barrier that opens permanently once interacted with while the player owns
## the required item (InventoryManager — a real per-run inventory item, not GameManager's
## ability set). Interact-based like every other top-down world object, and removes itself once
## opened rather than re-checking every frame, since opening a gate is a one-way action.
##
## Previously had no CollisionShape2D or visual at all — a real solid StaticBody2D with zero
## shape blocks nothing, and with zero child node there was nothing to see either; only the
## group-distance fallback in TopDownPlayerController._try_interact() ever let a player reach it.
## Both are added here now, same real "ability-locked gate marker" art LockedDoor.gd uses (a
## different gating rule — any owned item vs. specifically a key — but the same "locked until you
## own the right thing" concept).
const GENERATED_TEXTURE_PATH := "res://assets/generated/gate/interactive_ability_gate.png"

@export var item_id: String = ""

func _ready() -> void:
	add_to_group("interactable")
	collision_layer = 1
	collision_mask = 0

	var shape := CollisionShape2D.new()
	shape.shape = RectangleShape2D.new()
	shape.shape.size = Vector2(16, 16)
	add_child(shape)

	if ResourceLoader.exists(GENERATED_TEXTURE_PATH):
		var sprite := Sprite2D.new()
		sprite.texture = load(GENERATED_TEXTURE_PATH)
		sprite.offset = Vector2(0, -sprite.texture.get_height() / 2.0)
		sprite.scale = Vector2(0.5, 0.5)
		add_child(sprite)
	else:
		var visual := ColorRect.new()
		visual.color = Color(0.45, 0.4, 0.55, 1.0)
		visual.position = Vector2(-8, -8)
		visual.size = Vector2(16, 16)
		add_child(visual)

func interact(_player: Node) -> void:
	if item_id != "" and InventoryManager.get_owned_count(item_id) <= 0:
		return
	AudioManager.play_sfx("pickup")
	queue_free()
