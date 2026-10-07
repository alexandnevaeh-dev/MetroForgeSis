# Top-down room-entry captures

The input-driven PlaytestAgent now records a rendered screenshot after each
observed area entry, including the starting area. Capture paths are included
in telemetry. Headless runs skip captures. This is observer-only instrumentation;
it changes no movement, health, collision or combat rules.

An isolated copy of the completed desktop export, with only this observer update,
passed all eight native playtest checks, all four planned transitions and victory.
Five area-entry PNGs were produced. Final player health was 50. The canonical Git
index hash remained unchanged. Evidence is under
`E:/MetroForgeData/Development/topdown-route-captures-20261007`:
`visible-retry.log` and `game/qa/topdown-playtest/proof.json`.

The initial sandbox rendered attempt crashed and its `visible.log` is retained.
The retry ran outside the sandbox and terminated with exit zero. A separate
import invocation omitted --quit and was stopped after import completed;
its editor-settings save errors are retained in import.log.

The captured aqueduct is traversable but its repeated hedge texture, sparse
room dressing and oversized open spaces still need visual refinement. This
route pass establishes gameplay and capture behavior, not finished artwork.
