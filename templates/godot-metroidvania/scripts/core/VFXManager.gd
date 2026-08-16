extends Node
## Pooled GPUParticles2D bursts. Texture is optional — a procedural gradient is the fallback.

const EFFECT_IDS := [
	"hit_spark",
	"death_puff",
	"dash_trail",
	"pickup_spark",
	"ability_unlock",
	"boss_phase_shift",
	"area_burst",
	"slam_shock",
	"landing_dust",
]

const POOL_SIZE := 16

var _textures: Dictionary = {}
var _pool: Array[GPUParticles2D] = []
var _fallback_tex: Texture2D

func _ready() -> void:
	_fallback_tex = _make_fallback_texture()
	for effect_id in EFFECT_IDS:
		var path := "res://assets/vfx/%s.png" % effect_id
		if ResourceLoader.exists(path):
			_textures[effect_id] = load(path)
	for i in POOL_SIZE:
		var emitter := GPUParticles2D.new()
		emitter.emitting = false
		emitter.one_shot = true
		emitter.explosiveness = 1.0
		emitter.amount = 18
		emitter.lifetime = 0.35
		emitter.z_index = 80
		emitter.visible = false
		emitter.texture = _fallback_tex
		emitter.process_material = _make_material(effect_id_for_index(i))
		emitter.finished.connect(_on_emitter_finished.bind(emitter))
		add_child(emitter)
		_pool.append(emitter)
	EventBus.ability_acquired.connect(_on_ability_acquired)

func effect_id_for_index(i: int) -> String:
	return EFFECT_IDS[i % EFFECT_IDS.size()]

func play(effect_id: String, global_position: Vector2, scale: float = 1.0) -> void:
	var mul := 1.0
	if has_node("/root/CombatFeedback"):
		mul = CombatFeedback.vfx_mul()
	scale *= mul
	var emitter := _acquire()
	if emitter == null:
		return
	emitter.global_position = global_position
	emitter.texture = _textures.get(effect_id, _fallback_tex)
	emitter.amount = 14 if effect_id == "dash_trail" else 18
	emitter.lifetime = 0.28 if effect_id == "hit_spark" else 0.4
	emitter.process_material = _make_material(effect_id)
	emitter.scale = Vector2(scale, scale)
	emitter.visible = true
	emitter.restart()
	emitter.emitting = true

func play_ring(
	effect_id: String,
	global_position: Vector2,
	count: int = 8,
	radius: float = 48.0,
	scale: float = 1.0,
) -> void:
	for i in range(mini(count, 8)):
		var angle := (TAU / float(count)) * float(i)
		var offset := Vector2(cos(angle), sin(angle)) * radius
		play(effect_id, global_position + offset, scale * 0.85)

func play_phase_shift(global_position: Vector2) -> void:
	play("boss_phase_shift", global_position, 2.0)
	play_ring("boss_phase_shift", global_position, 8, 56.0, 1.1)

func play_ambient(effect_id: String, global_position: Vector2) -> void:
	play(effect_id, global_position, 0.7)

func _on_ability_acquired(_ability_id: String) -> void:
	var player := get_tree().get_first_node_in_group("player")
	if player:
		play("ability_unlock", player.global_position, 1.3)

func _acquire() -> GPUParticles2D:
	for emitter in _pool:
		if not emitter.emitting:
			return emitter
	return _pool[0] if _pool.size() > 0 else null

func _on_emitter_finished(emitter: GPUParticles2D) -> void:
	emitter.visible = false
	emitter.emitting = false

func _make_fallback_texture() -> Texture2D:
	## Missing PNGs must not stamp DEFAULT_PALETTE red/cream under actors.
	var g := Gradient.new()
	g.set_color(0, Color(0.52, 0.48, 0.42, 0.65))
	g.set_color(1, Color(0.38, 0.36, 0.32, 0))
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.width = 16
	tex.height = 16
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(0.5, 0.0)
	return tex

func _make_material(effect_id: String) -> ParticleProcessMaterial:
	var mat := ParticleProcessMaterial.new()
	mat.direction = Vector3(0, -1, 0)
	mat.spread = 70.0
	mat.initial_velocity_min = 30.0
	mat.initial_velocity_max = 110.0
	mat.gravity = Vector3(0, 180, 0)
	mat.scale_min = 0.35
	mat.scale_max = 0.9
	match effect_id:
		"dash_trail":
			mat.direction = Vector3(-1, 0, 0)
			mat.spread = 18.0
			mat.gravity = Vector3(0, 40, 0)
			mat.initial_velocity_min = 20.0
			mat.initial_velocity_max = 60.0
		"death_puff":
			mat.spread = 180.0
			mat.initial_velocity_max = 140.0
		"slam_shock":
			mat.direction = Vector3(0, -1, 0)
			mat.spread = 50.0
			mat.initial_velocity_max = 160.0
		"landing_dust":
			mat.direction = Vector3(0, -1, 0)
			mat.spread = 55.0
			mat.gravity = Vector3(0, 80, 0)
			mat.initial_velocity_min = 12.0
			mat.initial_velocity_max = 36.0
			mat.scale_min = 0.2
			mat.scale_max = 0.45
		"pickup_spark":
			mat.gravity = Vector3(0, -40, 0)
	return mat
