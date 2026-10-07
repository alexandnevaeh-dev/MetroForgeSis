# Platformer development evidence — 2026-10-06

Platformer is a separate `SIDE_VIEW_PLATFORMER` genre in the shared registry, schema,
New Game UI, manual scaffolder and generation pipeline. It uses ordered stages,
basic side-view jumping, one-way ledges, checkpoints and a final encounter.
Mandatory Metroidvania ability locks, random exploration shortcuts and the
Stormglass authored layout are not part of this genre. Existing top-down and
Metroidvania project creation remains covered by isolation tests.

The starter uses 64×24-tile stages, a clear entry runway, movement-sized platform
rises and short gaps. Native collision testing exposed and corrected overhead
platform interference. Stage HUD progress replaces the exploration minimap.
Manual Platformer creation synthesizes original local SFX and biome/title/boss
music using the existing procedural audio generators; no provider was called.

## Verified scope

- Generation dependency and desktop builds passed.
- 14 focused topology, geometry and manual project isolation tests passed.
- Real Electron selection and manual creation passed in isolated E: storage.
- Fresh app project `app-1791303632409/games/platformer-stage-test` passed ten
  native Godot checks: genre, no mandatory upgrades, actual music playback,
  running, jumping, landing, first stage exit, stage HUD and hidden exploration map.
- Earlier fresh one-way project `app-1791303051610/games/platformer-stage-test`
  passed all eight-stage movement traversal: 17 checks, seven room transitions,
  five gap jumps and real `room_003` checkpoint activation. Enemies were explicitly
  removed in this movement fixture. This is not combat acceptance.

Evidence root: `E:/MetroForgeData/Development/platformer-20261006-v1`.
The latest fresh audio-enabled app project also passed the complete ordered
movement route: 18 checks, seven transitions, five gap jumps, checkpoint activation
and final encounter music playback. Evidence: `audio-all-stage-route.log`.
Enemies remain removed in this fixture; this result does not establish combat
or final victory.
Logs preserve initial failures and observer errors alongside the final results.
The main repository index hash remained
`0803C77A5996B93D6E975DFA41AB9CEB9E7F078881FAF88BCF265D7AF7FB3918`.

## Remaining work

Native checkpoint/death validation subsequently passed ten checks in the fresh
audio-enabled app project. The fixture enters the real SavePoint Area2D through
movement, applies lethal HealthComponent damage, and waits for the automatic
game-over and checkpoint respawn sequence. It verifies the saved stage, a fresh
actor, restored health, grounded placement, and resumed movement. Stage setup is
direct and enemies are removed; this remains separate from combat acceptance.
Evidence: `E:/MetroForgeData/Development/platformer-checkpoint-20261006/native.log`.
The initial fixture overlapped the return-door sensor; its failed log is retained.

Artwork is fallback starter art; character/boss/NPC animation warnings remain.
Full AI-generation
acceptance, Unity/Unreal runtime evidence and finished artistic presentation are
not established by these tests. The application and game are not production-ready.

## Cross-engine one-way ledge export

The shared gameplay pack now retains `oneWay: true` on Platformer ledges while
floors and legacy Metroidvania solids keep their existing behavior. Unity's
runtime assembler consumes the flag with a PlatformEffector2D and an effector
collider. Unreal assembly emits an explicit warning because its native runtime
does not yet consume this behavior. It must not be treated as Platformer parity.
Engine package compilation and 31 gameplay-pack/Unity/Unreal assembly tests
passed. Native Unity 6000.3.0f1 subsequently compiled the current runtime and
passed upward ledge passage, downward landing, and legacy solid-collider checks.
The fixture invokes the actual GameBootstrap solid constructor with serialized
gameplay data, then uses native Physics2D simulation. It does not establish a
full Unity gameplay campaign, visual acceptance, or Unreal runtime parity.
Its original package-resolution attempt failed certificate verification; exact
cached package versions were copied into isolated E: offline package folders.
No certificate validation was disabled. Logs and the positive proof are at
`E:/MetroForgeData/Development/unity-platformer-oneway-20261006`.
The repeatable Editor entry point is `tests/unity/PlatformerOneWayValidation.cs`.
Evidence: `E:/MetroForgeData/Development/platformer-engine-oneway-20261006/tests.log`.

## Full ordered campaign input results

The fresh eight-stage app project completed seven transitions, activated the
room_003 checkpoint, and defeated the final boss using Input only. All encounters
remained enabled. The run recorded 25 attacks, 50 damage taken, zero deaths,
and victory after about 48 seconds. No geometry, actor health, or damage rules
were changed. Evidence: `platformer-campaign-20261006/probe-native.log` under
`E:/MetroForgeData/Development`.

The initial attempt exposed a playtest-agent ground ray starting inside floor
colliders; it timed out in the room_004 gap. Its failed log remains preserved.
The ray now starts eight pixels above the feet and probes 24 pixels below them.
The runner's completed-transitions check also now requires every planned
transition, rather than accepting any positive number of transitions. The
visible repeat with this stricter runner also passed all eight checks: seven
transitions, 25 attacks, 40 damage taken, no deaths, and victory. Its log is
`platformer-campaign-20261006/strict-visible.log` under the same evidence root.

### Separate arena test

The fresh manual Platformer project passed a separate native arena test using
the existing PlaytestAgent combat controller. Twenty real player attacks reduced
the final boss from 200 health to zero and triggered the boss-defeated signal
and victory state. The player took damage during the encounter. No enemies were
removed, health granted, damage invoked directly, or victory signals forced.
The fixture loads the final arena directly; it does not prove an uninterrupted
eight-stage combat campaign. Headless evidence is retained at
`E:/MetroForgeData/Development/platformer-boss-20261006/native.log`.
The visible OpenGL repeat also passed: 25 attempted attacks, 20 boss damage
events, victory, and 60 remaining player health. Entry/result PNG captures and
`visible.log` are retained beside the headless evidence. The capture confirms
starter fallback presentation, not finished artwork.
