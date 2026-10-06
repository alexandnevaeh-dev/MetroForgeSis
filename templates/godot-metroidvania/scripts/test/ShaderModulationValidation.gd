extends Node
func _ready() -> void:
	var viewport=SubViewport.new()
	viewport.size=Vector2i(128,240)
	viewport.transparent_bg=true
	viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	var image=Image.create(32,32,false,Image.FORMAT_RGBA8)
	image.fill(Color(0.2,0.4,0.6,1))
	var texture=ImageTexture.create_from_image(image)
	var shader=load("res://scripts/shaders/sprite_foot_clean.gdshader")
	for row in range(5):
		for column in range(2):
			var parent=Node2D.new();viewport.add_child(parent)
			var sprite=Sprite2D.new();sprite.texture=texture;sprite.position=Vector2(32+column*64,24+row*48);parent.add_child(sprite)
			if row==4:
				var red_image=Image.create(32,32,false,Image.FORMAT_RGBA8)
				red_image.fill(Color(0.9,0.2,0.2,1))
				sprite.texture=ImageTexture.create_from_image(red_image)
			if row==1:sprite.modulate=Color(0.25,0.5,0.75,1)
			if row==2:sprite.self_modulate=Color(0.5,1,0.75,0.25)
			if row==3:parent.modulate=Color(1,1,1,0.35)
			if column==1:
				var material=ShaderMaterial.new();material.shader=shader;sprite.material=material
	for i in range(8):await RenderingServer.frame_post_draw
	var pixels=viewport.get_texture().get_image()
	var checks: Array=[]
	var labels=["unmodified color","sprite tint","self tint and alpha","parent opacity"]
	var passed: bool=true
	for row in range(5):
		if row==4:
			var upper=pixels.get_pixel(96,208)
			var lower=pixels.get_pixel(96,224)
			var cleaned=upper.a>0.99 and lower.a<0.01
			passed=passed and cleaned
			checks.append({"label":"foot marks removed only in contact band","passed":cleaned,"upperAlpha":upper.a,"lowerAlpha":lower.a})
			print("SHADER_MODULATION "+JSON.stringify(checks[-1]))
			continue
		var control=pixels.get_pixel(32,24+row*48)
		var actual=pixels.get_pixel(96,24+row*48)
		var error=maxf(maxf(absf(control.r-actual.r),absf(control.g-actual.g)),maxf(absf(control.b-actual.b),absf(control.a-actual.a)))
		var valid=error<0.015
		passed=passed and valid
		checks.append({"label":labels[row],"passed":valid,"maxError":error,"control":[control.r,control.g,control.b,control.a],"shader":[actual.r,actual.g,actual.b,actual.a]})
		print("SHADER_MODULATION "+JSON.stringify(checks[-1]))
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://qa/shader-modulation"))
	var label="native"
	pixels.save_png("user://qa/shader-modulation/"+label+".png")
	var file=FileAccess.open("user://qa/shader-modulation/"+label+"-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Native GPU raster comparison: production foot shader vs unshaded engine sprite under identical modulation. No production artwork modification."},"\t"));file.close()
	get_tree().quit(0 if passed else 1)


