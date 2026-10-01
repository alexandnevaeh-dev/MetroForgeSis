extends SceneTree
## Original mechanical rig. Transparent orthographic poses share one source and scale.
var output: String
var clip_names: Array[String] = ["seed"]
var viewport: SubViewport
var rig: Node3D
var torso: Node3D
var pelvis: MeshInstance3D
var scanner: Node3D
var camera: Camera3D
var limbs: Array[Dictionary] = []
var silver: StandardMaterial3D
var edge: StandardMaterial3D
var dark: StandardMaterial3D
var cyan: StandardMaterial3D
var violet: StandardMaterial3D
var lamp: StandardMaterial3D
const CLIPS := {"seed":[1,1],"idle":[6,10],"walk":[8,16],"run":[10,24],"attack":[6,24],"hit":[3,18],"death":[12,18],"jump":[4,16],"levitate":[6,16],"dash":[6,24]}

func _initialize() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			output = argument.trim_prefix("--output=")
		if argument.begins_with("--clips="):
			clip_names.assign(argument.trim_prefix("--clips=").split(","))
	assert(output.to_lower().begins_with("e:/") and not DirAccess.dir_exists_absolute(output))
	for clip in clip_names:
		assert(CLIPS.has(clip))
	assert(DirAccess.make_dir_recursive_absolute(output) == OK)
	call_deferred("_bake")

func _material(color: Color, metallic: float, roughness: float, emission: float = 0.0) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.metallic = metallic
	result.roughness = roughness
	if emission > 0:
		result.emission_enabled = true
		result.emission = color
		result.emission_energy_multiplier = emission
	return result

func _mesh(name: String, mesh: Mesh, at: Vector3, mat: StandardMaterial3D, parent: Node3D = null) -> MeshInstance3D:
	var obj := MeshInstance3D.new()
	obj.name = name
	obj.mesh = mesh
	obj.material_override = mat
	(rig if parent == null else parent).add_child(obj)
	obj.position = at
	return obj

func _box(name: String, at: Vector3, size: Vector3, mat: StandardMaterial3D, parent: Node3D = null) -> MeshInstance3D:
	return _mesh(name,_beveled_box(size),at,mat,parent)

func _face(surface: SurfaceTool, points: Array[Vector3]) -> void:
	var center := Vector3.ZERO
	for point in points:
		center += point
	center /= points.size()
	var normal := (points[1]-points[0]).cross(points[2]-points[0]).normalized()
	if normal.dot(center) < 0:
		points.reverse()
		normal = -normal
	for index in range(1,points.size()-1):
		for point in [points[0],points[index+1],points[index]]:
			surface.set_normal(normal)
			surface.add_vertex(point)

func _beveled_box(size: Vector3) -> ArrayMesh:
	# Six armor faces, twelve machined edges and eight corner facets.
	var half := size*.5
	var bevel := minf(half.x,minf(half.y,half.z))*.22
	var inside := half-Vector3.ONE*bevel
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for axis in 3:
		var other_a: int = (axis+1)%3
		var other_b: int = (axis+2)%3
		for sign_value in [-1.0,1.0]:
			var face: Array[Vector3] = []
			for signs in [Vector2(-1,-1),Vector2(1,-1),Vector2(1,1),Vector2(-1,1)]:
				var point := Vector3.ZERO
				point[axis] = sign_value*half[axis]
				point[other_a] = signs.x*inside[other_a]
				point[other_b] = signs.y*inside[other_b]
				face.append(point)
			_face(surface,face)
	for axis_a in 3:
		for axis_b in range(axis_a+1,3):
			var remaining: int = 3-axis_a-axis_b
			for sign_a in [-1.0,1.0]:
				for sign_b in [-1.0,1.0]:
					var a := Vector3.ZERO
					var b := Vector3.ZERO
					a[axis_a] = sign_a*half[axis_a]
					a[axis_b] = sign_b*inside[axis_b]
					b[axis_a] = sign_a*inside[axis_a]
					b[axis_b] = sign_b*half[axis_b]
					a[remaining] = -inside[remaining]
					b[remaining] = -inside[remaining]
					var c := b
					var d := a
					c[remaining] = inside[remaining]
					d[remaining] = inside[remaining]
					_face(surface,[a,b,c,d])
	for x in [-1.0,1.0]:
		for y in [-1.0,1.0]:
			for z in [-1.0,1.0]:
				_face(surface,[Vector3(x*half.x,y*inside.y,z*inside.z),Vector3(x*inside.x,y*half.y,z*inside.z),Vector3(x*inside.x,y*inside.y,z*half.z)])
	return surface.commit()

func _sphere(name: String, at: Vector3, size: Vector3, mat: StandardMaterial3D, parent: Node3D = null) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = 1.0
	mesh.height = 2.0
	mesh.radial_segments = 24
	mesh.rings = 12
	var obj := _mesh(name,mesh,at,mat,parent)
	obj.scale = size
	return obj

func _rod(name: String, a: Vector3, b: Vector3, radius: float, mat: StandardMaterial3D) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = 1.0
	mesh.radial_segments = 12
	var obj := _mesh(name,mesh,(a+b)*0.5,mat)
	_align(obj,a,b)
	return obj

func _align(obj: MeshInstance3D, a: Vector3, b: Vector3, thickness: float = 1.0) -> void:
	obj.position = (a+b)*0.5
	obj.quaternion = Quaternion(Vector3.UP,(b-a).normalized())
	obj.scale = Vector3(thickness,(b-a).length(),thickness)

func _build() -> void:
	viewport = SubViewport.new()
	viewport.size = Vector2i(64,96)
	viewport.transparent_bg = true
	viewport.own_world_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.msaa_3d = Viewport.MSAA_DISABLED
	root.add_child(viewport)
	rig = Node3D.new()
	rig.name = "QuantumDiverOriginalRig"
	viewport.add_child(rig)
	silver = _material(Color("d3dfeb"),0.15,0.35)
	edge = _material(Color("526d86"),0.7,0.35)
	dark = _material(Color("182b42"),0.25,0.46)
	cyan = _material(Color("11bac9"),0.35,0.18,0.5)
	violet = _material(Color("7c49b0"),0.3,0.35,0.18)
	lamp = _material(Color("6bf4ec"),0.1,0.25,1.2)
	torso = Node3D.new()
	torso.name = "TorsoPoseControl"
	rig.add_child(torso)
	torso.position.y = 1.30
	_box("TorsoJointHousing",Vector3(0,.60,0),Vector3(.48,.86,.45),dark,torso)
	_sphere("ChestArmor",Vector3(.07,.80,0),Vector3(.28,.30,.26),silver,torso)
	_box("LowerRibArmor",Vector3(0,.43,0),Vector3(.45,.20,.43),edge,torso)
	_box("WaistSeal",Vector3(0,.15,0),Vector3(.34,.23,.34),dark,torso)
	_box("NearChestSidePanel",Vector3(.035,.80,.245),Vector3(.35,.32,.045),silver,torso)
	_box("NearAbdomenPanel",Vector3(.01,.51,.227),Vector3(.29,.18,.04),silver,torso)
	_box("VioletSideConduit",Vector3(-.13,.75,.274),Vector3(.025,.29,.012),violet,torso)
	_box("ReactorHousing",Vector3(.34,.80,0),Vector3(.14,.31,.38),dark,torso)
	_box("CyanReactor",Vector3(.415,.80,0),Vector3(.025,.18,.28),cyan,torso)
	_box("Backpack",Vector3(-.40,.70,0),Vector3(.26,.70,.43),dark,torso)
	_box("VioletReservoir",Vector3(-.54,.74,.02),Vector3(.05,.52,.32),violet,torso)
	_sphere("NeckBearing",Vector3(0,1.16,0),Vector3(.10,.15,.10),edge,torso)
	_sphere("HelmetShell",Vector3(.03,1.52,0),Vector3(.255,.295,.23),silver,torso)
	_sphere("VisorGasket",Vector3(.19,1.54,.016),Vector3(.22,.238,.227),dark,torso)
	_sphere("OpaqueCyanVisor",Vector3(.235,1.55,.018),Vector3(.188,.191,.218),cyan,torso)
	_box("BrowPlate",Vector3(.20,1.72,.014),Vector3(.32,.07,.43),silver,torso)
	_box("JawGuard",Vector3(.19,1.31,.014),Vector3(.28,.08,.40),edge,torso)
	_sphere("HelmetReceiver",Vector3(-.018,1.52,.255),Vector3(.083,.102,.037),edge,torso)
	_box("ReceiverLight",Vector3(-.019,1.52,.296),Vector3(.054,.025,.008),lamp,torso)
	for y in [.56,.74,.92]:
		_box("PackCoolingRib",Vector3(-.57,y,.025),Vector3(.05,.026,.34),silver,torso)
	for y in [.50,.77]:
		_box("BackpackSidePlate",Vector3(-.40,y,.231),Vector3(.19,.18,.025),edge,torso)
	_box("BackpackTopPlate",Vector3(-.4,1.06,0),Vector3(.23,.06,.42),silver,torso)
	_box("BackpackBottomEmitter",Vector3(-.4,.355,.01),Vector3(.14,.025,.28),lamp,torso)
	for y in [.52,.61,.70]:
		_box("SideArmorVent",Vector3(.065,y,.255),Vector3(.16,.019,.01),dark,torso)
	for x in [-.09,.14]:
		for y in [.76,.93]:
			_sphere("PanelFastener",Vector3(x,y,.26),Vector3(.017,.017,.01),edge,torso)
	pelvis = _box("HipArmor",Vector3(0,1.30,0),Vector3(.43,.26,.43),edge)
	for z in [-.17,.17]:
		var hip := Vector3(0,1.30,z)
		var knee := Vector3(.14,.73,z)
		var ankle := Vector3(.025,.15,z)
		var shoulder := Vector3(.035,2.27,z*1.5)
		var elbow := Vector3(.10,1.97,z*1.5)
		var wrist := Vector3(.46,1.85,z*1.5)
		limbs.append({"z":z,"upper":_rod("Thigh",hip,knee,.10,dark),"lower":_rod("Shin",knee,ankle,.095,dark),
			"knee":_sphere("KneeBearing",knee,Vector3(.105,.105,.11),edge),
			"thigh":_rod("ThighArmor",hip.lerp(knee,.15),hip.lerp(knee,.75),.135,silver),
			"shin":_rod("ShinArmor",knee.lerp(ankle,.15),knee.lerp(ankle,.82),.13,silver),
			"boot":_box("GroundedBoot",Vector3(.13,.12,z),Vector3(.42,.24,.26),dark),
			"toe":_box("ToeArmor",Vector3(.26,.15,z+.01),Vector3(.18,.15,.255),silver),
			"lamp":_box("AnkleLamp",Vector3(.14,.21,z+.145),Vector3(.09,.027,.01),lamp),
			"arm_upper":_rod("UpperArm",shoulder,elbow,.085,dark),"arm_lower":_rod("Forearm",elbow,wrist,.08,edge),
			"shoulder":_sphere("ShoulderShell",shoulder,Vector3(.16,.16,.145),silver),
			"elbow":_sphere("ElbowBearing",elbow,Vector3(.085,.085,.09),violet),
			"hand":_box("Glove",wrist,Vector3(.18,.14,.15),dark)})
	scanner = Node3D.new()
	scanner.name = "HeldMiningScanner"
	rig.add_child(scanner)
	_box("ScannerHousing",Vector3(.04,.04,0),Vector3(.35,.16,.18),edge,scanner)
	_box("ScannerBarrel",Vector3(.27,.06,0),Vector3(.15,.08,.10),silver,scanner)
	_box("ScannerEmitter",Vector3(.355,.06,0),Vector3(.014,.045,.072),lamp,scanner)
	_box("ScannerGrip",Vector3(-.01,-.06,0),Vector3(.10,.17,.13),dark,scanner)
	camera = Camera3D.new()
	viewport.add_child(camera)
	camera.position = Vector3(0,1.75,8)
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	camera.size = 3.5
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

func _joint_between(hip: Vector3, ankle: Vector3, first_length: float, second_length: float, bend_side: float) -> Vector3:
	var delta := Vector2(ankle.x-hip.x,ankle.y-hip.y)
	var distance := clampf(delta.length(),absf(first_length-second_length)+.001,first_length+second_length-.001)
	var direction := delta.normalized()
	var projection := (first_length*first_length-second_length*second_length+distance*distance)/(2*distance)
	var bend := sqrt(maxf(0,first_length*first_length-projection*projection))
	var point := Vector2(hip.x,hip.y)+direction*projection+Vector2(-direction.y,direction.x)*bend*bend_side
	return Vector3(point.x,point.y,hip.z)

func _pose(clip: String, t: float) -> bool:
	var stride: bool = clip in ["walk","run","dash"]
	var fast: bool = clip in ["run","dash"]
	var dead: float = t if clip == "death" else 0.0
	var hip_y: float = lerpf(1.30+(.022*cos(TAU*2*t) if stride else .018*sin(TAU*t)),.28,dead)
	# Keep the folded corpse inside the same fixed camera; never rescale a pose.
	var hip_x: float = -.70*dead
	var lean: float = (.10 if fast else 0.0)+1.12*dead
	if clip == "idle":
		lean += .014*cos(TAU*t)
	if clip == "hit":
		lean = -.16*sin(PI*t)
	torso.position = Vector3(hip_x,hip_y,0)
	torso.rotation.z = -lean
	pelvis.position = torso.position
	pelvis.rotation.z = -lean*.3
	var attack: float = maxf(0,sin(PI*t)) if clip == "attack" else 0.0
	for index in limbs.size():
		var part: Dictionary = limbs[index]
		var z: float = part.z
		var phase: float = fposmod(t+index*.5,1.0)
		var foot_x: float = .025
		var lift: float = 0.0
		if stride:
			var reach: float = .34 if fast else .24
			if phase < .56:
				foot_x = reach*(.5-phase/.56)
			else:
				var swing: float = (phase-.56)/.44
				foot_x = reach*(-.5+swing)
				lift = (.20 if fast else .13)*sin(PI*swing)
		if clip in ["jump","levitate"]:
			foot_x = -.16 if index == 0 else .18
			lift = .08+.06*sin(PI*t)
		if dead > 0:
			foot_x = (-.43 if index == 0 else -.66)*dead
		var hip := Vector3(hip_x,hip_y,z)
		var ankle := Vector3(foot_x,.15+lift,z)
		var knee := _joint_between(hip,ankle,.62,.62,1.0)
		if absf(hip.distance_to(knee)-.62) >= .002 or absf(knee.distance_to(ankle)-.62) >= .002:
			return _pose_failed(clip,t,"leg reach")
		_align(part.upper,hip,knee)
		_align(part.lower,knee,ankle)
		part.knee.position = knee
		_align(part.thigh,hip.lerp(knee,.15),hip.lerp(knee,.75))
		_align(part.shin,knee.lerp(ankle,.15),knee.lerp(ankle,.82))
		part.boot.position = Vector3(foot_x+.10,.12+lift,z)
		part.toe.position = Vector3(foot_x+.23,.15+lift,z+.01)
		part.lamp.position = Vector3(foot_x+.12,.21+lift,z+.145)
		var shoulder: Vector3 = torso.transform*Vector3(.035,.97,z*1.5)
		var wrist := shoulder+Vector3(.42+.17*attack,-.42+.36*attack,0)
		if clip == "hit":
			wrist.x -= .12*sin(PI*t)
		if dead > 0:
			wrist = wrist.lerp(shoulder+Vector3(-.15,-.46,0),dead)
		var elbow := _joint_between(shoulder,wrist,.31,.38,-1.0)
		if absf(shoulder.distance_to(elbow)-.31) >= .002 or absf(elbow.distance_to(wrist)-.38) >= .002:
			return _pose_failed(clip,t,"arm reach")
		_align(part.arm_upper,shoulder,elbow)
		_align(part.arm_lower,elbow,wrist)
		part.shoulder.position = shoulder
		part.elbow.position = elbow
		part.hand.position = wrist
		if index == 1:
			scanner.position = wrist+Vector3(.04,.02,0)
	return true

func _pose_failed(clip: String, t: float, reason: String) -> bool:
	var file := FileAccess.open(output.path_join("failed.json"),FileAccess.WRITE)
	file.store_string(JSON.stringify({"ok":false,"clip":clip,"phase":t,"reason":reason,"productionApproved":false},"\t"))
	push_error("RIG_POSE_FAILED: " + clip + " / " + reason)
	return false

func _save_source() -> void:
	for node in rig.find_children("*","",true,false):
		node.owner = rig
	var packed := PackedScene.new()
	assert(packed.pack(rig) == OK)
	assert(ResourceSaver.save(packed,output.path_join("quantum-diver-source.tscn")) == OK)

func _bake() -> void:
	_build()
	await process_frame
	if not _pose("seed",0):
		quit(1)
		return
	_save_source()
	var receipt := {"ok":false,"source":"Original authored articulated geometry; no external meshes/textures", "godot":Engine.get_version_info(),
		"sourceScriptSha256":FileAccess.get_sha256("res://tools/DiverRigBaker.gd"),"sourceSceneSha256":FileAccess.get_sha256(output.path_join("quantum-diver-source.tscn")),
		"frame":[64,96],"logicalSize":[32,48],"pivot":[32,96],"transparent":true,"productionApproved":false,"animationReady":false,
		"renderDevice":RenderingServer.get_video_adapter_name(),"renderVendor":RenderingServer.get_video_adapter_vendor(),"clips":{}}
	for clip in clip_names:
		var count: int = CLIPS[clip][0]
		var fps: int = CLIPS[clip][1]
		var directory: String = output.path_join(clip)
		assert(DirAccess.make_dir_recursive_absolute(directory) == OK)
		var frames: Array[Dictionary] = []
		for index in count:
			var t: float = float(index)/maxi(1,count-1) if clip == "death" else float(index)/count
			if clip == "hit":
				t = (.5+index)/count
			if not _pose(clip,t):
				_write_receipt(receipt)
				quit(1)
				return
			await process_frame
			await RenderingServer.frame_post_draw
			var image := viewport.get_texture().get_image()
			assert(image != null and image.get_size() == Vector2i(64,96))
			var path: String = directory.path_join("frame-%02d.png" % (index+1))
			assert(image.save_png(path) == OK)
			var bounds := image.get_used_rect()
			assert(bounds.has_area())
			if bounds.position.x < 2 or bounds.end.x > 62 or bounds.position.y < 2:
				_pose_failed(clip,t,"clipped bounds")
				_write_receipt(receipt)
				quit(1)
				return
			frames.append({"path":path.trim_prefix(output+"/"),"sha256":FileAccess.get_sha256(path),
				"bounds":[bounds.position.x,bounds.position.y,bounds.size.x,bounds.size.y],"groundLine":camera.unproject_position(Vector3.ZERO).y})
		receipt.clips[clip] = {"frames":frames,"fps":fps,"count":count}
		_write_receipt(receipt)
	if clip_names == ["seed"]:
		viewport.size = Vector2i(512,768)
		await process_frame
		await RenderingServer.frame_post_draw
		assert(viewport.get_texture().get_image().save_png(output.path_join("design-detail.png")) == OK)
	receipt.ok = true
	receipt.boneLengthsVerified = true
	_write_receipt(receipt)
	print("QUANTUM_DIVER_BAKE " + JSON.stringify({"output":output,"clips":clip_names,"renderDevice":receipt.renderDevice,"productionApproved":false}))
	quit(0)

func _write_receipt(receipt: Dictionary) -> void:
	var file := FileAccess.open(output.path_join("receipt.json"),FileAccess.WRITE)
	assert(file != null)
	file.store_string(JSON.stringify(receipt,"\t"))
