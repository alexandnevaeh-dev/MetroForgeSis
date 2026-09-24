extends Node
const Manager = preload("res://scripts/world/OverworldManager.gd")
func _ready() -> void:
	var manager = Manager.new()
	var roles := {"ground":[0,0],"ground_wear":[1,0],"wall":[2,0],"hazard":[3,0],"wall_accent":[4,0],"ground_grate":[5,0],"ground_cable":[6,0],"ground_hazard":[7,0],"ground_stain":[8,0],"ground_dirty":[9,0]}
	var records := []
	for area_id in ["courtyard", "overworld", "dungeon_002", "ruins_霧"]:
		manager.set("_current_area_id",area_id)
		for y in range(40):
			for x in range(40):
				for value in range(4):
					records.append([area_id,value,x,y,manager.call("_ground_role_for_cell",value,x,y,roles)])
	var file := FileAccess.open("res://terrain-role-native.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"roles":roles,"records":records}))
	file.close()
	manager.free()
	print("NATIVE_TERRAIN_REFERENCE_COMPLETE ",records.size())
	get_tree().quit()
