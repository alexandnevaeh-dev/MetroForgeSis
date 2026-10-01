extends Area2D

@export var target_room_id: String = ""
@export var spawn_side: String = "left"
@export var transition_direction: String = "right"
@export var is_optional: bool = false
@export var required_abilities: PackedStringArray = PackedStringArray()

func _ready() -> void:
	add_to_group("room_transition")
	z_index = 4
	z_as_relative = false
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
	queue_redraw()
	# Re-check every door while overlapped. A player can enter a nearby horizontal shortcut
	# during SPAWN_GRACE_MSEC; Godot will not emit body_entered again when grace expires, so an
	# entry-signal-only door would remain inert until the player walked fully out and back in.
	set_physics_process(true)


func _draw() -> void:
	# Authored room thresholds communicate exits. Keep the transition Area2D invisible so its
	# compact collision rectangle cannot turn into an oversized arch when the camera zooms in.
	pass

## Godot does not re-emit body_entered for a body already overlapping when a transition becomes
## eligible. This covers vertical direction changes and horizontal doors entered during spawn
## grace without requiring the player to leave and re-enter the sensor.
func _physics_process(_delta: float) -> void:
	# WorldManager temporarily disables monitoring while swapping rooms. Querying overlaps in
	# that window emits an engine error and cannot produce a valid transition.
	if not monitoring:
		return
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
	if transition_direction == "up" and not _player_is_ascending(body):
		return false
	var world_manager := get_tree().get_first_node_in_group("world_manager")
	if world_manager and world_manager.has_method("transition_to_room"):
		world_manager.transition_to_room(target_room_id, spawn_side)
		return true
	return false

## Vertical exits are holes you fall through or climb into, not doorways you walk past.
## room-assembler.ts places 'up' on the walk line (floorY - 80) and 'down' *below* the floor
## (floorY + 96) so a pit/weak-floor fall can hit the sensor without intercepting walkers.
## 'up' still needs an ascending check because its sensor sits at walking height.
##
## Measured on a real 4-zone/40-room generation: 4 of 40 rooms had the 'down' shape (it blocked
## access to the room holding the double_jump pickup), and the 'up' shape broke the critical path
## outright — the playtest bot walking room_009 -> room_035 (a shortcut at x=936) was intercepted
## at x=468 by room_009's up exit to room_010, and never reached victory. With both gated, the bot
## completes the route and reaches the victory room.
##
## Weak-floor 'down' exits are unaffected: slamming through one leaves the player airborne and
## falling, which satisfies the descent check.
func _player_is_ascending(body: Node2D) -> bool:
	if not (body is CharacterBody2D):
		return true
	var character := body as CharacterBody2D
	return character.velocity.y < 0.0

func _player_is_descending(body: Node2D) -> bool:
	if not (body is CharacterBody2D):
		return true
	var character := body as CharacterBody2D
	return not character.is_on_floor() and character.velocity.y > 0.0
