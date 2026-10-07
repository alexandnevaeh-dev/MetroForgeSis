extends Node
var checks: Array = []
func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("INTEGRITY_CHECK ",JSON.stringify(checks.back()))
func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().process_frame
	await get_tree().process_frame
	world.load_area("dungeon_000_r3")
	for tick in range(8):
		await get_tree().process_frame
	var player = get_tree().get_first_node_in_group("player")
	var hp = player.get_node("HealthComponent")
	var agent := PlaytestAgent.new()
	agent._telemetry_host = self
	agent._started_at_ms = Time.get_ticks_msec()
	agent._attach_player_health()
	var before: float = hp.current_health
	hp.take_damage(17)
	check("controlled health loss is observed",agent._damage_events.size()==1 and is_equal_approx(agent._damage_events[0].amount,17.0))
	check("damage log matches actual reduced health",is_equal_approx(hp.current_health,before-17.0) and is_equal_approx(agent._damage_events[0].healthAfter,hp.current_health))
	var reduced: float = hp.current_health
	agent._boss_attack_timeout_sec = 0.0
	var defeated: bool = await agent._defeat_final_boss(self,"boss_final")
	check("zero-budget helper cannot report a boss win",not defeated)
	check("boss helper preserves reduced entry health",is_equal_approx(hp.current_health,reduced) and is_equal_approx(agent._boss_player_initial_health,reduced))
	check("helper sends no artificial attack or damage",agent.attacks_performed==0 and agent._boss_final_health>0)
	EventBus.save_triggered.connect(agent._observe_save)
	EventBus.object_activated.connect(agent._observe_checkpoint)
	EventBus.save_triggered.emit()
	check("autosave does not claim checkpoint activation",agent._save_events.size()==1 and agent._checkpoint_events.is_empty())
	var checkpoint = load("res://scenes/world/SavePoint.tscn").instantiate()
	checkpoint.position = Vector2(-1000,-1000)
	add_child(checkpoint)
	checkpoint._on_body_entered(player)
	check("real SavePoint callback records checkpoint",agent._checkpoint_events.size()==1 and agent._save_events.size()==2)
	check("checkpoint health comes from normal SavePoint healing",is_equal_approx(hp.current_health,hp.max_health) and is_equal_approx(agent._checkpoint_events[0].health,hp.current_health))
	EventBus.save_triggered.disconnect(agent._observe_save)
	EventBus.object_activated.disconnect(agent._observe_checkpoint)
	var passed := true
	for row in checks:
		passed = passed and row.passed
	var file := FileAccess.open("res://integrity-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled observer integrity probe: real HealthComponent damage and zero-time boss helper. Direct area setup/damage, not campaign acceptance."},"	"))
	file.close()
	print("INTEGRITY_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
