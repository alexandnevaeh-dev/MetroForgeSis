# Top-down journey integrity — 2026-10-07

The top-down playtest bot no longer restores full health immediately before the
boss. Telemetry now observes actual area visits, received HealthComponent damage,
player deaths, boss entry health, checkpoints and generic saves. Planned areas
remain a separate field. The runner requires every planned transition rather
than accepting any positive transition count. Rendered runs persist a final
capture and structured proof.

The isolated current canopy project completed eight checks and all four area
transitions through victory with twenty attack inputs, two collected items and
one key-opened gate. No actor health, collision, position, damage rules or boss
health was modified by the driver. A captured repeat took ten damage and ended
with ninety health, zero deaths and boss health zero. Original generated inputs
remain recoverable; 718 compared inputs matched apart from the two declared QA
agent/runner updates. Existing top-down/Stormglass/Platformer projects were not
migrated or mixed.

A separate controlled native integrity probe passed eight checks: actual damage
observation, reduced-health preservation at boss entry, failure for zero-time
boss completion, no artificial attacks/damage, autosave exclusion from checkpoint
telemetry, and real SavePoint callback/healing observation. This probe directly
sets up an area and calls HealthComponent/SavePoint methods; it is not gameplay
acceptance. The ordinary full journey above uses movement/attack/dodge/interaction
inputs. Missing-art/visual approval and multi-seed balance remain open.

The first journey logs mislabeled the generic save signal as checkpointEvents.
Those raw logs and captures are preserved unchanged. The corrected observer uses
SavePoint's `object_activated("save_<area>")` signal for checkpointEvents and stores
generic save_triggered events separately. The correction passed the controlled
native probe, but the completed full journeys predate that label correction.
Do not claim they proved a checkpoint touch.

Evidence: `E:/MetroForgeData/Development/topdown-journey-integrity-20261007`.
Read `first-playtest-summary.json`, `captured-summary.json`, `preservation.json`,
`native-playtest.log`, `captured-playtest.log`, and `integrity-save-events.log`.
The native final capture/proof are `game/qa/topdown-playtest/final.png` and
`proof.json`; the controlled probe is `game/integrity-proof.json`. Teardown
ObjectDB/resource warnings persist in the controlled probe. Rendering used
OpenGL on the installed NVIDIA GPU; this is not NVIDIA image-generation evidence.
