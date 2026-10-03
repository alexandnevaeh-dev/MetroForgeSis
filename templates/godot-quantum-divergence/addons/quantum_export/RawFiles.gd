@tool
extends EditorExportPlugin
## FileAccess and Image load the original admitted bytes, also inside the PCK.
var raw_paths: Dictionary = {}

func _get_name() -> String:
	return "MetroForgeQuantumRawFiles"

func _export_begin(_features: PackedStringArray, _debug: bool, _path: String, _flags: int) -> void:
	raw_paths.clear()
	var manifest = JSON.parse_string(FileAccess.get_file_as_string("res://quantum-template.json"))
	if not manifest is Dictionary or not manifest.get("hashes") is Dictionary:
		push_error("Quantum package: template manifest is missing")
		return
	for relative in manifest.hashes:
		var path: String = "res://" + relative
		if not FileAccess.file_exists(path) or FileAccess.get_sha256(path) != manifest.hashes[relative]:
			push_error("Quantum package: changed or missing template file " + relative)
			return
	var config = JSON.parse_string(FileAccess.get_file_as_string("res://quantum_project.json"))
	if not config is Dictionary or config.get("archetype") != "QUANTUM_SIMULATION_ROGUELITE":
		push_error("Quantum package: generated configuration is missing")
		return
	for relative in manifest.hashes:
		raw_paths["res://" + relative] = true
	raw_paths["res://quantum-template.json"] = true
	raw_paths["res://quantum_project.json"] = true
	for path in raw_paths:
		add_file(path, FileAccess.get_file_as_bytes(path), false)
	print("QUANTUM_PACKAGE_VERIFIED " + JSON.stringify({"files":raw_paths.size(),"configuration_sha256":FileAccess.get_sha256("res://quantum_project.json"),"template_sha256":FileAccess.get_sha256("res://quantum-template.json")}))

func _export_file(path: String, _type: String, _features: PackedStringArray) -> void:
	if raw_paths.has(path):
		skip()
