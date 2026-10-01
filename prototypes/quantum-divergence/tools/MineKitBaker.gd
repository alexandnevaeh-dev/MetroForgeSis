extends "res://tools/DiverRigBaker.gd"
## Original mine kit, sharing the actors' materials, lighting and native pixel density.
const ASSETS := {
	"bedrock-a":{"frame":Vector2i(64,64),"opaque":true},"bedrock-b":{"frame":Vector2i(64,64),"opaque":true},
	"catwalk":{"frame":Vector2i(64,64),"opaque":true},"ore":{"frame":Vector2i(64,64),"opaque":true},
	"sand":{"frame":Vector2i(64,64),"opaque":true},"fluid":{"frame":Vector2i(64,64),"opaque":true},
	"wall-a":{"frame":Vector2i(256,192),"opaque":true},"wall-b":{"frame":Vector2i(256,192),"opaque":true},
	"wall-rib":{"frame":Vector2i(128,256),"opaque":false},
	"station":{"frame":Vector2i(128,128),"opaque":false},"anchor":{"frame":Vector2i(64,96),"opaque":false},
	"core":{"frame":Vector2i(128,128),"opaque":false},"lift":{"frame":Vector2i(192,192),"opaque":false},
	"crystal":{"frame":Vector2i(40,72),"opaque":false}}
var asset_name: String
var stone: StandardMaterial3D
var copper: StandardMaterial3D
var water: StandardMaterial3D

func _initialize() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output = argument.trim_prefix("--output=")
	assert(output.to_lower().begins_with("e:/") and not DirAccess.dir_exists_absolute(output))
	assert(DirAccess.make_dir_recursive_absolute(output) == OK)
	call_deferred("_bake")

func _setup_asset(name: String) -> void:
	asset_name = name
	var size: Vector2i = ASSETS[name].frame
	viewport = SubViewport.new()
	viewport.size = size
	viewport.transparent_bg = true
	viewport.own_world_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.msaa_3d = Viewport.MSAA_DISABLED
	root.add_child(viewport)
	rig = Node3D.new()
	rig.name = "OriginalMine_"+name
	viewport.add_child(rig)
	silver = _material(Color("d3dfeb"),.15,.35)
	edge = _material(Color("526d86"),.7,.35)
	dark = _material(Color("182b42"),.25,.46)
	cyan = _material(Color("11bac9"),.35,.18,.5)
	violet = _material(Color("7c49b0"),.3,.35,.18)
	lamp = _material(Color("6bf4ec"),.1,.25,1.2)
	stone = _material(Color("34465f"),.05,.82)
	copper = _material(Color("a57758"),.20,.75)
	water = _material(Color("245990"),.45,.16)
	camera = Camera3D.new()
	viewport.add_child(camera)
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	camera.size = float(size.y)*3.5/96.0
	camera.position = Vector3(0,camera.size*.5,10)
	camera.current = true
	var environment := WorldEnvironment.new()
	viewport.add_child(environment)
	environment.environment = Environment.new()
	environment.environment.background_mode = Environment.BG_COLOR
	environment.environment.background_color = Color(0,0,0,0)
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color("a8bfd6")
	environment.environment.ambient_light_energy = .65
	for data in [[Vector3(-.7,-1,-.5),Color("d5e9ff"),1.4],[Vector3(1,-.5,.2),Color("9272c5"),.65]]:
		var light := DirectionalLight3D.new()
		viewport.add_child(light)
		light.look_at(Vector3(data[0]),Vector3.UP)
		light.light_color = data[1]
		light.light_energy = data[2]
		light.shadow_enabled = false
	if name in ["bedrock-a","bedrock-b","ore","sand","fluid","catwalk"]: _terrain(name)
	elif name in ["wall-a","wall-b"]: _wall(name)
	elif name == "wall-rib": _rib()
	elif name == "crystal": _crystal()
	else: _machine(name)

func _terrain(name: String) -> void:
	var extent: float = camera.size
	# Unbeveled foundation fills every texel; visual edge bevels are selected from actual cell faces.
	var plane := BoxMesh.new()
	plane.size = Vector3(extent+.02,extent+.02,.12)
	_mesh("ContinuousMaterial",plane,Vector3(0,extent*.5,-.30),water if name == "fluid" else copper if name == "sand" else dark if name == "catwalk" else stone)
	if name == "catwalk":
		_box("LoadBearingPlate",Vector3(0,extent*.5,-.14),Vector3(extent,extent,.19),edge)
		for y in [.18,.64,1.12,1.60,2.08]:
			_box("FloorLaminate",Vector3(0,y,.01),Vector3(2.27,.30,.10),silver)
			for x in [-.90,.90]: _sphere("Fastener",Vector3(x,y,.075),Vector3(.045,.045,.024),dark)
		return
	var rng := RandomNumberGenerator.new()
	rng.seed = 442 if name == "bedrock-b" else 119
	for index in 28:
		var x: float = rng.randf_range(-extent*.48,extent*.48)
		var y: float = rng.randf_range(.05,extent-.05)
		var material: StandardMaterial3D = copper if name == "sand" else water if name == "fluid" else edge if index%4 == 0 else stone
		var size := Vector3(rng.randf_range(.12,.42),rng.randf_range(.10,.31),.10)
		if name == "sand": size *= .40
		var facet := _box("StratumFacet",Vector3(x,y,-.15+index*.002),size,material)
		facet.rotation.z = rng.randf_range(-.35,.35)
	if name == "ore":
		for index in 12:
			var x: float = -.94+float(index%4)*.62
			var y: float = .32+float(index/4)*.72
			var shard := _box("UnstableOreCrystal",Vector3(x,y,.05),Vector3(.21,.36,.10),cyan if index%3 != 0 else violet)
			shard.rotation.z = -.20+float(index%3)*.28
	if name == "fluid":
		for index in 8: _box("FluidInterference",Vector3(0,.16+index*.29,.13),Vector3(2.30,.025,.014),cyan)

func _wall(name: String) -> void:
	var height: float = camera.size
	var width: float = height*float(viewport.size.x)/viewport.size.y
	var mesh := BoxMesh.new()
	mesh.size = Vector3(width+.02,height+.02,.20)
	_mesh("InteriorBackPlane",mesh,Vector3(0,height*.5,-.40),dark)
	for row in 3:
		for column in 4:
			var x: float = -width*.375+column*width*.25
			var y: float = .17+row*2.25
			_box("RecessedInteriorPanel",Vector3(x,y+.88,-.22),Vector3(width*.242,2.14,.16),stone)
			_box("PanelTopSeam",Vector3(x,y+1.87,-.12),Vector3(width*.22,.035,.015),edge)
			for side in [-1.0,1.0]: _sphere("RecessedBolt",Vector3(x+side*width*.10,y+.16,-.07),Vector3(.045,.045,.028),edge)
	for x in [-3.8,-1.5,1.5,3.8]:
		_box("StructuralVertical",Vector3(x,height*.5,-.04),Vector3(.13,height,.12),edge)
		_box("ShaftInlay",Vector3(x-.03,height*.5,.03),Vector3(.025,height,.02),silver)
	for y in [1.10,4.62]:
		_box("ContinuousUtilityTrunk",Vector3(0,y,.08),Vector3(width,.17,.18),edge)
		_box("SealedPipeStripe",Vector3(0,y+.04,.18),Vector3(width,.033,.014),cyan if name == "wall-a" else violet)
	if name == "wall-b":
		for index in 5:
			_box("PressureManifold",Vector3(-2.8+index*1.40,3.22,.06),Vector3(.42,1.25,.21),dark)
			_box("GaugeDisplay",Vector3(-2.8+index*1.40,3.58,.18),Vector3(.26,.20,.02),cyan)
			for y in [2.8,2.94,3.08]: _box("ManifoldVent",Vector3(-2.8+index*1.40,y,.18),Vector3(.30,.031,.02),edge)

func _rib() -> void:
	var height: float = camera.size
	for side in [-1.0,1.0]:
		_box("StructuralColumn",Vector3(side*.85,height*.5,0),Vector3(.32,height-.20,.34),dark)
		_box("ColumnFrontArmor",Vector3(side*.85,height*.5,.20),Vector3(.22,height-.20,.12),edge)
	for y in [.30,1.50,3.10,4.70,6.30,7.90,9.05]:
		_box("CrossBrace",Vector3(0,y,.02),Vector3(1.90,.20,.30),edge)
		for x in [-.82,.82]: _sphere("StructuralRivet",Vector3(x,y,.20),Vector3(.062,.062,.025),silver)
	_box("PowerConduit",Vector3(-.25,height*.5,.03),Vector3(.14,height-.20,.13),violet)
	for y in [.80,2.65,4.35,6.10,8.45]: _box("ConduitClamp",Vector3(-.25,y,.12),Vector3(.29,.08,.05),edge)

func _machine(name: String) -> void:
	var width: float = camera.size*float(viewport.size.x)/viewport.size.y
	_box("GroundedMachineFoot",Vector3(0,.12,0),Vector3(width-.28,.24,.70),dark)
	_box("FootArmor",Vector3(0,.21,.34),Vector3(width-.34,.10,.08),edge)
	for side in [-1.0,1.0]:
		var x: float = side*(width*.5-.44)
		_box("SupportHousing",Vector3(x,.78,0),Vector3(.46,1.25,.64),edge)
		_box("SupportFace",Vector3(x,.85,.34),Vector3(.34,1.00,.06),silver)
		_box("TelemetryStrip",Vector3(x,.95,.38),Vector3(.055,.60,.02),cyan)
		for y in [.40,.59,.78]: _box("CoolingVent",Vector3(x,y,.39),Vector3(.24,.033,.015),dark)
	if name in ["station","lift"]:
		var height: float = 3.94 if name == "station" else 6.04
		for side in [-1.0,1.0]:
			var x: float = side*(width*.5-.48)
			_box("PortalUpright",Vector3(x,height*.5,0),Vector3(.28,height,.38),edge)
			_box("PortalEmission",Vector3(x-side*.16,height*.5,.02),Vector3(.033,height-.40,.20),cyan)
		_box("PortalLintel",Vector3(0,height-.15,0),Vector3(width-.65,.32,.40),edge)
		for index in 3: _box("HeaderTelemetry",Vector3(-.38+index*.38,height-.15,.225),Vector3(.15,.055,.013),lamp)
		if name == "lift":
			for side in [-1.0,1.0]: _box("HydraulicGuide",Vector3(side*(width*.5-.70),height*.48,-.32),Vector3(.14,height*.90,.14),silver)
			_box("LiftControlScreen",Vector3(-width*.5+.60,1.52,.36),Vector3(.34,.29,.025),cyan)
	elif name == "anchor":
		_box("StabilizerTower",Vector3(0,1.50,0),Vector3(.84,2.25,.65),dark)
		_box("TowerFront",Vector3(0,1.55,.35),Vector3(.70,1.92,.06),edge)
		_sphere("AnchorFieldHousing",Vector3(0,2.56,0),Vector3(.58,.57,.43),silver)
		_sphere("AnchorCyanLens",Vector3(0,2.56,.44),Vector3(.36,.35,.028),cyan)
		for y in [.65,.85,1.05]: _box("TowerVent",Vector3(0,y,.40),Vector3(.48,.045,.02),silver)
	else:
		_sphere("CoreHousing",Vector3(0,2.14,0),Vector3(1.26,1.40,.58),edge)
		_sphere("CoreContainment",Vector3(0,2.14,.55),Vector3(.86,1.02,.08),dark)
		_sphere("CoreEnergy",Vector3(0,2.14,.65),Vector3(.52,.70,.035),violet)
		for side in [-1.0,1.0]: _box("ContainmentGuard",Vector3(side*.93,2.10,.58),Vector3(.16,2.17,.13),silver)
		for y in [1.35,2.15,2.95]: _box("CoreFieldBand",Vector3(0,y,.70),Vector3(1.20,.045,.04),cyan)

func _crystal() -> void:
	_box("RiftCrystalFoot",Vector3(0,.09,0),Vector3(1.12,.18,.43),edge)
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var center := Vector3(0,1.35,0)
	var ring: Array[Vector3] = [Vector3(.47,0,0),Vector3(0,0,.32),Vector3(-.47,0,0),Vector3(0,0,-.32)]
	for index in 4:
		_face(surface,[Vector3(0,1.10,0),ring[index],ring[(index+1)%4]])
		_face(surface,[Vector3(0,-1.10,0),ring[(index+1)%4],ring[index]])
	_mesh("FacetedRiftCrystal",surface.commit(),center,violet)
	_box("CrystalConduit",Vector3(.06,1.32,.24),Vector3(.035,1.48,.018),cyan)

func _bake() -> void:
	var receipt := {"ok":false,"genre":"quantum-divergence","source":"Original geometry, no external meshes/textures", "sourceScriptSha256":FileAccess.get_sha256("res://tools/MineKitBaker.gd"),
		"helperScriptSha256":FileAccess.get_sha256("res://tools/DiverRigBaker.gd"),"renderDevice":RenderingServer.get_video_adapter_name(),
		"renderVendor":RenderingServer.get_video_adapter_vendor(),"pixelsPerUnit":96.0/3.5,"productionApproved":false,"assets":{}}
	for name in ASSETS:
		_setup_asset(name)
		await process_frame
		await RenderingServer.frame_post_draw
		var image := viewport.get_texture().get_image()
		assert(image != null and image.get_size() == ASSETS[name].frame)
		var bounds := image.get_used_rect()
		var size: Vector2i = ASSETS[name].frame
		if not bounds.has_area() or (not ASSETS[name].opaque and (bounds.position.x < 2 or bounds.end.x > size.x-2 or bounds.position.y < 2)):
			push_error("MINE_KIT_CLIPPED "+name)
			_write_receipt(receipt)
			quit(1)
			return
		var path: String = output.path_join(name+".png")
		assert(image.save_png(path) == OK)
		for node in rig.find_children("*","",true,false): node.owner = rig
		var packed := PackedScene.new()
		assert(packed.pack(rig) == OK)
		var scene: String = output.path_join(name+"-source.tscn")
		assert(ResourceSaver.save(packed,scene) == OK)
		receipt.assets[name] = {"path":name+".png","sha256":FileAccess.get_sha256(path),"sourcePath":name+"-source.tscn","sourceSha256":FileAccess.get_sha256(scene),
			"frame":[size.x,size.y],"logicalSize":[size.x/2,size.y/2],"pivot":[size.x/2,size.y],"opaque":ASSETS[name].opaque,
			"bounds":[bounds.position.x,bounds.position.y,bounds.size.x,bounds.size.y],"groundLine":camera.unproject_position(Vector3.ZERO).y}
		_write_receipt(receipt)
		viewport.queue_free()
		await process_frame
	receipt.ok = true
	_write_receipt(receipt)
	print("QUANTUM_MINE_KIT_BAKE "+JSON.stringify({"output":output,"assets":receipt.assets.size(),"renderDevice":receipt.renderDevice}))
	quit(0)
