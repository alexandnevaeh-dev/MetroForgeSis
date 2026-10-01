extends RefCounted
## The interactive controller commits only a fully validated detached bundle.
const State = preload("res://scripts/RunState.gd")
const Store = preload("res://scripts/SaveStore.gd")
var store
var profile: Dictionary
var baseline: Dictionary = {}
var persisted_profile: PackedByteArray = PackedByteArray()
var storage_ready: bool = false
var terminal_written: bool = false
var run_ended: bool = false
var last_error: String = ""

func _init(directory: String, knowledge: Dictionary) -> void:
	store = Store.new(directory)
	profile = knowledge

func initialize(bundle: Dictionary) -> Dictionary:
	baseline = State.snapshot(bundle)
	var validated: Dictionary = State.build(baseline, profile)
	if not validated.accepted:
		last_error = "initial_run_" + validated.reason
		return {"accepted": false, "reason": last_error}
	var loaded: Dictionary = store.load_profile()
	if not loaded.accepted:
		last_error = loaded.reason
		return loaded
	profile.clear()
	profile.merge(loaded.profile.duplicate(true))
	persisted_profile = var_to_bytes(profile)
	storage_ready = true
	return {"accepted": true, "recovered_profile": loaded.recovered}

func persist_profile() -> Dictionary:
	if not storage_ready:
		return {"accepted": false, "reason": "storage_unavailable"}
	if var_to_bytes(profile) == persisted_profile:
		return {"accepted": true}
	var written: Dictionary = store.write_profile(profile)
	if written.accepted:
		persisted_profile = var_to_bytes(profile)
	else:
		last_error = written.reason
	return written

func suspend(bundle: Dictionary, selected: String) -> Dictionary:
	if not storage_ready or run_ended:
		return {"accepted": false, "reason": "run_not_active"}
	var state: Dictionary = State.snapshot(bundle, selected)
	var validated: Dictionary = State.build(state, profile)
	if not validated.accepted:
		return validated
	var knowledge: Dictionary = persist_profile()
	if not knowledge.accepted:
		return knowledge
	return store.write_active(state)

func resume() -> Dictionary:
	if not storage_ready:
		return {"accepted": false, "reason": "storage_unavailable"}
	if run_ended:
		return {"accepted": false, "reason": "run_ended"}
	var loaded: Dictionary = store.load_active(func(candidate): return State.build(candidate, profile))
	if loaded.accepted:
		terminal_written = false
	return loaded

func observe(bundle: Dictionary) -> Dictionary:
	var knowledge: Dictionary = persist_profile()
	var reason: String = "death" if bundle.player.hp <= 0.0 else "extracted" if bundle.progress.extracted else ""
	if reason != "":
		run_ended = true
	if reason != "" and not terminal_written and storage_ready:
		var ended: Dictionary = store.end_run(reason)
		terminal_written = ended.accepted
		if not ended.accepted:
			last_error = ended.reason
		return ended
	return knowledge

func new_run() -> Dictionary:
	if not storage_ready:
		return {"accepted": false, "reason": "storage_unavailable"}
	var fresh: Dictionary = State.build(baseline, profile)
	if not fresh.accepted:
		return fresh
	var knowledge: Dictionary = persist_profile()
	if not knowledge.accepted:
		return knowledge
	# Publish the terminal marker before a new active generation, preventing old-run fallback.
	var ended: Dictionary = store.end_run("new_run")
	if not ended.accepted:
		return ended
	terminal_written = true
	var written: Dictionary = store.write_active(State.snapshot(fresh.bundle))
	if not written.accepted:
		return written
	terminal_written = false
	run_ended = false
	fresh.path = written.path
	return fresh
