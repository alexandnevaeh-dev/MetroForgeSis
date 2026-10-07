# Masonry relief candidate

StormglassMasonrySurface adds subdued upper bevels, lower recess shading, side
shadows and deterministic mineral flecks to its brick faces. Detail is clipped
arithmetically within each face and uses existing drawing commands; no new
decorative nodes or physics bodies are created. Previous draw source is retained
under `E:/MetroForgeData/Development/stormglass-masonry-lighting-20261007`.

An isolated Archive Gallery copy passed all nine native enclosure and Input
exit/return checks, with terminal exit zero. Exact roof dimensions, clipped
background and all four encounters remain covered. `preservation.json` confirms
the masonry drawing script is the sole change among 1849 app-export inputs.
The rendered `game/archive-overview.png` was inspected. Existing missing enemy
run-sheet and teardown ObjectDB leak warnings remain; this is not completed
artwork, performance acceptance, fresh app generation or visual approval.

Full-campaign evidence for the archive enclosure and navigation driver is in
the separate `stormglass-archive-gallery-20261007/journey-v3` run; that successful
journey predates this drawing-only update. Its scope must not be conflated with
this focused rendered enclosure test.

## Complete native surface audit

The rendered all-room audit passed 1261 checks across all 43 configured campaign
rooms and 200 floor/platform surfaces. Roof and pier drawing bounds now have
explicit checks against their actual RectangleShape2D colliders. Background
clipping and floor-course bounds remain covered. The process exited zero with
no ERROR or SCRIPT ERROR entries. Its ObjectDB teardown leak warning remains.

`all-room-completion.json` records the summary and exact E:-resident native proof
path; captures and proof are under this candidate's `appdata/Godot/app_userdata`.
Comparison confirms only the masonry drawing script and the audit fixture differ
among 1849 source inputs. This fixture directly loads rooms, protects the actor
for screenshots and adjusts a camera position. It establishes geometry coverage,
not Input-only traversal, combat balance, performance or finished visual quality.
