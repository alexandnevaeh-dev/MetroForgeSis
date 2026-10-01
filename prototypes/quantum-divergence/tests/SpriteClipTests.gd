extends SceneTree
const Clips = preload("res://scripts/SpriteClipPlayer.gd")
var passed: int = 0
var failed: int = 0

func check(value: bool, name: String) -> void:
	if value:
		passed += 1
	else:
		failed += 1
		push_error("SPRITE_CLIP_TEST_FAILED: " + name)

func _initialize() -> void:
	var player = Clips.new({"idle":{"frames":6,"fps":10,"loop":true},"run":{"frames":10,"fps":24,"loop":true},
		"attack":{"frames":6,"fps":24,"loop":false},"hit":{"frames":3,"fps":18,"loop":false},"death":{"frames":12,"fps":18,"loop":false}})
	check(player.sample("idle",100).index == 0,"entry starts at first frame")
	check(player.sample("idle",105).index == 0,"idle holds until exact six-tick boundary")
	check(player.sample("idle",106).index == 1,"idle cadence uses fixed simulation ticks")
	check(player.sample("idle",136).index == 0,"idle loops at six complete frames")
	check(player.sample("run",137).index == 0,"state change resets phase")
	check(player.sample("run",139).index == 0 and player.sample("run",140).index == 1,"24 FPS cadence remains crisp across noninteger tick intervals")
	check(player.sample("attack",141,7).index == 0,"attack event enters independently")
	check(player.sample("attack",159,7).index == 5,"nonloop attack holds its last frame")
	check(player.sample("attack",160,8).index == 0,"a new attack event restarts the same state")
	check(player.sample("hit",161).index == 0,"hit interrupts attack")
	check(player.sample("hit",171).index == 2,"hit holds recovery pose")
	check(player.sample("death",172).index == 0,"death interrupts hit")
	check(player.sample("death",300).index == 11,"death latches final frame")
	check(player.sample("death",30000).index == 11,"death cannot loop or resurrect visually")
	check(player.sample("idle",30001).index == 0,"explicit fresh actor returns to a new idle phase")
	check(player.sample("attack",30002,9,12).index == 0,"gameplay window enters independently")
	check(player.sample("attack",30008,9,12).index == 3,"windup boundary reaches the extended action pose")
	check(player.sample("attack",30012,9,12).index == 5,"short gameplay window still displays the complete recovery strip")
	print("QUANTUM_SPRITE_CLIP_RESULTS " + JSON.stringify({"passed":passed,"failed":failed,"scope":"Shared clip state, fixed-tick cadence, interruption, repeat attack and death terminal behavior"}))
	quit(0 if failed == 0 else 1)
