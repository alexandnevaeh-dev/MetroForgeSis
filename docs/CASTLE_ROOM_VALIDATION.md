# Larger castle rooms and Unity terrain validation

New generated room defaults provide multi-screen halls: tutorial 1600x768, combat 1920x768, traversal 2560x1280 and set pieces 2560x960. Save/secret rooms remain smaller at 960x640. Explicit editor dimensions take precedence; existing saved rooms are not migrated.

Long tutorial rooms use repeated local stair bays with broad 160-unit balconies, keeping step spacing independent of room width. This is an initial layout expansion; connected galleries, encounters, dedicated long-room artwork and other archetype playthroughs remain incomplete.

Unity missing-art terrain now sizes its fallback SpriteRenderer without scaling the GameObject. Previously, scaling also multiplied the already-sized collider and could repeatedly respawn the player inside an oversized floor.

## Validation

- 80 focused room assembly and tile-layout tests passed; Godot package TypeScript compilation passed.
- Unity 6000.3.0f1 PlayMode: real PlayerActor and virtual keyboard completed a 1600-unit floor route and all nine platform landings. One fixture reset separated the independent floor and stair cases; no teleporting between landings.
- Actual GameBootstrap and DoorSensor: title Continue callback, forward exit and return exit passed in a two-room fixture. Camera clamp checks passed with maximum error zero. Missing-art fixture has no art or combat coverage. An unrelated Unity Editor SearchDatabase startup exception appeared in this run.
- Native EditMode: MetroForgeSolidValidation.Run passed six missing-art floor/balcony/wall cases, checking collider size, center, render size and identity object scale.

Run the reusable regression in an isolated generated Unity project containing the current template:

```powershell
& $UnityEditor -batchmode -projectPath $IsolatedProject -executeMethod MetroForgeSolidValidation.Run -logFile "$IsolatedProject/solid-validation.log"
```

Result: `qa/solid-fallback-result.json` under that project. Native compilation and geometry checks do not establish visual approval, animation quality, complete gameplay, Unreal support or a finished application.

## Expanded ascent follow-up

Puzzle and shrine/gate stair gaps now remain local instead of growing with room width. 83 focused layout/assembly tests and TypeScript compilation pass. Tests cover 800/1600/2560-unit widths and 16/32-unit tiles. Native Unity PlayMode at width2560 and tile32 passed the floor route plus all three puzzle landings and both shrine landings, with real PlayerActor keyboard input. Ability-gate uses the same approach layout but gate interaction itself was not part of this check. The existing Unity SearchDatabase startup exception still appears separately.
