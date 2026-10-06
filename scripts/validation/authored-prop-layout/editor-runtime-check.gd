extends Node2D
const Manager = preload("res://scripts/world/OverworldManager.gd")
var failures: Array[String] = []
func check(ok: bool, message: String) -> void:
	if not ok: failures.append(message)
func _ready() -> void:
	call_deferred("run")
func run() -> void:
	var world: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://editor-saved-overworld.json"))
	var area: Dictionary = world.areas[0]
	var record: Dictionary = area.propPlacements[0]
	var entities := Node2D.new()
	entities.y_sort_enabled = true
	add_child(entities)
	var manager = Manager.new()
	manager.set("_entities", entities)
	manager.call("_spawn_props", area)
	check(entities.get_child_count() == 1, "Editor-saved prop failed to spawn")
	if entities.get_child_count() == 1:
		var prop: Node2D = entities.get_child(0)
		check(prop.position.is_equal_approx(Vector2(record.x, record.y)), "Saved position mismatch")
		check(prop.scale.is_equal_approx(Vector2.ONE * float(record.layout.displayScale)), "Saved scale mismatch")
		check(prop.get_meta("placement_id") == record.id, "Identity mismatch")
		check(prop.get_node("Footprints").get_child_count() == 2, "Pillar footprints missing")
		var layers := 0
		for child in prop.get_children():
			if child.has_meta("layer_id"):
				layers += 1
				check(child.get_child(0) is Sprite2D and child.get_child(0).texture != null, "Layer texture missing")
		check(layers == 23, "Expected all 23 baked artwork layers")
	var camera := Camera2D.new()
	camera.position = Vector2(record.x, record.y - 20)
	camera.zoom = Vector2(4,4)
	add_child(camera)
	var label := Label.new()
	label.text = "METROFORGE EDITOR → RUNTIME\nSaved doorway · 23 layers · 2 pillar footprints\nDevelopment asset verification — not gameplay"
	label.position = Vector2(24,24)
	var overlay := CanvasLayer.new()
	add_child(overlay)
	overlay.add_child(label)
	await get_tree().process_frame
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://editor-saved-runtime.png")
	var result := {"passed":failures.is_empty(),"failures":failures,"savedPosition":[record.x,record.y],"gpu":RenderingServer.get_video_adapter_name(),"scope":"Actual editor-saved area loaded by current OverworldManager, transform, layers and collider structure checked. No playable-character or collision sweep test."}
	var file := FileAccess.open("res://result.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(result,"  "))
	file.close()
	manager.free()
	print(JSON.stringify(result))
	get_tree().quit(0 if failures.is_empty() else 1)
