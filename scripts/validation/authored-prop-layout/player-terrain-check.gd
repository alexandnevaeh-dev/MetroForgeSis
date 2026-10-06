extends Node2D
const Manager = preload("res://scripts/world/OverworldManager.gd")
const Player = preload("res://scenes/player/Player.tscn")
func _ready() -> void:
	call_deferred("run")
func run() -> void:
	var results := []
	for filename in ["painted-test.json","erased-test.json"]:
		var world: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://"+filename))
		var area: Dictionary = world.areas[0]
		var root := Node2D.new()
		add_child(root)
		var manager = Manager.new()
		manager.set("_area_root",root)
		manager.call("_build_collision",area)
		var player = Player.instantiate()
		player.position=Vector2(48,64)
		root.add_child(player)
		GameManager.current_state=GameManager.GameState.PLAYING
		await get_tree().physics_frame
		Input.action_press("move_right")
		for i in range(90):
			await get_tree().physics_frame
		Input.action_release("move_right")
		results.append({"file":filename,"x":player.position.x,"y":player.position.y})
		root.queue_free()
		manager.free()
		await get_tree().process_frame
	var passed: bool = results[0].x > 48 and results[0].x < 87 and results[1].x > 140
	var result := {"passed":passed,"results":results,"scope":"Actual Player.tscn and controller input across terrain saved by room backend; painted barrier blocks and erased barrier permits traversal. Headless movement test, not animation or visual approval."}
	var f := FileAccess.open("res://player-terrain-result.json",FileAccess.WRITE)
	f.store_string(JSON.stringify(result,"  "))
	f.close()
	print(JSON.stringify(result))
	get_tree().quit(0 if passed else 1)
