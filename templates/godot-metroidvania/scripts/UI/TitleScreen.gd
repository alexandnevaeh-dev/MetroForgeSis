extends Control

func _ready() -> void:
	$VBox/NewGameButton.pressed.connect(_on_new_game)
	$VBox/ContinueButton.pressed.connect(_on_continue)
	$VBox/ContinueButton.visible = SaveManager.has_save()

func _on_new_game() -> void:
	GameManager.start_new_game()
	get_tree().change_scene_to_file("res://scenes/world/World.tscn")

func _on_continue() -> void:
	if SaveManager.load_game():
		get_tree().change_scene_to_file("res://scenes/world/World.tscn")
