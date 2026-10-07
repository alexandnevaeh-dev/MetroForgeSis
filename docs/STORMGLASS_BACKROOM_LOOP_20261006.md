# Backroom route correction

Native input traversal of the fresh 43-room app project reached the Echo Service
Descent, Archive Vault, and Memorial Return Stair, then failed at its bottom
entrance. An isolated diagnostic confirmed collisions against StairFlight_0:
the vault enters from the right, while the old first flight started on the left,
trapping the actor below its incline.

New generation mirrors room_042's landings and seven flights to meet the vault
entrance. Other stairwells retain their geometry. Existing authored room data
continues to use the preservation guard. Only the isolated development candidate
was explicitly migrated for native testing; its old room records and scene were
backed up before migration. The earlier app project was not silently rewritten.

The complete candidate loop passed 21 native checks through actual movement:
room_007 → room_040 → room_041 → room_042 → room_004. This includes descending
seven service flights, crossing the archive corridor, ascending seven return
flights, and jumping with Up into the return port. Initial room setup was direct
and encounters were removed; combat acceptance remains separate. Seven stair
continuity and portal regression tests passed, and the generation build passed.

Baseline failure, diagnostic collision logs, old candidate records, migration
receipt, and successful traversal are retained at
`E:/MetroForgeData/Development/stormglass-backroom-loop-20261006`.
The visible OpenGL repeat also passed all 21 checks. Archive, return-stair,
and main-passage captures are retained beneath its E: user-data directory;
the archive capture was inspected. Artwork remains a development candidate.

## Fresh app-generation integration

After rebuilding the desktop app, real New Game generation run 1791339932967
exported 43 rooms with the mirrored room_042 landing and first flight in its
saved records and native scene. No geometry patch or migration was applied to
that new project. Its visible native backroom-loop test passed all 21 checks.
Evidence: `fresh-generation.log` and `fresh-backroom-loop.log` in the same E:
evidence directory, and the actual project under
`E:/Metroforge/MetroForge-Publish/reports/game-tests/20261006-world-layout-generation/1791339932967`.

Overall generation validation remains FAILED: 253/382 runtime checks passed;
enemy/boss artwork and room-presentation requirements remain unresolved. Export
and loop traversal success must not be reported as full generation acceptance.
