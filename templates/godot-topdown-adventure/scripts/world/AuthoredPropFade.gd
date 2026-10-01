extends Node2D
## Optional readability aid for tall authored props. Ground pivots and solid
## footprints remain fixed; only the artwork fades when it obscures the hero.
func _process(_delta: float) -> void:
	var art := get_node_or_null("Artwork") as Sprite2D
	var player := get_tree().get_first_node_in_group("player") as Node2D
	if not art or not art.texture or not player:
		return
	var feet := to_local(player.global_position)
	var bounds := art.get_rect()
	bounds.position += art.position
	var behind := feet.y <= 2.0 and feet.y >= bounds.position.y and absf(feet.x) < bounds.size.x * 0.5
	art.modulate.a = 0.72 if behind else 1.0
