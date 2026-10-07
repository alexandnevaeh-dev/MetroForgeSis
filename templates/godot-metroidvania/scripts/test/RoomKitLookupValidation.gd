extends Node
## Native module lookup and clip-cache check; does not establish art approval.
func _ready() -> void:
	var kit = load("res://scripts/world/StormglassRoomKit.gd").new()
	kit.room_id = "lookup_fixture"
	var missing: bool = kit._texture("missing_fixture") == null
	kit._texture("missing_fixture")
	var warning_once: bool = kit.missing_roles.size()==1
	var path := "res://assets/architecture/stormglass/kits/gallery-common-v1/manifest.json"
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(path))
	var atlas: Texture2D = load("res://"+String(manifest.atlas))
	for entry in manifest.entries:
		kit.parts[String(entry.role)] = {"atlas":atlas,"entry":entry}
	var first: AtlasTexture = kit._texture("floor_course")
	var second: AtlasTexture = kit._texture("floor_course")
	var cached: bool = first != null and first == second and first.filter_clip
	var passed: bool = missing and warning_once and cached
	print("ROOM_KIT_LOOKUP_RESULT ",JSON.stringify({"passed":passed,"missingReturnsNull":missing,"warningDeduplicated":warning_once,"clippedTextureReused":cached}))
	kit.free()
	AudioManager.request_quit(0 if passed else 1)
