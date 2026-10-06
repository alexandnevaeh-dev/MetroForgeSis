extends RefCounted
## Shared deterministic clip playback for player, enemies and boss presentation.
## Gameplay owns state and hit timing. Death never wraps; state interruption resets.
var definitions: Dictionary
var state: String = ""
var entered_tick: int = 0
var event_id: int = -1
var current_index: int = 0

func _init(clips: Dictionary) -> void:
	definitions = clips.duplicate(true)

func sample(next_state: String, tick: int, next_event_id: int = -1, duration_ticks: int = -1) -> Dictionary:
	assert(tick >= 0 and definitions.has(next_state) and (duration_ticks == -1 or duration_ticks > 0))
	if next_state != state or (next_event_id >= 0 and next_event_id != event_id):
		state = next_state
		entered_tick = tick
		event_id = next_event_id
	var definition: Dictionary = definitions[state]
	var elapsed: int = maxi(0,tick-entered_tick)
	var index: int = floori(float(elapsed)*float(definition.fps)/60.0)
	# An explicit gameplay window can fit a one-shot pose sequence without changing
	# the simulation's projectile/hit timing or the source strip's declared cadence.
	if duration_ticks > 0 and not definition.loop:
		index = floori(float(elapsed)*int(definition.frames)/duration_ticks)
	current_index = index % int(definition.frames) if definition.loop else mini(index,int(definition.frames)-1)
	return {"state":state,"index":current_index,"entered_tick":entered_tick,"elapsed":elapsed}
