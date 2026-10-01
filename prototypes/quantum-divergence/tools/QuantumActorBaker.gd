extends "res://tools/DiverRigBaker.gd"
## Original matching cast. Geometry is articulated once, then baked at one camera scale.
## Reuses the Diver's mesh/material helpers without modifying its verified source.
const CONTRACT := {
	"skitter":{"frame":Vector2i(64,64),"logical":Vector2i(32,32),"clips":{"seed":[1,1],"idle":[6,10],"walk":[8,16],"run":[10,24],"attack":[6,24],"hit":[3,18],"death":[8,18]}},
	"driller":{"frame":Vector2i(96,64),"logical":Vector2i(48,32),"clips":{"seed":[1,1],"idle":[6,10],"walk":[8,16],"run":[10,24],"attack":[8,24],"hit":[3,18],"death":[8,18],"drill":[8,24]}},
	"wraith":{"frame":Vector2i(64,96),"logical":Vector2i(32,48),"clips":{"seed":[1,1],"idle":[6,10],"walk":[8,16],"run":[8,24],"attack":[6,24],"hit":[3,18],"death":[10,18],"levitate":[6,16]}},
	"golem":{"frame":Vector2i(128,192),"logical":Vector2i(64,96),"clips":{"seed":[1,1],"idle":[8,10],"walk":[10,16],"run":[12,24],"attack":[12,24],"hit":[4,18],"death":[16,18],"slam":[12,24],"burst":[10,24],"roar":[8,24]}}}
var actor_kind: String = ""
var body_control: Node3D
var cast_legs: Array[Dictionary] = []
var cast_arms: Array[Dictionary] = []
var fragments: Array[Dictionary] = []
var drill_control: Node3D
var jaw: MeshInstance3D
var core_light: MeshInstance3D
var core_scale := Vector3.ONE
var frame_size: Vector2i
var clips: Dictionary

func _initialize() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output = argument.trim_prefix("--output=")
		if argument.begins_with("--actor="): actor_kind = argument.trim_prefix("--actor=")
		if argument.begins_with("--clips="): clip_names.assign(argument.trim_prefix("--clips=").split(","))
	if not CONTRACT.has(actor_kind) or not output.to_lower().begins_with("e:/") or DirAccess.dir_exists_absolute(output):
		push_error("CAST_BAKE_INVALID_ARGUMENTS")
		quit(1)
		return
	frame_size = CONTRACT[actor_kind].frame
	clips = CONTRACT[actor_kind].clips
	for clip in clip_names:
		if not clips.has(clip):
			push_error("CAST_BAKE_UNSUPPORTED_CLIP " + clip)
			quit(1)
			return
	assert(DirAccess.make_dir_recursive_absolute(output) == OK)
	call_deferred("_bake")

func _build() -> void:
	viewport = SubViewport.new()
	viewport.size = frame_size
	viewport.transparent_bg = true
	viewport.own_world_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.msaa_3d = Viewport.MSAA_DISABLED
	root.add_child(viewport)
	rig = Node3D.new()
	rig.name = "QuantumOriginal_" + actor_kind
	viewport.add_child(rig)
	silver = _material(Color("d3dfeb"),.15,.35)
	edge = _material(Color("526d86"),.7,.35)
	dark = _material(Color("182b42"),.25,.46)
	cyan = _material(Color("11bac9"),.35,.18,.5)
	violet = _material(Color("7c49b0"),.3,.35,.18)
	lamp = _material(Color("6bf4ec"),.1,.25,1.2)
	body_control = Node3D.new()
	body_control.name = "BodyPoseControl"
	rig.add_child(body_control)
	match actor_kind:
		"skitter": _build_crawler(false)
		"driller": _build_crawler(true)
		"wraith": _build_wraith()
		"golem": _build_golem()
	if core_light != null: core_scale = core_light.scale
	if actor_kind == "golem": rig.scale = Vector3.ONE*1.15
	camera = Camera3D.new()
	viewport.add_child(camera)
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	# Identical pixel density to the Diver, including the larger boss frame.
	camera.size = float(frame_size.y)*3.5/96.0
	camera.position = Vector3(0,0 if actor_kind == "wraith" else camera.size*.5,8)
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

func _build_crawler(driller: bool) -> void:
	var center_x: float = -.32 if driller else -.05
	body_control.position = Vector3(center_x,.88,0)
	_sphere("SealedCarapace",Vector3(0,.23,0),Vector3(.70 if driller else .52,.30,.34),dark,body_control)
	for x in [-.42,-.20,.02,.24]:
		_box("MachinedShellPlate",Vector3(x,.38,.16),Vector3(.20,.24,.39),silver,body_control)
		_box("CoolingSeam",Vector3(x+.105,.34,.363),Vector3(.022,.20,.015),cyan,body_control)
	_box("LowerSealedRail",Vector3(0,.10,.33),Vector3(1.19 if driller else .88,.12,.08),edge,body_control)
	for x in [-.32,-.10,.12,.34]:
		_sphere("CarapaceFastener",Vector3(x,.28,.39),Vector3(.023,.023,.012),edge,body_control)
	_box("VioletPressureReservoir",Vector3(-.40,.02,0),Vector3(.14,.28,.50),violet,body_control)
	_box("RearCoolingPack",Vector3(-.62,.18,.01),Vector3(.18,.30,.34),edge,body_control)
	for y in [.09,.18,.27]:
		_box("HeatSinkRib",Vector3(-.72,y,0),Vector3(.06,.026,.32),silver,body_control)
	_sphere("ForwardSensorHousing",Vector3(.46,.26,0),Vector3(.23,.22,.28),edge,body_control)
	_sphere("SensorLens",Vector3(.56,.31,.24),Vector3(.10,.11,.037),cyan,body_control)
	_box("SensorBrow",Vector3(.55,.46,.19),Vector3(.22,.05,.20),silver,body_control)
	if driller:
		drill_control = Node3D.new()
		drill_control.name = "SpinningHelicalDrill"
		body_control.add_child(drill_control)
		drill_control.position = Vector3(.86,.08,0)
		var cone := CylinderMesh.new()
		cone.top_radius = 0
		cone.bottom_radius = .30
		cone.height = .72
		cone.radial_segments = 24
		var drill_mesh := _mesh("DrillCone",cone,Vector3(.34,0,0),silver,drill_control)
		drill_mesh.rotation.z = -PI*.5
		for index in 14:
			var phase: float = float(index)/14.0
			var angle: float = phase*TAU*2.0
			var radius: float = .28*(1-phase)
			_sphere("SpiralCuttingTooth",Vector3(phase*.67,radius*cos(angle),radius*sin(angle)),Vector3(.055,.055,.055),edge,drill_control)
		_box("DriveCollar",Vector3(.72,.08,0),Vector3(.15,.48,.48),dark,body_control)
		_box("MotorDiagnostic",Vector3(.74,.14,.26),Vector3(.07,.18,.012),lamp,body_control)
	else:
		jaw = _box("RammingMandible",Vector3(.59,.02,0),Vector3(.32,.12,.40),silver,body_control)
		_box("MandibleSeal",Vector3(.70,.09,0),Vector3(.05,.08,.34),cyan,body_control)
	for side in [-1.0,1.0]:
		for index in 3:
			var x: float = -.40+index*.34+center_x
			var foot_x: float = -.73+index*.65+center_x
			_add_leg(Vector3(x,.91,side*.20),Vector3(foot_x,.08,side*.39),.52,.59,.12,Vector3(.26,.16,.20),float(index)*.333+(0.0 if side > 0 else .5),-1.0 if index == 0 else 1.0)

func _add_leg(hip: Vector3, ankle: Vector3, first: float, second: float, radius: float, foot_size: Vector3, phase: float, bend: float) -> void:
	# Each leg is solved in its own side plane, preserving both segment lengths.
	var knee := _joint_between(hip,Vector3(ankle.x,ankle.y,hip.z),first,second,bend)
	cast_legs.append({"hip":hip,"foot":ankle,"first":first,"second":second,"phase":phase,"bend":bend,"foot_size":foot_size,
		"upper":_rod("LegActuator",hip,knee,radius*.65,dark),"lower":_rod("DistalActuator",knee,ankle,radius*.55,dark),
		"armor_upper":_rod("UpperLegArmor",hip.lerp(knee,.20),hip.lerp(knee,.80),radius,silver),
		"armor_lower":_rod("LowerLegArmor",knee.lerp(ankle,.16),knee.lerp(ankle,.82),radius*.80,edge),
		"joint":_sphere("LegBearing",knee,Vector3.ONE*radius*.90,violet),
		"boot":_box("GroundContactClaw",Vector3(ankle.x,foot_size.y*.5,ankle.z),foot_size,dark),
		"toe":_box("ClawArmor",Vector3(ankle.x+.04,foot_size.y*.65,ankle.z+.025),foot_size*Vector3(.65,.55,.92),silver),
		"light":_box("ContactDiagnostic",Vector3(ankle.x,foot_size.y*.8,ankle.z+foot_size.z*.51),Vector3(foot_size.x*.30,.023,.012),lamp)})

func _build_golem() -> void:
	body_control.position.y = 2.35
	_box("ThoracicFrame",Vector3(0,1.42,0),Vector3(1.18,1.77,.80),dark,body_control)
	_box("ChestArmor",Vector3(.06,1.60,.37),Vector3(1.07,.89,.18),silver,body_control)
	_box("AbdominalLaminate",Vector3(0,.90,.37),Vector3(.90,.33,.18),edge,body_control)
	_sphere("ProbabilityCore",Vector3(.05,1.57,.50),Vector3(.30,.30,.06),cyan,body_control)
	core_light = _sphere("CoreEmitter",Vector3(.05,1.57,.57),Vector3(.13,.13,.025),lamp,body_control)
	for x in [-.43,.45]:
		_box("CoreGuardRail",Vector3(x,1.50,.50),Vector3(.11,.75,.11),edge,body_control)
		for y in [1.20,1.85]: _sphere("ChestLock",Vector3(x,y,.57),Vector3(.045,.045,.018),silver,body_control)
	_box("WaistGasket",Vector3(0,.34,0),Vector3(.75,.65,.63),dark,body_control)
	for y in [.50,.66,.82]: _box("AbdominalVent",Vector3(.02,y,.40),Vector3(.50,.045,.04),silver,body_control)
	_box("BackReactor",Vector3(-.55,1.50,0),Vector3(.35,1.60,.65),edge,body_control)
	for y in [1.0,1.32,1.64,1.96]: _box("ReactorHeatFin",Vector3(-.76,y,0),Vector3(.10,.07,.64),violet,body_control)
	_sphere("NeckPivot",Vector3(0,2.47,0),Vector3(.22,.26,.20),edge,body_control)
	_box("CrownArmor",Vector3(.02,2.91,0),Vector3(.81,.66,.65),silver,body_control)
	_box("FacialSeal",Vector3(.28,2.91,.15),Vector3(.43,.39,.53),dark,body_control)
	_box("TwinOpticBand",Vector3(.30,3.00,.43),Vector3(.40,.065,.025),lamp,body_control)
	_box("JawArmor",Vector3(.31,2.64,.22),Vector3(.49,.12,.49),edge,body_control)
	for side in [-1.0,1.0]:
		_add_leg(Vector3(0,2.35,side*.35),Vector3(.04,.22,side*.35),1.13,1.14,.24,Vector3(.82,.44,.61),0.0 if side > 0 else .5,1)
		var shoulder := Vector3(.03,4.56,side*.57)
		var elbow := Vector3(.50,3.67,side*.57)
		var wrist := Vector3(.70,2.92,side*.57)
		cast_arms.append({"local":Vector3(.03,2.21,side*.57),"z":side*.57,
			"upper":_rod("ShoulderActuator",shoulder,elbow,.15,dark),"lower":_rod("ForearmActuator",elbow,wrist,.17,dark),
			"armor_upper":_rod("UpperArmShield",shoulder.lerp(elbow,.2),shoulder.lerp(elbow,.8),.30,silver),
			"armor_lower":_rod("ForearmShield",elbow.lerp(wrist,.1),elbow.lerp(wrist,.85),.32,edge),
			"shoulder":_sphere("ShoulderArmor",shoulder,Vector3(.39,.38,.34),silver),
			"elbow":_sphere("ElbowBearing",elbow,Vector3(.20,.20,.20),violet),
			"hand":_box("ImpactFist",wrist,Vector3(.61,.66,.55),silver),
			"light":_box("KnuckleEmitter",wrist+Vector3(.21,.06,.28),Vector3(.10,.35,.024),cyan)})

func _build_wraith() -> void:
	_sphere("FloatingCoreHousing",Vector3(0,.25,0),Vector3(.25,.42,.20),dark,body_control)
	core_light = _sphere("EntropicCore",Vector3(.05,.26,.21),Vector3(.14,.29,.025),lamp,body_control)
	_box("ForwardMask",Vector3(.16,.92,0),Vector3(.42,.35,.34),silver,body_control)
	_box("OpticSlit",Vector3(.27,.97,.19),Vector3(.25,.04,.018),cyan,body_control)
	_box("BrowFin",Vector3(.12,1.13,0),Vector3(.50,.06,.37),edge,body_control)
	for index in 8:
		var side: float = -1.0 if index%2 == 0 else 1.0
		var row: int = index/2
		var at := Vector3(side*(.32+.075*row),.70-row*.49,.02+index*.018)
		var part := _box("SuspendedArmorShard",at,Vector3(.16,.34-row*.035,.16),silver if index%3 != 0 else edge,body_control)
		part.rotation.z = side*(.22+row*.07)
		var mark := _box("ShardEnergySeam",at+Vector3(.01,0,.105),Vector3(.028,.22-row*.026,.012),cyan,body_control)
		fragments.append({"part":part,"mark":mark,"at":at,"phase":index*.37,"angle":part.rotation.z})
	_box("RearPhaseConduit",Vector3(-.25,.70,0),Vector3(.08,.49,.28),violet,body_control)
	for index in 4:
		_sphere("BoundEnergyBead",Vector3(.05+sin(index)*.15,-.34-index*.19,.03),Vector3.ONE*(.058-index*.007),cyan,body_control)

func _pose(clip: String, t: float) -> bool:
	var moving: bool = clip in ["walk","run","drill"]
	var fast: bool = clip in ["run","drill"]
	var dead: float = t if clip == "death" else 0.0
	var pulse: float = sin(PI*t)
	lamp.albedo_color = Color("6bf4ec").lerp(Color("182b42"),dead)
	lamp.emission_energy_multiplier = lerpf(1.2,0.0,dead)
	cyan.albedo_color = Color("11bac9").lerp(Color("182b42"),dead)
	cyan.emission_energy_multiplier = lerpf(.5,0.0,dead)
	body_control.scale = Vector3.ONE
	if actor_kind == "wraith":
		body_control.position = Vector3(-.10*pulse if clip == "hit" else .04*sin(TAU*t),.045*sin(TAU*t),0)
		body_control.rotation.z = -.13 if fast else -.035*sin(TAU*t)
		if clip == "attack": body_control.rotation.z = -.12*pulse
		if clip == "death":
			body_control.scale = Vector3.ONE*lerpf(1.0,.22,dead)
			body_control.rotation.z = dead*.70
		for fragment in fragments:
			var oscillation := Vector3(.03*sin(TAU*t+fragment.phase),.045*cos(TAU*t+fragment.phase),0)
			var at: Vector3 = fragment.at+oscillation
			if clip == "attack": at.x += signf(at.x)*pulse*.12
			if clip == "death": at *= lerpf(1.0,.2,dead)
			fragment.part.position = at
			fragment.mark.position = at+Vector3(.01,0,.105)
			fragment.part.rotation.z = fragment.angle+.06*sin(TAU*t+fragment.phase)
		core_light.scale = core_scale*(1.0+.12*sin(TAU*t))
		return true
	var boss: bool = actor_kind == "golem"
	var nominal_y: float = 2.35 if boss else .88
	var nominal_x: float = 0 if boss else -.32 if actor_kind == "driller" else -.05
	var hip_y: float = nominal_y+(.028 if boss else .012)*sin(TAU*t*(2 if moving else 1))
	var lean: float = (.05 if fast else 0.0)
	if clip == "idle": lean += .018*cos(TAU*t)
	if clip in ["burst","roar"]: lean += .04*cos(TAU*t)
	if clip in ["attack","slam"]: hip_y -= (.10 if boss else .08)*pulse
	if clip == "hit": lean = -.14*pulse
	if dead > 0:
		hip_y = lerpf(nominal_y,.45 if boss else .27,dead)
		lean = 1.10*dead if boss else .10*dead
	body_control.position = Vector3(nominal_x-(1.15*dead if boss else 0),hip_y,0)
	body_control.rotation.z = -lean
	var slam: bool = boss and clip in ["attack","slam"]
	var slam_impact: float = 0.0
	if slam and t >= .5:
		slam_impact = 1.0 if t < 2.0/3.0 else 1.0-(t-2.0/3.0)*3.0
		hip_y = lerpf(nominal_y,.40,slam_impact)
		body_control.position = Vector3(-.4*slam_impact,hip_y,0)
		body_control.rotation.z = -(.5+(.02*(t-.5)*6 if t < 2.0/3.0 else 0.0))*slam_impact
	for leg in cast_legs:
		var phase: float = fposmod(t+float(leg.phase),1)
		var lift: float = 0
		var foot_x: float = leg.foot.x
		if moving:
			var reach: float = (.50 if fast else .34) if boss else (.24 if fast else .16)
			if phase < .58: foot_x += reach*(.5-phase/.58)
			else:
				var swing: float = (phase-.58)/.42
				foot_x += reach*(-.5+swing)
				lift = (.23 if boss else .10)*sin(PI*swing)
		if boss and dead > 0: foot_x -= dead*.30
		var hip: Vector3 = body_control.transform*(Vector3(leg.hip)-Vector3(nominal_x,nominal_y,0))
		var ankle := Vector3(foot_x,float(leg.foot.y)+lift,hip.z)
		var knee := _joint_between(hip,ankle,float(leg.first),float(leg.second),float(leg.bend))
		if absf(hip.distance_to(knee)-float(leg.first)) >= .002 or absf(knee.distance_to(ankle)-float(leg.second)) >= .002:
			return _pose_failed(clip,t,"cast leg reach")
		_align(leg.upper,hip,knee)
		_align(leg.lower,knee,ankle)
		_align(leg.armor_upper,hip.lerp(knee,.20),hip.lerp(knee,.80))
		_align(leg.armor_lower,knee.lerp(ankle,.16),knee.lerp(ankle,.82))
		leg.joint.position = knee
		var size: Vector3 = leg.foot_size
		leg.boot.position = Vector3(foot_x,size.y*.5+lift,leg.foot.z)
		leg.toe.position = Vector3(foot_x+.04,size.y*.65+lift,leg.foot.z+.025)
		leg.light.position = Vector3(foot_x,size.y*.8+lift,leg.foot.z+size.z*.51)
	if drill_control != null:
		drill_control.rotation.x = TAU*t
	if jaw != null: jaw.position.x = .59+(.10*pulse if clip == "attack" else .01*sin(TAU*t))
	for arm in cast_arms:
		var shoulder: Vector3 = body_control.transform*Vector3(arm.local)
		var wrist: Vector3 = shoulder+Vector3(.64,-1.48,0)
		if moving: wrist.x += .16*sin(TAU*t+float(arm.z)*4)
		if clip in ["attack","slam"]:
			# Frames 0..5 anticipate, 6..7 impact at ground, 8..11 recover.
			if t < .5: wrist = shoulder+Vector3(.95,lerpf(-1.42,.48,t*2),0)
			else: wrist = (shoulder+Vector3(.64,-1.48,0)).lerp(Vector3(shoulder.x+.15,.33,shoulder.z),slam_impact)
		if clip in ["burst","roar"]: wrist = shoulder+Vector3(.89,-.65+.18*sin(TAU*t),0)
		if dead > 0: wrist = shoulder+Vector3(.34,-minf(1.12,maxf(.2,shoulder.y-.33)),0)
		# During the rise after impact, keep the fist inside its fixed actuator reach.
		var reach: Vector3 = wrist-shoulder
		if reach.length() > 1.99: wrist = shoulder+reach.normalized()*1.99
		var elbow := _joint_between(shoulder,wrist,1.02,1.00,-1)
		if absf(shoulder.distance_to(elbow)-1.02) >= .002 or absf(elbow.distance_to(wrist)-1.0) >= .002:
			return _pose_failed(clip,t,"cast arm reach")
		_align(arm.upper,shoulder,elbow)
		_align(arm.lower,elbow,wrist)
		_align(arm.armor_upper,shoulder.lerp(elbow,.2),shoulder.lerp(elbow,.8))
		_align(arm.armor_lower,elbow.lerp(wrist,.1),elbow.lerp(wrist,.85))
		arm.shoulder.position = shoulder
		arm.elbow.position = elbow
		arm.hand.position = wrist
		arm.light.position = wrist+Vector3(.21,.06,.28)
	if core_light != null: core_light.scale = core_scale*(1.0+.08*sin(TAU*t))
	return true

func _bake() -> void:
	_build()
	await process_frame
	if not _pose("seed",0):
		quit(1)
		return
	_save_source()
	var pivot := Vector2i(frame_size.x/2,frame_size.y/2 if actor_kind == "wraith" else frame_size.y)
	var receipt := {"ok":false,"actor":actor_kind,"source":"Original authored articulated geometry; no external meshes/textures", "godot":Engine.get_version_info(),
		"sourceScriptSha256":FileAccess.get_sha256("res://tools/QuantumActorBaker.gd"),"helperScriptSha256":FileAccess.get_sha256("res://tools/DiverRigBaker.gd"),
		"sourceSceneSha256":FileAccess.get_sha256(output.path_join("quantum-diver-source.tscn")),
		"frame":[frame_size.x,frame_size.y],"logicalSize":[CONTRACT[actor_kind].logical.x,CONTRACT[actor_kind].logical.y],"pivot":[pivot.x,pivot.y],
		"pixelsPerUnit":96.0/3.5,"transparent":true,"productionApproved":false,"animationReady":false,
		"renderDevice":RenderingServer.get_video_adapter_name(),"renderVendor":RenderingServer.get_video_adapter_vendor(),"clips":{}}
	for clip in clip_names:
		var count: int = clips[clip][0]
		var fps: int = clips[clip][1]
		var directory: String = output.path_join(clip)
		assert(DirAccess.make_dir_recursive_absolute(directory) == OK)
		var frames: Array[Dictionary] = []
		for index in count:
			var t: float = float(index)/maxi(1,count-1) if clip == "death" else float(index)/count
			if clip == "hit": t = (.5+index)/count
			if not _pose(clip,t):
				_write_receipt(receipt)
				quit(1)
				return
			await process_frame
			await RenderingServer.frame_post_draw
			var image := viewport.get_texture().get_image()
			assert(image != null and image.get_size() == frame_size)
			var bounds := image.get_used_rect()
			if not bounds.has_area() or bounds.position.x < 2 or bounds.end.x > frame_size.x-2 or bounds.position.y < 2 or (actor_kind == "wraith" and bounds.end.y > frame_size.y-2):
				_pose_failed(clip,t,"cast clipped bounds")
				_write_receipt(receipt)
				quit(1)
				return
			var path: String = directory.path_join("frame-%02d.png" % (index+1))
			assert(image.save_png(path) == OK)
			frames.append({"path":path.trim_prefix(output+"/"),"sha256":FileAccess.get_sha256(path),"bounds":[bounds.position.x,bounds.position.y,bounds.size.x,bounds.size.y],"groundLine":camera.unproject_position(Vector3.ZERO).y})
		receipt.clips[clip] = {"frames":frames,"fps":fps,"count":count}
		_write_receipt(receipt)
	if clip_names == ["seed"]:
		viewport.size = frame_size*4
		await process_frame
		await RenderingServer.frame_post_draw
		assert(viewport.get_texture().get_image().save_png(output.path_join("design-detail.png")) == OK)
	receipt.ok = true
	receipt.boneLengthsVerified = true
	_write_receipt(receipt)
	print("QUANTUM_CAST_BAKE " + JSON.stringify({"actor":actor_kind,"output":output,"clips":clip_names,"renderDevice":receipt.renderDevice,"productionApproved":false}))
	quit(0)
