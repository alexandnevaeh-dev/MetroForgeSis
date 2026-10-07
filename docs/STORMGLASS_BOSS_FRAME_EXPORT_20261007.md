# Boss frame dimensions after final texture emission

Fresh Drowned Hall campaign logs exposed 96px boss sheets loaded with 160px
scene frame cells. The room assembler resolved sheet dimensions before generated
textures were written, so it inspected copied template art or no file at all.

The project assembler now defers room scene emission until generated textures,
external pack changes and authored overlays have completed. Boss frame sizing
reads the final emitted PNG. The existing room recompilation path already reads
emitted files and remains unchanged. Source artwork and gameplay rules are unchanged.

Both 96px and 160px final-sheet assembly regressions passed, alongside existing
assembler and room tests: 68 checks. The native desktop build passed. The first
test-only import crossed the TypeScript root boundary; it was corrected to use
the compiled package and both failed build logs remain preserved.

Evidence and source backup:
`E:/MetroForgeData/Development/stormglass-boss-frame-export-20261007`.
Fresh actual-app report `1791408465222` exported the corrected boss cells. Its
broader art/presentation validation still failed at 255/382, with no gates removed.
The unchanged export copy passed 16 rendered native checks across four bosses:
scene cell size matches emitted PNG height, every walk frame is retained and all
atlas cells have exact non-overlapping clipped regions. All 1895 original inputs
retain their hashes; only the fixture script and scene were added.
The initial fixture exited with a resource teardown error. Joining background
room loads removed that error on repeat; an ObjectDB leak warning remains.
Captures explicitly select the validated walk animation with controlled camera
placement. The initial capture showing missing-run fallback was preserved.
Boss run art is missing and still produces fallback rectangles in normal playback.
Capture repeats retain a resource shutdown error alongside successful frame
checks; the prior `native-no-resource-error.log` proves the structural repeat
without that error. These captures are inspection evidence, not visual approval.
The full unchanged-export campaign completed 34 steps, six abilities, four
bosses and final victory: 121 attacks, 140 damage, zero deaths, about 361 seconds.
Exit status was zero and there were no native or script errors in that campaign.
`campaign-v1/preservation.json` verifies all 1895 original inputs unchanged.
This correction does not establish finished boss artwork or animation approval.

Publication review replaced the test-only asset-package output import with two
valid transparent PNG fixtures stored in the Godot test package. A clean source
checkout can run these assembly checks without prebuilding another package.
