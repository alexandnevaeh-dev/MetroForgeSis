extends Node
## Controlled exact-destination wait probe; not an Input-driven campaign.
var checks: Array = []
func check(label: String, passed: bool) -> void:
	checks.append({"label":label,"passed":passed})
	print("ARRIVAL_CHECK ",JSON.stringify(checks.back()))
func _ready() -> void:
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	for tick in range(8):
		await get_tree().physics_frame
	var agent := PlaytestAgent.new()
	check("loaded starting room is accepted",await agent._wait_room(self,"room_000",0.2))
	var started := Time.get_ticks_msec()
	check("different destination is rejected",not await agent._wait_room(self,"room_018",0.1))
	check("incorrect destination wait stays bounded",Time.get_ticks_msec()-started<1000)
	# Exercise actual asynchronous load and boss-exit locking. Direct request is
	# fixture setup, never a substitute for walking the campaign.
	world.transition_to_room("room_018","left")
	check("boss destination completes through normal loader",await agent._wait_room(self,"room_018",5.0))
	var room = world._current_room
	var boss = room.get_node_or_null("Boss")
	check("destination has a live guardian",boss!=null and boss.get_node("HealthComponent").is_alive())
	var locked := true
	for transition in get_tree().get_nodes_in_group("room_transition"):
		if room.is_ancestor_of(transition): locked = locked and not transition.monitoring
	check("boss exits are locked before arrival is published",locked)
	# Join neighbor preload jobs before quitting; otherwise the fixture can
	# tear down script classes while background scene loaders still use them.
	for index in range(43):
		var id := "room_%03d" % index
		var path := "res://scenes/rooms/"+id+".tscn"
		if ResourceLoader.load_threaded_get_status(path) in [ResourceLoader.THREAD_LOAD_IN_PROGRESS,ResourceLoader.THREAD_LOAD_LOADED]:
			await world._ensure_packed(id)
	var passed := true
	for row in checks: passed = passed and row.passed
	var file := FileAccess.open("res://arrival-wait-proof.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"passed":passed,"checks":checks,"scope":"Controlled bounded exact-destination observation and actual boss-room loading. Direct transition setup; no campaign or visual acceptance."},"\t"))
	file.close()
	print("ARRIVAL_RESULT passed=",passed," checks=",checks.size())
	get_tree().quit(0 if passed else 1)
