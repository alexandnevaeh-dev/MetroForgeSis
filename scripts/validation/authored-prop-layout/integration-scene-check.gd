extends Node
const Manager = preload("res://scripts/world/OverworldManager.gd")
var failures: Array[String] = []
func check(value: bool, message: String) -> void:
	if not value:
		failures.append(message)
func _ready() -> void:
	call_deferred("run")
func run() -> void:
	var manager = Manager.new()
	var entities := Node2D.new()
	get_tree().root.add_child(entities)
	manager.set("_entities", entities)
	var texture: Texture2D = load("res://icon.svg")
	var size := texture.get_size()
	manager.call("_place_prop", "res://icon.svg", Vector2(40, 50), 16)
	check(entities.get_child_count() == 1, "Legacy prop missing")
	var legacy: Node2D = entities.get_child(0)
	var legacy_sprite: Sprite2D = legacy.get_child(0)
	check(legacy.position == Vector2(40, 50), "Legacy placement changed")
	check(legacy_sprite.centered and legacy_sprite.offset == Vector2(0, -size.y / 2), "Legacy anchor changed")
	var legacy_shape: CollisionShape2D = legacy.get_child(1).get_child(0)
	check(legacy_shape.shape.size.is_equal_approx(Vector2(9.6, 8)), "Legacy footprint changed")
	var layout := {"version": 1, "sourceSize": [size.x, size.y], "anchorPx": [size.x / 2, size.y * 0.66], "displayScale": 0.25, "collisionRectsPx": [{"x": -20, "y": -4, "width": 10, "height": 8}, {"x": 10, "y": -4, "width": 10, "height": 8}]}
	manager.call("_place_prop", "res://icon.svg", Vector2(100, 100), 16, layout)
	check(entities.get_child_count() == 2, "Authored prop missing")
	var authored: Node2D = entities.get_child(1)
	check(authored.position == Vector2(100, 100), "Authored ground placement wrong")
	check(authored.scale == Vector2(0.25, 0.25), "Authored scale wrong")
	check(authored.get_node("Footprints").get_child_count() == 2, "Authored footprints lost through manager")
	var sprite: Sprite2D = authored.get_node("Artwork")
	check(not sprite.centered and sprite.position.is_equal_approx(-Vector2(size.x / 2, size.y * 0.66)), "Authored image anchor wrong")
	layout.displayScale = -1
	manager.call("_place_prop", "res://icon.svg", Vector2(200, 200), 16, layout)
	check(entities.get_child_count() == 2, "Invalid authored layout fell back to an unsafe prop")
	manager.free()
	entities.free()
	var result := {"passed": failures.is_empty(), "failures": failures, "scope": "Actual OverworldManager legacy and authored prop placement, invalid layout rejection; template import passed separately. No desktop editing or doorway occlusion test."}
	var f := FileAccess.open("res://integration-result.json", FileAccess.WRITE)
	f.store_string(JSON.stringify(result, "  "))
	f.close()
	print(JSON.stringify(result))
	get_tree().quit(0 if failures.is_empty() else 1)
