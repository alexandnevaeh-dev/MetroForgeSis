extends Node
var views: Array = []
var checks: Array = []
func _ready() -> void:
	var plan: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://plan.json"))
	var anchors: Array=[]
	for anchor in plan.measuredFootAnchors:
		anchors.append([anchor.x,anchor.y])
	var entry: Dictionary={"sourceSheet":"assets/watchman-idle-v4.png","sourceRegions":plan.sourceRegions,"frameFootAnchors":anchors,"displayScale":0.21}
	for side in range(2):
		for pose in range(8):
			var view:=SubViewport.new()
			view.size=Vector2i(160,180)
			view.transparent_bg=true
			view.render_target_update_mode=SubViewport.UPDATE_ALWAYS
			add_child(view)
			var sprite=load("res://scripts/AnimatedAssetSprite.gd").new()
			sprite.sheet_path=""
			sprite.position=Vector2(80,144)
			sprite.texture_filter=CanvasItem.TEXTURE_FILTER_NEAREST
			view.add_child(sprite)
			sprite.sprite_frames.add_animation("qa_idle")
			sprite._load_source_regions(sprite.sprite_frames,"qa_idle",entry)
			sprite.animation="qa_idle"
			sprite.stop()
			sprite.frame=pose
			sprite.flip_h=side==1
			sprite._apply_clip_presentation()
			var display:=TextureRect.new()
			display.texture=view.get_texture()
			display.position=Vector2((pose%4)*160,(side*2+pose/4)*180)
			display.size=Vector2(160,180)
			add_child(display)
			views.append({"view":view,"sprite":sprite,"pose":pose,"side":side})
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	for item in views:
		var im: Image=item.view.get_texture().get_image()
		var bottom: int=-1
		for y in range(im.get_height()-1,-1,-1):
			for x in range(im.get_width()):
				if im.get_pixel(x,y).a>=0.5:
					bottom=y+1
					break
			if bottom>=0:
				break
		var left: int=160
		var right: int=-1
		for y in range(maxi(0,bottom-3),bottom):
			for x in range(im.get_width()):
				if im.get_pixel(x,y).a>=0.5:
					left=mini(left,x);right=maxi(right,x)
		var center: float=float(left+right+1)*0.5
		var passed: bool=bottom>=0 and absf(float(bottom)-144.0)<=1.0 and absf(center-80.0)<=2.0
		checks.append({"pose":item.pose,"leftFacing":item.side==1,"bottom":bottom,"footCenter":center,"passed":passed})
		print("ANCHOR_PIXEL ",JSON.stringify(checks.back()))
	var sample=views[0].sprite
	var count: int=sample.sprite_frames.get_frame_count("qa_idle")
	var bad: Dictionary=entry.duplicate(true)
	bad.frameFootAnchors=[[0,0]]
	sample._load_source_regions(sample.sprite_frames,"qa_idle",bad)
	checks.append({"label":"invalid anchor count preserves prior frames","passed":sample.sprite_frames.get_frame_count("qa_idle")==count})
	for malformed in [
		{"label":"reject non-finite scale", "field":"displayScale", "value":NAN},
		{"label":"reject infinite source coordinate", "field":"sourceRegions", "value":[[INF,0,444,430]]},
		{"label":"reject string source coordinate", "field":"sourceRegions", "value":[["0",0,444,430]]},
		{"label":"reject non-finite frame anchor", "field":"frameFootAnchors", "value":anchors.duplicate(true)},
	]:
		var candidate: Dictionary = entry.duplicate(true)
		candidate[malformed.field] = malformed.value
		if malformed.field == "sourceRegions":
			candidate.frameFootAnchors = [[210,391]]
		if malformed.field == "frameFootAnchors":
			candidate.frameFootAnchors[0][0] = NAN
		var prior_texture: Texture2D = sample.sprite_frames.get_frame_texture("qa_idle",0)
		sample._load_source_regions(sample.sprite_frames,"qa_idle",candidate)
		checks.append({"label":malformed.label,"passed":sample.sprite_frames.get_frame_count("qa_idle")==count and sample.sprite_frames.get_frame_texture("qa_idle",0)==prior_texture})
	# Verify normal animation signals, rather than only manually selecting frames.
	var observed: Dictionary = {}
	sample.frame_changed.connect(func(): observed[sample.frame] = sample.offset)
	sample.sprite_frames.set_animation_speed("qa_idle", 16.0)
	sample.play("qa_idle")
	await get_tree().create_timer(0.65).timeout
	sample.stop()
	var cadence_ok: bool = observed.size() == 8
	for pose in observed:
		var region: Array = entry.sourceRegions[pose]
		var anchor: Array = anchors[pose]
		var expected := Vector2(float(region[2])*0.5-float(anchor[0]),float(region[3])*0.5-float(anchor[1]))
		cadence_ok = cadence_ok and observed[pose].is_equal_approx(expected)
	checks.append({"label":"live frame signals maintain all eight anchors","passed":cadence_ok,"observedFrames":observed.size()})
	sample.flip_h = true
	await get_tree().process_frame
	await get_tree().process_frame
	var right_offset: Vector2 = sample._clip_presentations.qa_idle.frameOffsets[sample.frame]
	checks.append({"label":"live facing change mirrors anchor","passed":sample.offset.is_equal_approx(Vector2(-right_offset.x,right_offset.y))})
	var legacy: Dictionary = entry.duplicate(true)
	legacy.erase("frameFootAnchors")
	legacy.footAnchorY = 391.0
	sample.sprite_frames.add_animation("legacy")
	sample._load_source_regions(sample.sprite_frames,"legacy",legacy)
	sample.animation = "legacy"
	sample.frame = 3
	checks.append({"label":"legacy scalar anchor remains unchanged","passed":sample.offset.is_equal_approx(Vector2(0,-176)) and sample.sprite_frames.get_frame_count("legacy")==8})
	sample.animation = "walk"
	checks.append({"label":"ordinary strip restores default presentation","passed":sample.offset.is_equal_approx(sample._default_presentation_offset) and sample.scale.is_equal_approx(sample._default_presentation_scale)})
	var passed:=true
	for check in checks:
		passed=passed and check.passed
	get_viewport().get_texture().get_image().save_png("res://preview.png")
	var report:=FileAccess.open("res://proof.json",FileAccess.WRITE)
	report.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Native raster foot alignment and facing, isolated review art; no enemy runtime replacement or family approval."},"\t"))
	report.close()
	print("ANCHOR_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
