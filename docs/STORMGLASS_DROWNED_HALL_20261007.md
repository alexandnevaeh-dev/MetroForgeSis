# Drowned Hall enclosure candidate

Room 011 gains the `drowned-hall` theme and three bays sized 640,768,640 pixels.
Side bays have 384px clearance and the central hall 512px. Two piers retain
256px walking portals. Roofs fill unused upper space without introducing another
playable storey. Existing low platforms at x=224 and x=1472 are preserved and do
not intersect the new masonry. There are no existing pits to remove.

Only room 011's theme changes in the campaign recipe; all map edges, requirements,
encounters and remaining metadata are unchanged. Its existing burial-wall kit,
muted teal palette, sarcophagus and censer remain the starting visual vocabulary.
New art dressing, visible assessment and any physical water design are separate.

Sixty-five enclosure/room-assembly tests passed. Backups and logs are under
`E:/MetroForgeData/Development/stormglass-drowned-hall-20261007`.
Fresh desktop generation, native crossing/return, complete campaign regression
and final visual presentation remain pending. This is an enclosure candidate,
not a completed level or production approval.

Actual desktop generation report `1791404380244` is active after a successful
desktop build. Its first runtime phase reports 255/382 checks, with broader enemy
art and presentation gates still failing. Repair/final QA and export must reach
a terminal result before native enclosure acceptance. The dedicated
`DrownedHallValidation.gd` fixture is prepared to check native roof dimensions,
both original platform colliders, six active encounters and normal exit/return.
No technical room pass is claimed yet; canonical Git index remains preserved.

The desktop job is now terminal: Drowned Hall export passed with three roofs,
two piers and both unchanged platform records; broader generation validation
still failed at 255/382. An isolated unchanged export copy passed ten native
rendered checks, including roof dimensions, exact original platform colliders,
clipped background, all six encounters, normal damage rules and Input-only exit
to room 012 and return. Terminal exit was zero. `preservation.json` verifies
1892 source inputs unchanged, with only two added validation fixtures.
The native log retains an ObjectDB teardown warning and has no native/script errors; the room capture
`native-game/drowned-overview.png` was inspected. Complete campaign regression,
final theme dressing and finished visual quality remain open.

The unchanged fresh export subsequently completed the full visible native
campaign: 34 route steps, six abilities, all four bosses, 115 attacks, 190 damage
taken, zero deaths and final victory. The process exited zero with no native or
script errors. Evidence: `campaign-v1/native-summary.json` and `driver.log`
under the same E: evidence root. Boss frame-size warnings remain a separate
export defect; this campaign pass does not approve their appearance.

The existing `StormglassDrownedInput` fixture also passed 23 visible native
checks on the later fresh boss-run export. It walks/jumps through eight targets
in both directions and stays within room 011. It explicitly removes encounters
and does not prove combat; the full campaign above supplies separate evidence.
Evidence: `stormglass-boss-run-20261007/drowned-input-v1/native.log` under the
E: development directory, with three captures and a structured proof in its
isolated Godot user-data folder. Exit status was zero; an ObjectDB warning remains.
