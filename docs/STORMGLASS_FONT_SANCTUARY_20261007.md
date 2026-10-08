# Double-Jump Font sanctuary candidate

Room 013 now has a sheltered pickup alcove, taller central practice nave and lower library exit. Pale marble, stained glass, a relic altar, glass reliquary and a ceremonial banner use the existing side-view modular kit. Both original jump platforms, three ability pickups and the two ordinary map connections retain their locations and rules.

The 2048x1280 room has a floor at y=1216. Roof spans are x=0..640 at y=832, x=640..1408 at y=576, and x=1408..2048 at y=896. Two threshold piers leave 256px of passage clearance. These solids fill unused canvas rather than creating another storey. Rooms with upward transitions continue to use their open shaft layout.

Evidence root: `E:/MetroForgeData/Development/stormglass-font-20261007`.

- Backups of the assembler, campaign recipe and room kit are retained.
- Four focused test files passed 14 tests, covering this sanctuary, Current Tunnel, Drowned Hall and actual project assembly.
- Desktop build passed. Fresh actual-app export `1791432834760` contains the expected roofs and unchanged platforms.
- The only campaign recipe change is room 013's theme metadata. Progression and ability definitions remain unchanged.
- Actual-app export passed; overall art/presentation validation remains failed at 255/382. The corrected visible native fixture passed eight checks, including real ability pickup acquisition, library exit and return. Native exit was zero without script or frame-size errors; NPC animation and ObjectDB teardown warnings remain. All 1868 copied export inputs retained their hashes. Comparison across all 43 rooms found no changes to dimensions, connections, encounters, platforms, pits or entity placements. The original fixture player-lookup error and failed log remain preserved. Full campaign validation and artistic acceptance remain pending.

This is an unuploaded side-view candidate. Top-down and Platformer sets remain separate. Modular kit assets remain candidates; no production approval is inferred from architecture tests.

## Recessed upper masonry candidate

The 224px gap above the central facade now uses an opt-in recessed masonry panel. It follows the actual roof span at x=640, y=576, width=768, height=224, ending exactly at the authored facade top. Existing windows/columns retain their dimensions; the panel has no collision or transition logic. Only room 013 opts in through `vaultInfill`.

Evidence: `E:/MetroForgeData/Development/stormglass-font-infill-20261007`. Desktop build passed. The isolated visible native repeat passed ten checks, including exact infill bounds, visual-only behavior, original platforms, real pickups and library exit/return. The final run exited zero without script or resource errors; ObjectDB shutdown warnings remain. All 1908 compared inputs differ only in planned renderer/room-kit/fixture/capture files. Earlier resource-error and incorrect fixture-release attempts remain recoverable. The final fixture releases its reference-counted agent and settles room preloads before exiting.

Fresh actual-app report `1791433999871` completed: export passed; overall art/presentation validation remained failed at 255/382. The exported infill function and opt-in room metadata match the current source. Newer platform-corbel additions are absent from this export and preserved separately; full renderer byte parity is not claimed. All 43 rooms retain the eight compared gameplay fields; exact Font roofs are verified. The unchanged isolated export copy imported without script/native errors and is ready for the full visible campaign. Full campaign and production visual acceptance remain pending; this candidate has not been uploaded.

## Full exported campaign

The unchanged actual-app Font infill export completed the visible 34-step route with six abilities and four bosses. Native exit was zero without script/native errors. The route recorded 117 attacks, 110 damage, zero deaths and victory at approximately 347 seconds. `campaign-v1/preservation.json` seals the source-input hash comparison; ObjectDB and NPC animation warnings remain recorded in `native-summary.json`.

This campaign covers the exported Font infill snapshot. The newer current-source platform-corbel addition and the later Pressure Shaft enclosure are outside its scope. Both remain preserved for separate fresh export and native validation. Broader art/presentation validation and production visual acceptance remain incomplete.
