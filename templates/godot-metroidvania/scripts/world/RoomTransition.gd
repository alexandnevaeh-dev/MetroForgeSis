extends Area2D

@export var target_room_id: String = ""
@export var spawn_side: String = "left"
@export var transition_direction: String = "right"
@export var is_optional: bool = false
@export var required_abilities: PackedStringArray = PackedStringArray()

func _ready() -> void:
	add_to_group("room_transition")
	_loaded_at_msec = Time.get_ticks_msec()
	match transition_direction:
		"up":
			$Visual.color = Color(0.9, 0.75, 0.3, 0.0)
		"down":
			$Visual.color = Color(0.85, 0.5, 0.3, 0.0)
		_:
			if is_optional:
				$Visual.color = Color(0.45, 0.65, 1.0, 0.0)
	$Visual.visible = false
	if not required_abilities.is_empty():
		$Visual.color = Color(0.95, 0.45, 0.25, 0.0)
	body_entered.connect(_on_body_entered)
	# Only a 'down' exit needs the per-frame overlap re-check below; every other direction fires
	# correctly off the entry signal alone.
	set_physics_process(transition_direction == "down")

## A 'down' exit only fires on a real descent (see _player_is_descending), and Godot does not
## re-emit body_entered for a body that was already overlapping when that condition became true —
## a player standing in the doorway who then falls would never re-trigger it. So a down door
## re-checks its overlaps each physics frame rather than relying on the entry signal alone.
func _physics_process(_delta: float) -> void:
	for body in get_overlapping_bodies():
		if _try_transition(body):
			return

func _on_body_entered(body: Node2D) -> void:
	_try_transition(body)

## Rooms are re-instantiated on every transition, so this runs fresh per arrival: a door cannot
## fire for a moment after its room loads. Arriving through one door can land the player directly
## on top of another — room_010's 'down' exit back to room_009 sits at x=388, and the spawn point
## for arriving from room_009 is bottom-centre, x≈400 — so the spawn fall re-triggered the door the
## player had just come through and bounced them straight back, over and over. Short enough to be
## imperceptible in play, long enough for the arrival to settle.
const SPAWN_GRACE_MSEC := 350

var _loaded_at_msec: int = 0

func _try_transition(body: Node2D) -> bool:
	if Time.get_ticks_msec() - _loaded_at_msec < SPAWN_GRACE_MSEC:
		return false
	if not body.is_in_group("player") or target_room_id.is_empty():
		return false
	for ability in required_abilities:
		if not GameManager.has_ability(ability):
			return false
	if transition_direction == "down" and not _player_is_descending(body):
		return false
	var world_manager := get_tree().get_first_node_in_group("world_manager")
	if world_manager and world_manager.has_method("transition_to_room"):
		world_manager.transition_to_room(target_room_id, spawn_side)
		return true
	return false

## A 'down' exit is a hole you fall through, not a doorway you walk past. room-assembler.ts places
## a down door at floorY - 96 when the room has no weak floor backing it, which puts it mid-room at
## walking height — so simply walking across the room clipped it and yanked the player backwards.
## That happened in 4 of 40 rooms in a real generation and blocked the playtest bot's critical path
## outright: it could never reach the room holding the double_jump pickup. Requiring an actual
## descent makes the trigger mean what the direction says. Weak-floor down exits are unaffected —
## slamming through one leaves the player airborne and falling.
func _player_is_descending(body: Node2D) -> bool:
	if not (body is CharacterBody2D):
		return true
	var character := body as CharacterBody2D
	return not character.is_on_floor() and character.velocity.y > 0.0
