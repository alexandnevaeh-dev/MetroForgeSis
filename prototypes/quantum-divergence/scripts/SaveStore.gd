extends RefCounted
## Complete immutable generations avoid replacing an existing Windows file in-place.
## One logical active suspend per profile; retain eight complete recoverable generations.
const MAX_BYTES: int = 16 * 1024 * 1024
const KEEP_GENERATIONS: int = 8
const MAGIC: String = "QDGS0001"
var root: String
var valid_root: bool = false
var pattern := RegEx.new()

func _init(directory: String = "E:/MetroForgeData/GameSaves/QuantumDivergence/profile-01") -> void:
	root = directory.replace("\\", "/").simplify_path().trim_suffix("/")
	valid_root = root.to_lower().begins_with("e:/") and root.length() > 3 and not root.contains("://")
	pattern.compile("^(profile|active|ended)-([0-9]{20})-([0-9]+)-([0-9]+)\\.qds$")

func _hash(bytes: PackedByteArray) -> PackedByteArray:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(bytes)
	return context.finish()

func _records(group: String = "") -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if not valid_root:
		return result
	var directory = DirAccess.open(root)
	if directory == null:
		return result
	directory.list_dir_begin()
	var name: String = directory.get_next()
	while name != "":
		var match_name = pattern.search(name)
		if not directory.current_is_dir() and match_name != null:
			var kind: String = match_name.get_string(1)
			if group == "" or (group == "profile" and kind == "profile") or (group == "run" and kind in ["active", "ended"]):
				result.append({"name": name, "kind": kind, "sequence": match_name.get_string(2).to_int()})
		name = directory.get_next()
	directory.list_dir_end()
	result.sort_custom(func(a, b): return int(a.sequence) > int(b.sequence) if a.sequence != b.sequence else a.name > b.name)
	return result

func _read(record: Dictionary) -> Dictionary:
	var path: String = root.path_join(record.name)
	var file = FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {"accepted": false, "reason": "read"}
	var length: int = file.get_length()
	if length < 44 or length > MAX_BYTES + 44 or file.get_buffer(8).get_string_from_ascii() != MAGIC:
		return {"accepted": false, "reason": "header"}
	var size: int = file.get_32()
	if size <= 0 or size > MAX_BYTES or length != size + 44:
		return {"accepted": false, "reason": "length"}
	var bytes: PackedByteArray = file.get_buffer(size)
	var expected: PackedByteArray = file.get_buffer(32)
	file.close()
	if bytes.size() != size or _hash(bytes) != expected:
		return {"accepted": false, "reason": "checksum"}
	# Default bytes_to_var never constructs script objects from a save file.
	var envelope = bytes_to_var(bytes)
	if typeof(envelope) != TYPE_DICTIONARY or envelope.size() != 4 or envelope.get("schema_version") != 1 or envelope.get("kind") != record.kind or envelope.get("sequence") != record.sequence or typeof(envelope.get("data")) != TYPE_DICTIONARY:
		return {"accepted": false, "reason": "envelope"}
	return {"accepted": true, "data": envelope.data, "path": path}

func _prune(group: String) -> void:
	var records: Array[Dictionary] = _records(group)
	var complete: int = 0
	for record in records:
		if not _read(record).accepted:
			continue
		complete += 1
		if complete <= KEEP_GENERATIONS:
			continue
		var path: String = root.path_join(record.name).simplify_path()
		# Only expire this store's verified generations; never remove arbitrary/corrupt files.
		if path.begins_with(root + "/") and pattern.search(path.get_file()) != null and _read(record).accepted:
			DirAccess.remove_absolute(path)

func _write(kind: String, data: Dictionary) -> Dictionary:
	if not valid_root:
		return {"accepted": false, "reason": "storage_must_be_on_e"}
	if DirAccess.make_dir_recursive_absolute(root) != OK:
		return {"accepted": false, "reason": "directory"}
	var records: Array[Dictionary] = _records()
	var sequence: int = 1 if records.is_empty() else int(records[0].sequence) + 1
	var name: String = "%s-%020d-%d-%d.qds" % [kind, sequence, OS.get_process_id(), Time.get_ticks_usec()]
	var path: String = root.path_join(name)
	var temporary: String = path + ".tmp"
	if FileAccess.file_exists(path) or FileAccess.file_exists(temporary):
		return {"accepted": false, "reason": "collision"}
	var bytes: PackedByteArray = var_to_bytes({"schema_version": 1, "kind": kind, "sequence": sequence, "data": data})
	if bytes.size() > MAX_BYTES:
		return {"accepted": false, "reason": "too_large"}
	var file = FileAccess.open(temporary, FileAccess.WRITE)
	if file == null:
		return {"accepted": false, "reason": "write"}
	file.store_buffer(MAGIC.to_ascii_buffer())
	file.store_32(bytes.size())
	file.store_buffer(bytes)
	file.store_buffer(_hash(bytes))
	file.flush()
	var write_error: int = file.get_error()
	file.close()
	if write_error != OK or FileAccess.file_exists(path) or DirAccess.rename_absolute(temporary, path) != OK:
		return {"accepted": false, "reason": "publish"}
	var verified: Dictionary = _read({"name": name, "kind": kind, "sequence": sequence})
	if not verified.accepted:
		return {"accepted": false, "reason": "readback"}
	_prune("profile" if kind == "profile" else "run")
	return {"accepted": true, "path": path, "sequence": sequence}

func _profile(value: Dictionary) -> Dictionary:
	for key in value:
		if key not in ["blueprints", "loadouts", "lore"]:
			return {"accepted": false, "reason": "profile_field"}
	var profile: Dictionary = {"blueprints": value.get("blueprints", []), "loadouts": value.get("loadouts", ["default"]), "lore": value.get("lore", [])}
	for key in profile:
		if typeof(profile[key]) != TYPE_ARRAY or profile[key].size() > 256:
			return {"accepted": false, "reason": "profile_array"}
		var seen: Dictionary = {}
		for id in profile[key]:
			if typeof(id) != TYPE_STRING or id.is_empty() or id.length() > 64 or seen.has(id):
				return {"accepted": false, "reason": "profile_id"}
			if key == "blueprints" and id not in ["entanglement", "tunneling"]:
				return {"accepted": false, "reason": "blueprint"}
			if key == "loadouts" and id != "default":
				return {"accepted": false, "reason": "loadout"}
			seen[id] = true
	return {"accepted": true, "profile": profile.duplicate(true)}

func write_profile(profile: Dictionary) -> Dictionary:
	var validated: Dictionary = _profile(profile)
	return _write("profile", validated.profile) if validated.accepted else validated

func load_profile() -> Dictionary:
	if not valid_root:
		return {"accepted": false, "reason": "storage_must_be_on_e"}
	var records: Array[Dictionary] = _records("profile")
	if records.is_empty():
		return {"accepted": true, "profile": {"blueprints": [], "loadouts": ["default"], "lore": []}, "recovered": false}
	for index in records.size():
		var record: Dictionary = _read(records[index])
		if record.accepted:
			var validated: Dictionary = _profile(record.data)
			if validated.accepted:
				validated.recovered = index > 0
				validated.path = record.path
				return validated
	return {"accepted": false, "reason": "profile_corrupt"}

func write_active(state: Dictionary) -> Dictionary:
	return _write("active", state)

func end_run(reason: String) -> Dictionary:
	if reason not in ["death", "extracted", "new_run"]:
		return {"accepted": false, "reason": "end_reason"}
	return _write("ended", {"reason": reason})

func load_active(validator: Callable) -> Dictionary:
	if not valid_root:
		return {"accepted": false, "reason": "storage_must_be_on_e"}
	var records: Array[Dictionary] = _records("run")
	for index in records.size():
		# Even a damaged terminal marker cannot resurrect an earlier living run.
		if records[index].kind == "ended":
			return {"accepted": false, "reason": "run_ended"}
		var record: Dictionary = _read(records[index])
		if record.accepted:
			var validated: Dictionary = validator.call(record.data)
			if validated.accepted:
				validated.recovered = index > 0
				validated.path = record.path
				return validated
	return {"accepted": false, "reason": "no_valid_suspend"}
