# Enemy run contract and natural charge playback

The fresh Archive Gallery export contained no run sheets for twenty enemies,
although its scenes requested run paths and EnemyController selects run at
charge speed. Seventeen named idle sheets were absent too; the native loader
can use the first walk frame as its idle fallback. These counts describe named
files, not seventeen invisible actors. Read-only inventory is under
`E:/MetroForgeData/Development/stormglass-enemy-contract-audit-20261007`.

Side-view Metroidvania and Platformer asset generation now emits twelve-frame
enemy run strips through the existing run-cycle generator. Top-down generation
keeps its separate route. Compilation and a real offline asset-pipeline test
passed. Authored run assets win when present; fallback maturity is unchanged.

Native checks under `E:/MetroForgeData/Development/stormglass-enemy-run-20261007`:

- Five controlled controller checks passed: twelve frames, exact clipped atlas
  regions, run selection, cadence reference and multiple observed poses.
- Natural AI initially charged at full speed but never played run: startup
  launched an attack animation whose playback overrode locomotion. The failed
  log and proof are preserved.
- Charge startup now selects a multi-frame run clip when available, otherwise
  retaining its previous attack fallback. Movement speed, charge duration,
  combat cooldowns, hitboxes and damage are unchanged.
- The natural AI retry passed six checks, including perception wakeup, charge
  state, actual charge velocity, run playback and multiple observed run poses.
  Both native probes terminated with their expected exit codes.

The natural probe uses a controlled floor and actor placement, existing enemy005
data and active enemy/player logic. Test-generated enemy000 art is assigned to
exercise playback; this does not approve enemy005 artwork or establish full
campaign acceptance. Fresh desktop generation, complete generated enemy-sheet
admission, visual review and full campaign regression remain open.

## Integrated fresh desktop candidate

All seventeen TypeScript projects and seventy-one focused tests passed after
integrating the run generation, archive enclosure and masonry changes. The
run-strip regression covers both SIDE_VIEW_METROIDVANIA and SIDE_VIEW_PLATFORMER;
the top-down canopy pipeline regression also passes separately.

Actual desktop generation report `1791387465813` is running. A read-only inventory
after asset emission finds all twenty enemy run sheets present, reducing the
named missing-clip count from thirty-seven to seventeen (idle only). This is
early emission evidence, not terminal app acceptance. The completed export
must receive a new native campaign regression before publication.

The desktop job subsequently terminated with failed broader validation
(255/382 runtime checks); archive export still passed. A separate unchanged copy
of that finished export is now running the complete visible Input journey under
`fresh-app-journey`. No driver/gameplay patches are applied to this candidate.
`preservation-before.json` and `input-hashes.json` record source-copy comparison
and all twenty run-strip dimensions. Terminal native result remains pending.

The unchanged desktop export subsequently passed the complete rendered Input
journey: 34/34 transitions, six abilities, four bosses, 109 attacks, 140 damage
taken, zero deaths and victory after 358.115 seconds. Terminal exit was zero
with no native or script errors. Final comparison verifies all 1891 source inputs
unchanged. `fresh-app-journey/completion.json` records results and preservation.
This integrates the archive enclosure, masonry, driver and enemy run changes
through actual app generation and native gameplay. The broader app art and
presentation validation still fails; production readiness remains unestablished.
