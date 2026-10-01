extends SceneTree
const Preview = preload("res://scripts/MinesArtPlayground.gd")
var passed: int = 0
var failed: int = 0

func check(value: bool, label: String) -> void:
	passed += int(value)
	failed += int(not value)
	print(("PASS " if value else "FAIL ")+label)

func _initialize() -> void:
	var preview = Preview.new()
	for origin in [Vector2.ZERO,Vector2(1600,1700),Vector2(4036,3408)]:
		preview.camera_origin = origin
		var feet: Vector2 = origin+Vector2(464,320)
		check(preview.world_to_screen(feet) == Vector2(480,416),"Diver feet retain their intended screen framing at "+str(origin))
		check(preview.screen_to_world(Vector2(480,416)) == feet,"mouse at the displayed feet maps back to the same physical position at "+str(origin))
		check(preview.screen_to_world(Vector2(16,96)) == origin+Vector2(232,160),"top-left crop maps to the real world at "+str(origin))
		check(preview.screen_to_world(Vector2(944,528)) == origin+Vector2(696,376),"bottom-right crop maps to the real world at "+str(origin))
		var target: Vector2 = feet+Vector2(140,-52)
		var muzzle: Vector2 = feet+Vector2(14,-25)
		var aim: Vector2 = preview.screen_to_world(preview.world_to_screen(target))-muzzle
		check(aim == Vector2(126,-27),"aiming at the displayed target preserves the real muzzle-to-target vector at "+str(origin))
		check(preview.camera_origin == origin,"presentation transforms never move the simulation camera at "+str(origin))
	preview.free()
	print("QUANTUM_MINE_ART_PRESENTATION_RESULTS "+JSON.stringify({"passed":passed,"failed":failed,"scope":"Actual preview coordinate conversion, two-times pixel framing and physical muzzle aiming across full-world positions"}))
	quit(0 if failed == 0 else 1)
