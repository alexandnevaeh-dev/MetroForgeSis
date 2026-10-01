extends Node
## Learned spell items persist through InventoryManager's existing save contract.
const PATH := "res://data/abilities/spells.json"
var definitions: Dictionary = {}
var mana := 100.0
var maximum_mana := 100.0
var cooldowns: Dictionary = {}
var ward_time := 0.0
var player: TopDownPlayerController
var cast_serial := 0

func _ready() -> void:
	name = "Spells"
	player = get_parent()
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	if not data is Dictionary: return
	for definition: Dictionary in data.get("spells",[]):
		var id := String(definition.get("id",""))
		if id not in ["seedflare","rootward","bloomstep"]: continue
		if float(definition.get("cost",0)) <= 0 or float(definition.get("cooldown",0)) <= 0: continue
		definitions[id] = definition
		var action := "spell_"+id
		if not InputMap.has_action(action):
			InputMap.add_action(action)
			var key := InputEventKey.new()
			key.physical_keycode = KEY_Q if id == "seedflare" else KEY_R if id == "rootward" else KEY_F
			InputMap.action_add_event(action,key)
	for id: String in data.get("autoStartQuests",[]): QuestManager.accept_quest(id)

func _physics_process(delta: float) -> void:
	if GameManager.current_state != GameManager.GameState.PLAYING: return
	mana = minf(maximum_mana,mana+delta*6)
	for id in cooldowns: cooldowns[id] = maxf(0,float(cooldowns[id])-delta)
	ward_time = maxf(0,ward_time-delta)
	player.health.ward_armor = 75.0 if ward_time > 0 else 0.0
	for id in definitions:
		if Input.is_action_just_pressed("spell_"+id): cast(id)

func is_learned(id: String) -> bool:
	return definitions.has(id) and InventoryManager.get_owned_count(id) > 0

func get_cooldown(id: String) -> float:
	return float(cooldowns.get(id,0))

func cast(id: String) -> bool:
	if not is_learned(id) or not player.health.is_alive() or GameManager.current_state != GameManager.GameState.PLAYING: return false
	var spec: Dictionary = definitions[id]
	if mana < float(spec.cost) or get_cooldown(id)>0 or player.get_attack_state() != 0 or player.get("_cast_pose_time") > 0: return false
	mana -= float(spec.cost)
	cooldowns[id] = float(spec.cooldown)
	cast_serial += 1
	player.set("_cast_pose_time",0.5)
	player.call("_play_facing_animation","cast",true)
	var direction := player.facing.normalized()
	AudioManager.play_sfx("ability")
	if id == "rootward":
		ward_time = 2.5
		player.health.ward_armor = 75
		VFXManager.play("ability_unlock",player.global_position,1.8)
	elif id == "bloomstep":
		player.call("_start_dodge",direction)
		player.set("_dodge_time",0.3)
		player.set("_invulnerability_time",maxf(float(player.get("_invulnerability_time")),0.3))
		VFXManager.play("dash_trail",player.global_position,1.4)
	else:
		VFXManager.play("pickup_spark",player.global_position+Vector2(0,-20),0.8)
		_release_seedflare.call_deferred(direction)
	return true

func _release_seedflare(direction: Vector2) -> void:
	await get_tree().create_timer(0.12).timeout
	if not is_instance_valid(player) or not player.health.is_alive(): return
	var projectile = load("res://scenes/enemies/Projectile.tscn").instantiate()
	projectile.owner_node = player
	projectile.direction = direction
	projectile.damage = 18
	projectile.speed = 320
	projectile.lifetime = 1.4
	projectile.set_meta("player_spell","seedflare")
	player.get_parent().add_child(projectile)
	projectile.global_position = player.global_position + direction*22 + Vector2(0,-14)

func get_transient_state() -> Dictionary:
	return {"mana":mana,"cooldowns":cooldowns.duplicate(),"ward_time":ward_time}

func restore_transient_state(data: Dictionary) -> void:
	mana = clampf(float(data.get("mana",100)),0,maximum_mana)
	cooldowns.clear()
	var saved_cooldowns: Variant = data.get("cooldowns",{})
	if saved_cooldowns is Dictionary:
		for id in definitions:
			cooldowns[id] = clampf(float(saved_cooldowns.get(id,0)),0,float(definitions[id].cooldown))
	ward_time = clampf(float(data.get("ward_time",0)),0,2.5)
	player.health.ward_armor = 75.0 if ward_time > 0 else 0.0
