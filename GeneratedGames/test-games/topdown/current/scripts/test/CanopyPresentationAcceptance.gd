extends Node
var checks := 0
var failures := 0
const CAPTURES := "res://.qa/presentation"

func check(label: String, ok: bool) -> void:
	checks += 1
	print(("PASS: " if ok else "FAIL: ") + label)
	if not ok: failures += 1

func screenshot(label: String) -> void:
	await RenderingServer.frame_post_draw
	check("capture_"+label, get_viewport().get_texture().get_image().save_png(CAPTURES+"/"+label+".png") == OK)

func grounded(label: String, sprite: Sprite2D) -> void:
	check(label+"_uses_texture", sprite != null and sprite.texture != null)
	if sprite == null or sprite.texture == null: return
	var bottom: float = sprite.position.y + (sprite.offset.y + sprite.texture.get_height()/2.0) * sprite.scale.y
	check(label+"_grounded_even_when_scaled", is_zero_approx(bottom))
	var image := sprite.texture.get_image()
	var contact := false
	for x in image.get_width():
		contact = contact or image.get_pixel(x, image.get_height()-1).a > 0
	check(label+"_painted_contact", contact)

func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(CAPTURES))
	GameManager.start_new_game()
	var world = load("res://scenes/world/World.tscn").instantiate()
	add_child(world)
	await get_tree().process_frame
	await get_tree().physics_frame
	var player: Node2D = get_tree().get_first_node_in_group("player")
	player.global_position = Vector2(480,352)
	var hud: CanvasLayer = world.get_node("GameHUD")
	var hp: HealthComponent = player.get_node("HealthComponent")
	var margin: Control = hud.get_node("HUD/MarginContainer")
	var backing: Control = hud.get_node("HUD/StatusBackground")
	await get_tree().create_timer(0.1).timeout
	check("health_actual_current_max",hud.health_readout.text.contains("100 / 100") and hud.health_bar.value == 100)
	check("compact_status_bounds",margin.size.x <= 280 and margin.size.y <= 300)
	check("status_backing_covers_readouts",backing.get_global_rect().encloses(margin.get_global_rect()))
	check("center_playfield_clear",not margin.get_global_rect().has_point(get_viewport().get_visible_rect().size/2.0))
	var all_ignore := true
	for control in hud.get_node("HUD").find_children("*","Control",true,false):
		all_ignore = all_ignore and control.mouse_filter == Control.MOUSE_FILTER_IGNORE
	check("read_only_hud_does_not_consume_clicks",all_ignore)
	check("location_human_readable",not hud.location_label.text.is_empty() and hud.location_label.text != GameManager.current_room_id)
	await screenshot("hud-healthy")
	hp.take_damage(80)
	await get_tree().process_frame
	await get_tree().process_frame
	check("low_health_actual_value",hud.health_bar.value == 20 and hud.health_readout.text.contains("20 / 100"))
	check("low_health_warning_text",hud.health_readout.text.contains("LOW"))
	check("low_health_warning_color",hud.health_readout.get_theme_color("font_color") == Color.html("e07b80"))
	await screenshot("hud-low-health")
	hp.heal(100)
	await get_tree().process_frame
	await get_tree().process_frame
	check("healing_clears_low_state",not hud.health_readout.text.contains("LOW") and hud.health_bar.value == 100)
	check("disc_is_inventory_tool",not GameManager.player_abilities.has("wind_disc"))
	check("grant_real_tool",InventoryManager.grant_item("wind_disc",1))
	await get_tree().process_frame
	await get_tree().process_frame
	var tool_name: String = InventoryManager.get_item_definition("wind_disc").get("name", "")
	check("owned_tool_visible",not tool_name.is_empty() and hud.ability_label.text.contains(tool_name))
	check("tool_display_not_internal_id",not hud.ability_label.text.contains("wind_disc"))
	await screenshot("hud-owned-tool")
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.position = Vector2(40,40)
	press.pressed = true
	Input.parse_input_event(press)
	await get_tree().physics_frame
	await get_tree().physics_frame
	check("click_through_hud_starts_attack",player.get_attack_state() != 0)
	press.pressed = false
	Input.parse_input_event(press)
	await get_tree().create_timer(0.5).timeout
	player.set_physics_process(false)
	var chest := ChestPickup.new()
	chest.item_id = "wind_disc"
	chest.position = player.position + Vector2(64,0)
	world.get_current_entities().add_child(chest)
	grounded("closed_chest",chest.get("_sprite"))
	chest.interact(player)
	await get_tree().create_timer(0.3).timeout
	check("open_chest_state_and_art",chest.opened and chest.get("_sprite").texture.resource_path.ends_with("interactive_chest_open.png"))
	grounded("open_chest",chest.get("_sprite"))
	var portal := AreaPortal.new()
	portal.position = player.position + Vector2(104,0)
	world.get_current_entities().add_child(portal)
	var portal_sprite: Sprite2D
	for child in portal.get_children():
		if child is Sprite2D: portal_sprite = child
	await get_tree().create_timer(0.5).timeout
	grounded("portal_during_pulse",portal_sprite)
	var gate := ItemGate.new()
	gate.item_id = "wind_disc"
	gate.position = player.position + Vector2(-64,0)
	world.get_current_entities().add_child(gate)
	for child in gate.get_children():
		if child is Sprite2D: grounded("root_gate",child)
	var save = load("res://scenes/world/SavePoint.tscn").instantiate()
	save.position = player.position + Vector2(-110,0)
	world.get_current_entities().add_child(save)
	save.call("_set_active",true)
	await get_tree().create_timer(0.5).timeout
	grounded("active_waystone",save.get_node("GeneratedSprite"))
	check("waystone_real_art_hides_fallback",not save.get_node("Sprite").visible)
	await screenshot("grounded-interactables")
	var old_location: String = hud.location_label.text
	world.load_area("dungeon_000_r3")
	await get_tree().process_frame
	await get_tree().process_frame
	check("location_follows_room",hud.location_label.text != old_location and not hud.location_label.text.is_empty())
	await screenshot("boss-room-hud")
	print("CANOPY_PRESENTATION_END")
	FileAccess.open(CAPTURES+"/results.json",FileAccess.WRITE).store_string(JSON.stringify({"checks":checks,"failures":failures}))
	get_tree().quit(0 if failures == 0 else 1)
