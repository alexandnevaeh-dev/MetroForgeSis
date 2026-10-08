# Pressure Shaft enclosure and playable cache branch

Room 015 now has a sheltered library approach, high pressure chamber and lower service hall. Its four original platforms, three encounters and original pit remain in place. Existing modular lamp, chain winch and gear housing props replace the generic coffin; they add no interaction or collision. Top-down and Platformer sets remain separate.

At 1792x768, floor y=704: roofs span x=0..256 ending at y=448, x=256..832 ending at y=256, and x=832..1792 ending at y=416. Threshold piers leave 192px and 224px passages. The volumes avoid original platform colliders and 80px headroom above them.

The down sensor previously sat behind solid floor. The first native test reproduced that failure after successful shrine exit and return. The same graph-owned opening helper used by gallery branches now admits the un-gated Pressure Shaft descent. Fresh export adds a 128px aperture at x=832..960 while preserving the original x=1344..1408 pit. Ability-gated descents retain their rules. This intentional floor correction makes the existing branch reachable.

Evidence root: `E:/MetroForgeData/Development/stormglass-pressure-shaft-20261007`. Source backups, the failed export and native descent logs remain recoverable.

## Verification

- Nine focused checks passed, including real assembled floor-rectangle clearance, retention of the original pit and rejection of automatic holes for ground-slam-gated connections. Desktop build passed.
- Actual-app report `1791436554143` passed export. The broader art/presentation job still failed at 255/382; no gates were removed.
- Corrected visible native replay passed nine checks: roofs, platform/encounter count, both pits, physical aperture clearance, room clipping, shrine exit/return, actual cache descent and cache connection into the guardian chamber. Native exit was zero without script/frame-size errors; ObjectDB teardown warnings remain.
- The early native copy's non-import inputs stayed unchanged. Thirty-six Godot import metadata files refreshed and match the finalized source export. Final gameplay scripts, scenes, data and assets match. Reports/publication records finalized after the early copy are listed in `descent-v1/final-export-preservation.json`; whole-export byte identity is not claimed for that early copy.
- Comparison across 43 rooms also detected regenerated room 032 platforms, pit and entity positions. The finalized export then completed the full visible 34-step campaign, covering that geometry as well as the aperture fix: six abilities, four bosses, 119 attacks, 140 damage, zero deaths and victory after 350128ms. All 1911 finalized export inputs retained their hashes. Evidence: `campaign-v1/native-summary.json` and `campaign-v1/preservation.json`.
- Actual Electron Regenerate Room and Undo passed seven checks in `editor-v1/editor/proof.json`, preserving the aperture, masonry, 42 sibling room records, neighboring scenes/graph/render script, byte-identical restored room data and native collision data, without renderer exceptions.

Complete optional-branch-loop combat, finished art and production visual acceptance remain open. NPC animation and ObjectDB warnings remain recorded. This reviewed candidate has not yet been uploaded.
