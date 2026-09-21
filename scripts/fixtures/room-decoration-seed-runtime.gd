extends Node
func _ready() -> void:
	var packed = load("res://scenes/rooms/room_000.tscn")
	var first = packed.instantiate()
	var second = packed.instantiate()
	add_child(first)
	add_child(second)
	var a = first.get_node("Ground")._arch_rng().seed
	var b = second.get_node("Ground")._arch_rng().seed
	print("SEEDS ", a, " ", b, " NAMES ", first.name, " ", second.name)
	var equal = a == b
	first.queue_free()
	second.queue_free()
	await get_tree().process_frame
	print("PASS: stable room decoration seed" if equal else "FAIL: room decoration seed changes with runtime name")
	get_tree().quit(0 if equal else 1)
