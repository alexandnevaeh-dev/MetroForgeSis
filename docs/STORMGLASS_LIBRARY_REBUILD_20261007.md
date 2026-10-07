# Sunken Library rebuild — 2026-10-07

Room014 now explicitly selects the library-reading architecture in the authored
Stormglass campaign recipe. Its two 512px side chambers open through 192px-high
arch portals into a 1024px central reading hall. Solid roof volumes fill unused
canvas. The assembly clears generic floating platforms and pits for this layout;
existing Studio-authored paint still uses the existing preservation path.

The generation package's Godot dependency compiled successfully in the permitted
environment. The restricted build produced previously observed unrelated test
callback inference errors, retained separately.

An isolated copy of the earlier app export received compiler-produced enclosure
volumes. Six original encounter identities were retained, with former platform
placements grounded on the rebuilt floor. This is a geometry candidate, not a
new app-generated export. Native OpenGL testing exited 0 and passed six checks:
three roofs, two piers, themed kit, exact background clipping, Input-only exit to
room015, and Input-only return to room014. No invulnerability or direct damage
was granted. Room entry setup and overview camera are controlled fixture setup.

Evidence: `E:/MetroForgeData/Development/stormglass-library-rebuild-20261007`.
The initial run's shutdown resource errors are preserved in `native.log`. The
return run waits for actual threaded neighbor preload requests to settle;
`native-return.log` has no parse errors but retains missing animation warnings
and an ObjectDB exit warning. Its proof is `game/library-proof.json`; the overview
is `game/library-overview.png`. Original recipe, assembler and room scene backups
are retained. No existing app export was modified.

Fresh real-app generation, room-editor parity, full campaign regression and
finished character art remain open. This one-floor three-space interior does not
complete the remaining campaign's stairs, backrooms or region architecture.

Two enclosure regression tests passed, covering unequal roof spans, clear arch
portals, room bounds and exclusions for vertical ports and unrelated themes.
The blueprint platform/floor records also reflect the cleared library layout;
room records derive masonry rectangles from the same compiler function. Fresh
app editor parity still requires direct validation.

Fresh desktop generation produced the library theme, three roofs, two piers and
matching editor records. An isolated copy passed eight native checks, retaining
six encounters and normal damage rules with Input-only exit and return. The
initial count observer omitted the primary `Enemy` node; its failure is retained.
The corrected log is `fresh-native-corrected.log`. Missing animation and teardown
resource warnings remain. Overall app generation remains failed at 253/382.

`fresh-preservation.json` verifies 1729 copied input files. QA contact
sheets were explicitly excluded by the copy operation and are listed separately.
The full native campaign regression is running via `run-fresh-journey.mjs`; its
result must be inspected before claiming campaign acceptance.

## Full campaign and background regression

The fresh actual-app export completed 34/34 Input-only campaign transitions,
earned all six abilities, reduced all four bosses to zero health, and reached
victory with 108 attacks, 150 damage taken and zero deaths. Native exit0, no
runtime errors, approximately373seconds. Normal health, combat, fades and
checkpoint healing remained enabled. `final-journey-comparison.json` verifies
all1729 copied input hashes after play. Optional branches and art approval
remain separate. Raw proof is in `journey-v1`.

The modular background smoke gate now checks native room dimensions, clipping
and brick-wall placement instead of demanding one identical background. The
modular surface-count gate requires every declared room; legacy checks remain
for projects without the modular configuration. Other art/surface/condition gates
are unchanged. `RoomKitBoundsValidation.gd` passed50native checks: updated smoke
script compilation, bounds in43rooms, four malformed-background rejections,
restoration, and full coverage. Evidence: `bounds-native.log` and
`fresh-app-game/bounds-proof.json`. This controlled-load test does not establish
full updated-smoke acceptance; that remains a separate run.

The updated headless smoke candidate reached both result markers, with
255/296 checks passing. Both new modular background/surface-count gates
passed; the remaining production gates were retained and still fail. The
canonical smoke script was tested through a separate candidate filename without
modifying the app export's original verification script. Raw log:
`updated-smoke.log`; parsed results: `updated-smoke-summary.json`.
