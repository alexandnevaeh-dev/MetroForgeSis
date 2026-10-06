extends RefCounted
## Presentation reads authoritative actor states; it never changes damage or phase clocks.
const ClipPlayer = preload("res://scripts/SpriteClipPlayer.gd")
const Enemies = preload("res://scripts/EnemySimulation.gd")
const BOSS_WINDOWS := {"slam":[6,2,4],"burst":[5,3,2],"roar":[4,2,2]}
var kind: String
var definitions: Dictionary
var playback

func _init(actor_kind: String, clips: Dictionary) -> void:
	kind = actor_kind
	definitions = clips.duplicate(true)
	for clip in definitions:
		definitions[clip].source = clip
		definitions[clip].offset = 0
	if kind == "golem":
		for attack in BOSS_WINDOWS:
			var offset: int = 0
			for index in 3:
				var phase: String = ["telegraph","active","recovery"][index]
				definitions[attack+":"+phase] = {"source":attack,"offset":offset,"frames":BOSS_WINDOWS[attack][index],"fps":24,"loop":false}
				offset += int(BOSS_WINDOWS[attack][index])
	playback = ClipPlayer.new(definitions)

func sample(actor: Dictionary, tick: int) -> Dictionary:
	assert(actor.kind == kind and tick >= int(actor.state_started))
	var clip: String = actor.state
	var entered: int = int(actor.state_started)
	var event: int = entered
	var duration: int = -1
	if actor.state not in ["hit","death"] and actor.phase in ["telegraph","active","recovery"]:
		var attack: Dictionary = Enemies.ATTACKS[actor.attack]
		event = int(actor.attack_started)
		if kind == "golem":
			clip = actor.attack+":"+actor.phase
			entered = event
			duration = int(attack.windup)
			if actor.phase == "active":
				entered += int(attack.windup)
				duration = maxi(1,int(attack.active))
			elif actor.phase == "recovery":
				entered += int(attack.windup)+int(attack.active)
				duration = int(attack.recovery)
		elif actor.phase == "telegraph":
			clip = "attack"
			entered = event
			duration = int(attack.windup)
		elif actor.phase == "active" and kind == "driller":
			clip = "drill"
			entered = event+int(attack.windup)
	# Resuming after a hit samples the existing gameplay phase, rather than replaying
	# its warning after the projectile/impact has already happened.
	if playback.state != clip or playback.event_id != event:
		playback.sample(clip,entered,event,duration)
	var result: Dictionary = playback.sample(clip,tick,event,duration)
	result.clip = definitions[clip].source
	result.index += int(definitions[clip].offset)
	result.actor_state = actor.state
	result.phase = actor.phase
	return result
