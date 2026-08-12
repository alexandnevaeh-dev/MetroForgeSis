extends Node

var _unlocked_abilities: Array[String] = []
var _defeated_bosses: Array[String] = []
var _opened_gates: Array[String] = []

func unlock_ability(ability_id: String) -> void:
	if ability_id not in _unlocked_abilities:
		_unlocked_abilities.append(ability_id)

func has_ability(ability_id: String) -> bool:
	return ability_id in _unlocked_abilities

func defeat_boss(boss_id: String) -> void:
	if boss_id not in _defeated_bosses:
		_defeated_bosses.append(boss_id)

func get_defeated_bosses() -> Array[String]:
	return _defeated_bosses.duplicate()

func restore_defeated_bosses(boss_ids: Array) -> void:
	_defeated_bosses.clear()
	for id in boss_ids:
		if id is String and id not in _defeated_bosses:
			_defeated_bosses.append(id)

func open_gate(gate_id: String) -> void:
	if gate_id not in _opened_gates:
		_opened_gates.append(gate_id)

func is_gate_open(gate_id: String) -> bool:
	return gate_id in _opened_gates

func reset() -> void:
	_unlocked_abilities.clear()
	_defeated_bosses.clear()
	_opened_gates.clear()
