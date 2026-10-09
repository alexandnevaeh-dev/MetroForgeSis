extends RefCounted
## Read-only bounds validation for the modular side-view background contract.
static func matches(room: Node) -> bool:
	if room == null:
		return false
	var kit = room.find_child("ThemedRoomKit",true,false)
	var ground = room.get_node_or_null("Ground")
	if kit == null or ground == null:
		return false
	var width = ground.get("room_width")
	var height = ground.get("room_height")
	if not typeof(width) in [TYPE_INT,TYPE_FLOAT] or not typeof(height) in [TYPE_INT,TYPE_FLOAT]:
		return false
	var dimensions := Vector2(float(width),float(height))
	if not is_finite(dimensions.x) or not is_finite(dimensions.y) or dimensions.x<=0 or dimensions.y<=0:
		return false
	var clip := kit.get_node_or_null("RoomInteriorClip") as Control
	if clip == null or not clip.clip_contents or clip.position!=Vector2.ZERO or not clip.size.is_equal_approx(dimensions):
		return false
	var wall := clip.get_node_or_null("RoomBrickBackwall") as Node2D
	return wall != null and wall.position==Vector2.ZERO and wall.get("dimensions") is Vector2 and wall.get("dimensions").is_equal_approx(dimensions)
