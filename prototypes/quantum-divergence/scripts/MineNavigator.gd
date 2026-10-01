extends RefCounted
## Same starting movement kit used by the native traversal test and rendered entry walk.
var next_point: int = 1
var jump_started: int = -1000
var reached: Array[int] = [0]

func controls(player, points: Array) -> Dictionary:
	if next_point >= points.size():
		return {}
	var destination: Vector2 = points[next_point]
	var delta: Vector2 = destination - player.position
	if absf(delta.x) < 3.5 and absf(delta.y) < 2.0 and player.grounded:
		reached.append(next_point)
		next_point += 1
		return controls(player,points)
	var input: Dictionary = {"move":signf(delta.x) if absf(delta.x) > 3.0 else 0.0,"run":true}
	var gap_ahead: bool = absf(delta.x) > 24.0 and not player._blocked(player.position + Vector2(signf(delta.x) * 32.0,1.0))
	if player.grounded and (delta.y < -16.0 or (absf(delta.y) < 16.0 and gap_ahead)):
		input.jump = true
		jump_started = player.tick
	input.levitate = player.tick - jump_started < 16
	return input
