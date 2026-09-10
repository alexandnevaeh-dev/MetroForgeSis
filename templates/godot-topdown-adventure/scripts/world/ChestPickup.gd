class_name ChestPickup
extends Area2D
## Interact-based item container — top-down's counterpart to the side-view template's
## walk-over ItemPickup.gd. Uses TopDownPlayerController's interact() protocol (the
## "interactable" group) instead of body_entered, matching every other top-down world object.
##
## Previously had no CollisionShape2D and no visual of any kind — genuinely invisible, relying
## entirely on TopDownPlayerController._try_interact()'s group-distance fallback to be reachable
## at all. Both are added here now: a real shape so the player's own interact raycast can find it
## directly, and real closed/open chest art (a family that never existed anywhere in the asset
## pipeline before this milestone — see packages/assets/src/asset-pipeline.ts's interactiveSpecs).

const CLOSED_TEXTURE_PATH := "res://assets/generated/chest/interactive_chest_closed.png"
const OPEN_TEXTURE_PATH := "res://assets/generated/chest/interactive_chest_open.png"

@export var item_id: String = ""
@export var chest_id: String = ""
@export var amount: int = 1

var opened: bool = false
var _sprite: Sprite2D
var _fallback: ColorRect

func _ready() -> void:
	add_to_group("interactable")
	collision_layer = 32
	collision_mask = 0

	var shape := CollisionShape2D.new()
	shape.shape = RectangleShape2D.new()
	shape.shape.size = Vector2(20, 18)
	shape.position = Vector2(0, -9)
	add_child(shape)

	if ResourceLoader.exists(CLOSED_TEXTURE_PATH):
		_sprite = Sprite2D.new()
		_sprite.texture = load(CLOSED_TEXTURE_PATH)
		_sprite.position = Vector2(0, -9)
		add_child(_sprite)
	else:
		_fallback = ColorRect.new()
		_fallback.color = Color(0.55, 0.35, 0.75, 1.0)
		_fallback.position = Vector2(-10, -18)
		_fallback.size = Vector2(20, 18)
		add_child(_fallback)

func interact(_player: Node) -> void:
	if opened:
		return
	if not InventoryManager.grant_item(item_id, amount):
		push_warning("ChestPickup: unknown item_id '%s'" % item_id)
		return
	opened = true
	AudioManager.play_sfx("pickup")
	VFXManager.play("pickup_spark", global_position)
	if _sprite and ResourceLoader.exists(OPEN_TEXTURE_PATH):
		_sprite.texture = load(OPEN_TEXTURE_PATH)
	else:
		modulate = Color(0.6, 0.6, 0.6, 1.0)
	# A real, readable open transition instead of an instant texture swap -- a quick pop-and-
	# settle scale tween, timed short enough not to delay the player from moving on.
	if _sprite:
		_sprite.scale = Vector2(1.35, 0.75)
		var tween := create_tween()
		tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
		tween.tween_property(_sprite, "scale", Vector2.ONE, 0.22)
