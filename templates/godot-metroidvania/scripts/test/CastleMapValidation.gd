extends SceneTree
## Native metadata coherence check; not visual or gameplay acceptance.

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	await process_frame
	var root_graph: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://world_graph.json"))
	var map := root.get_node("MapManager")
	assert(map.get("_graph") == root_graph, "Native map must load the repaired authoritative graph")
	assert(root_graph.nodes.size() == 40)
	var found := false
	for edge in root_graph.edges:
		if edge.from == "room_029" and edge.to == "room_030":
			assert(edge.transition == "down")
			assert(edge.requirements == ["ground_slam"])
			found = true
	assert(found)
	print("CASTLE_MAP_PASS checks=5 scope=native_metadata_coherence")
	quit()
