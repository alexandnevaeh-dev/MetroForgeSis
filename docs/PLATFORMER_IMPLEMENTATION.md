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

Artwork is fallback starter art; character/boss/NPC animation warnings remain.
Native combat, final victory, checkpoint death/respawn, full AI-generation
acceptance, Unity/Unreal runtime evidence and finished artistic presentation are
not established by these tests. The application and game are not production-ready.
