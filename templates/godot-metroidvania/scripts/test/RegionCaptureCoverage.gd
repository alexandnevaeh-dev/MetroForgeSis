extends RefCounted
## Screenshot coverage uses authored region membership, never room-number buckets.
## Connectivity here is structural; it does not prove controller traversal or earned gates.
static func membership(graph: Dictionary, rooms: Dictionary) -> Dictionary:
	var room_regions: Dictionary = {}
	var regions: Dictionary = {}
	var errors: Array[String] = []
	for region in graph.get("regions", []):
		if not region is Dictionary:
			errors.append("Invalid region record")
			continue
		var region_id := String(region.get("id", ""))
		var ids: Array = region.get("roomIds", [])
		if region_id.is_empty() or regions.has(region_id) or ids.is_empty():
			errors.append("Empty or duplicate region: " + region_id)
			continue
		regions[region_id] = true
		for id in ids:
			var room_id := String(id)
			if not rooms.has(room_id) or room_regions.has(room_id):
				errors.append("Unknown or multiply assigned room: " + room_id)
				continue
			room_regions[room_id] = region_id
	for room_id in rooms:
		if not room_regions.has(room_id):
			errors.append("Unassigned room: " + String(room_id))
	return {"valid": not rooms.is_empty() and not regions.is_empty() and errors.is_empty(), "roomRegions": room_regions, "regions": regions, "errors": errors}

static func complete(expected: Dictionary, captured_regions: Dictionary, captured_rooms: Dictionary) -> bool:
	if not bool(expected.get("valid", false)):
		return false
	var regions: Dictionary = expected.get("regions", {})
	var room_regions: Dictionary = expected.get("roomRegions", {})
	if captured_regions.size() != regions.size() or captured_rooms.size() != room_regions.size():
		return false
	for region_id in regions:
		if not captured_regions.has(region_id):
			return false
	for room_id in room_regions:
		if not captured_rooms.has(room_id) or captured_rooms[room_id] != room_regions[room_id]:
			return false
	return true

static func connected(graph: Dictionary, rooms: Dictionary) -> bool:
	if rooms.is_empty():
		return false
	var adjacent: Dictionary = {}
	for room_id in rooms:
		adjacent[room_id] = []
	for edge in graph.get("edges", []):
		if not edge is Dictionary:
			return false
		var from_id := String(edge.get("from", ""))
		var to_id := String(edge.get("to", ""))
		if not adjacent.has(from_id) or not adjacent.has(to_id):
			continue
		adjacent[from_id].append(to_id)
		adjacent[to_id].append(from_id)
	var pending: Array = [rooms.keys()[0]]
	var visited: Dictionary = {}
	while not pending.is_empty():
		var room_id: String = pending.pop_back()
		if visited.has(room_id):
			continue
		visited[room_id] = true
		pending.append_array(adjacent[room_id])
	return visited.size() == rooms.size()
