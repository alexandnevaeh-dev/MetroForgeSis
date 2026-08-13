extends Area2D

## Submerged volume — swim ability unlocks free movement inside.



func _ready() -> void:

	add_to_group("water_zone")

	monitoring = true

	body_entered.connect(_on_body_entered)

	body_exited.connect(_on_body_exited)



func _on_body_entered(body: Node2D) -> void:

	if body.is_in_group("player") and body.has_method("enter_water"):

		body.enter_water()



func _on_body_exited(body: Node2D) -> void:

	if body.is_in_group("player") and body.has_method("exit_water"):

		body.exit_water()

