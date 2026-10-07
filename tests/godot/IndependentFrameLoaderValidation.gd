extends Node
var checks: Array = []
func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("INDEPENDENT_FRAME_CHECK ",JSON.stringify(checks.back()))
func _ready() -> void:
	var actor = load("res://AnimatedAssetSprite.gd").new()
	var frames := SpriteFrames.new()
	frames.add_animation("walk")
	var paths: Array = []
	var regions: Array = []
	var anchors: Array = []
	var bottoms := [1074,1078,1078,1077,1075,1080,1076,1074]
	for index in range(8):
		paths.append("assets/phase_%d.png" % index)
		regions.append([0,0,1254,1254])
		anchors.append([625,bottoms[index]])
	# Round-trip through JSON: Godot parses numeric counts as floats.
	var entry: Dictionary = JSON.parse_string(JSON.stringify({"sourceFrames":paths,"sourceRegions":regions,"frameFootAnchors":anchors,"frameCount":8,"displayScale":96.0/843.0}))
	actor._load_source_regions(frames,"walk",entry)
	check("JSON metadata loads eight independent source frames",frames.get_frame_count("walk")==8)
	var isolated := true
	for index in range(frames.get_frame_count("walk")):
		var texture = frames.get_frame_texture("walk",index)
		isolated = isolated and texture is AtlasTexture and texture.filter_clip and texture.region==Rect2(0,0,1254,1254) and texture.atlas.resource_path=="res://assets/phase_%d.png" % index
	check("each clipped region samples its own source texture",isolated)
	check("all source anchors become frame offsets",actor._clip_presentations.walk.frameOffsets.size()==8)
	var originals: Array = []
	for index in range(8): originals.append(frames.get_frame_texture("walk",index))
	for label in ["count","path_count","missing","traversal","absolute","ambiguous","anchor_count","nonfinite_anchor","outside_region","nonfinite_scale"]:
		var invalid := entry.duplicate(true)
		match label:
			"count": invalid.frameCount = 7
			"path_count": invalid.sourceFrames.pop_back()
			"missing": invalid.sourceFrames[7] = "assets/missing.png"
			"traversal": invalid.sourceFrames[7] = "assets/../phase_7.png"
			"absolute": invalid.sourceFrames[7] = "E:/phase_7.png"
			"ambiguous": invalid.sourceSheet = "assets/phase_0.png"
			"anchor_count": invalid.frameFootAnchors.pop_back()
			"nonfinite_anchor": invalid.frameFootAnchors[7] = [NAN,1074]
			"outside_region": invalid.sourceRegions[7] = [1200,0,1254,1254]
			"nonfinite_scale": invalid.displayScale = INF
		actor._load_source_regions(frames,"walk",invalid)
		var unchanged := frames.get_frame_count("walk")==8
		for index in range(mini(8,frames.get_frame_count("walk"))):
			unchanged = unchanged and frames.get_frame_texture("walk",index)==originals[index]
		check("reject "+label+" without partial replacement",unchanged)
	var legacy := SpriteFrames.new()
	legacy.add_animation("walk")
	actor._load_source_regions(legacy,"walk",{"sourceSheet":"assets/phase_0.png","sourceRegions":[[0,0,1254,1254]],"displayScale":0.1,"footAnchorY":1074})
	check("legacy single-sheet metadata still loads",legacy.get_frame_count("walk")==1)
	actor.sheet_path = "assets/qa_probe_walk.png"
	frames.set_animation_speed("walk",8.0)
	frames.set_animation_loop("walk",true)
	for label in ["rejected_source_timing","negative_fps","wrong_loop_type"]:
		var invalid := entry.duplicate(true)
		invalid.fps = 99.0
		invalid.loop = false
		match label:
			"rejected_source_timing": invalid.sourceFrames[7] = "assets/missing.png"
			"negative_fps": invalid.fps = -1.0
			"wrong_loop_type": invalid.loop = "false"
		var metadata := FileAccess.open("res://assets/qa_probe_animations.json",FileAccess.WRITE)
		metadata.store_string(JSON.stringify({"walk":invalid}))
		metadata.close()
		actor._load_animation_metadata(frames)
		check("reject "+label+" without timing mutation",frames.get_animation_speed("walk")==8.0 and frames.get_animation_loop("walk"))
	var passed := true
	for row in checks: passed = passed and row.passed
	var file := FileAccess.open("res://qa/independent-frame-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled production loader source-frame admission/rejection and legacy compatibility. No gameplay, gait quality or production art acceptance."},"\t"))
	file.close()
	actor.free()
	print("INDEPENDENT_FRAME_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
