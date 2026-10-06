extends SceneTree

const Decor := preload("res://scripts/world/StormglassDecor.gd")

class CountingDecor extends Decor:
	var reads: int = 0
	func _read_room_region_plan() -> Dictionary:
		reads += 1
		return super._read_room_region_plan()

var failed: int = 0

func check(label: String, passed: bool) -> void:
	print(("PASS: " if passed else "FAIL: ") + label)
	if not passed:
		failed += 1

func _initialize() -> void:
	var records: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/rooms/rooms.json"))
	var record: Dictionary = records.rooms.room_001
	var expected: Dictionary = record.castleRegionPlan
	var decor := CountingDecor.new()
	decor.room_id = "room_001"
	decor.room_width = int(expected.width)
	decor.room_height = int(expected.height)
	check("region snapshot equals saved plan", decor._room_region_plan() == expected)
	for index in range(4):
		check("decoration pass %d reuses validated plan" % index, decor._room_region_plan() == expected)
	check("five requests read the room database once", decor.reads == 1)
	decor.room_width += 1
	check("dimension change rejects mismatched plan", decor._room_region_plan().is_empty())
	check("dimension change invalidates snapshot", decor.reads == 2)
	decor._room_region_plan()
	check("missing plan is cached too", decor.reads == 2)
	decor.room_width -= 1
	check("restored dimensions reload saved plan", decor._room_region_plan() == expected)
	decor.room_id = "missing_room"
	check("room identity change does not reuse previous plan", decor._room_region_plan().is_empty())
	var fresh := CountingDecor.new()
	fresh.room_id = "room_001"
	fresh.room_width = int(expected.width)
	fresh.room_height = int(expected.height)
	check("new room instance loads its own snapshot", fresh._room_region_plan() == expected and fresh.reads == 1)
	decor.free()
	fresh.free()
	print("STORMGLASS_PLAN_CACHE_RESULTS_END failures=%d" % failed)
	quit(0 if failed == 0 else 1)
