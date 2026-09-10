class_name VictoryShrine
extends Area2D

## No dedicated "shrine" asset family exists in the default procedural pipeline — reusing the
## checkpoint icon (a real, always-generated pedestal shape) is a deliberate, low-risk choice: a
## shrine and a save point are both "sacred standing structure you interact with" in silhouette,
## this object appears at most once per generated game (only in the final room), and the distinct
## gold modulate below keeps it from reading as an actual SavePoint even in the rare case both
## share a room. An external visual pack MAY ship a dedicated, distinct completion-object sprite
## at COMPLETION_TEXTURE_PATH (metroforge-research-facility does); when present it's preferred
## over the checkpoint-reuse fallback, still under the same gold modulate.
const COMPLETION_TEXTURE_PATH := "res://assets/generated/completion/interactive_completion.png"
const GENERATED_TEXTURE_PATH := "res://assets/generated/checkpoint/interactive_checkpoint.png"
const SHRINE_MODULATE := Color(1.4, 1.25, 0.55, 1.0)

func _ready() -> void:
	add_to_group("interactable")
	collision_layer = 32
	collision_mask = 2
	monitoring = true
	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(20, 20)
	shape.shape = rect
	add_child(shape)

	var texture_path := COMPLETION_TEXTURE_PATH if ResourceLoader.exists(COMPLETION_TEXTURE_PATH) else GENERATED_TEXTURE_PATH
	if ResourceLoader.exists(texture_path):
		var sprite := Sprite2D.new()
		sprite.texture = load(texture_path)
		sprite.position = Vector2(0, -6)
		sprite.modulate = SHRINE_MODULATE
		add_child(sprite)
	else:
		var vis := ColorRect.new()
		vis.size = Vector2(20, 20)
		vis.position = Vector2(-10, -10)
		vis.color = Color(0.9, 0.85, 0.3, 1)
		add_child(vis)

func interact(_player: Node) -> void:
	EventBus.boss_defeated.emit("boss_final")
