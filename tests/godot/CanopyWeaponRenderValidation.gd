extends Node
var checks: Array = []
func _ready() -> void:
	get_window().content_scale_size = Vector2i(1536,1024)
	get_window().size = Vector2i(1536,1024)
	var player = load("res://scenes/player/Player.tscn").instantiate()
	var source = player.get_node("Sprite")
	var directions := ["N","NE","E","SE","S","SW","W","NW"]
	for row in range(8):
		var sprite = source.duplicate()
		add_child(sprite)
		var clip: String = String(sprite.resolve_animation("attack",directions[row]))
		var frames: SpriteFrames = sprite.sprite_frames
		checks.append({"label":directions[row]+" twelve attack poses","passed":frames.get_frame_count(clip)==12})
		checks.append({"label":directions[row]+" cadence and nonloop","passed":is_equal_approx(frames.get_animation_speed(clip),30.0) and not frames.get_animation_loop(clip)})
		sprite.visible = false
		sprite.queue_free()
		for frame in range(12):
			var texture = frames.get_frame_texture(clip,frame)
			checks.append({"label":directions[row]+" frame "+str(frame)+" clipped atlas","passed":texture is AtlasTexture and texture.filter_clip and texture.region==Rect2(frame*64,0,64,64)})
			var pose := Sprite2D.new()
			pose.texture = texture
			pose.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			pose.position = Vector2(frame*128+64,row*128+76)
			pose.scale = Vector2.ONE*1.5
			add_child(pose)
		var label := Label.new()
		label.text = directions[row]
		label.position = Vector2(4,row*128+4)
		add_child(label)
	player.free()
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://canopy-attack-contact.png")
	var passed := true
	for check in checks:
		passed = passed and check.passed
	var file := FileAccess.open("res://canopy-weapon-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Fresh pipeline attack art with candidate clipping template applied; native counts, timing and sampling, enlarged contact sheet. Gameplay and art approval separate."},"	"))
	file.close()
	print("CANOPY_WEAPON_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
