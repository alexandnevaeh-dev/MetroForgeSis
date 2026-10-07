# Desktop top-down tile request — 2026-10-07

Fresh desktop New Game testing exposed a structural input bug: the user description
requested a32px terrain grid, but deterministic design used the TINY_TEST16px
profile default. The canopy kit's32px compatibility guard consequently did not
select it. The original app export and failed runtime job remain recoverable.

Fresh deterministic designs now honor explicit tile/grid phrases, while ordinary
sprite/screen dimensions are excluded. Single supported sizes8..128 are recognized;
ambiguous/negated requests preserve profile defaults. The model design prompt uses
the same preferred size, and an explicit user grid is bound before validating a
model-produced design. Existing saved/resumed DNA is untouched. Eleven new/existing
design and genre tests passed; the desktop rebuilt successfully.

The actual UI retry saved TOP_DOWN_ACTION_ADVENTURE,32px tiles, ruined-canopy-v3
and sixteen wall masks. Its generation/runtime job is still running. Do not claim
full generation, native gameplay, provider execution or production approval yet.
The first startup observation timed out before submission; a bounded60second
startup observation and failure screenshot/DOM diagnostics were added. The next
run started correctly and submitted through the actual app/IPC flow.

Evidence: `E:/MetroForgeData/Development/topdown-desktop-generation-20261007`.
Read `tile-request-tests.log`, `tile-fix-build.log`, `app-diagnostics.log`,
`app-tile-fix.log`, and `tile-fix-evidence.json`. The preserved bad export is under
`reports/game-tests/20261007-topdown-desktop-generation/1791366040654` and the
corrected fresh export under `1791367020114`. Script:
`scripts/verify-topdown-desktop-generation.mjs`. It keeps overall job success and
required export checks separate, and requires both for its own passing result.

The corrected real desktop job completed successfully. Its169/169 native runtime
checks passed, and the generated top-down playtest passed eight checks, all four
transitions, twenty attacks and boss victory without harness healing. The job's
required top-down export checks also passed. Completed UI capture:
`reports/game-tests/20261007-topdown-desktop-generation/1791367020114/generation-result.png`.
`desktop-completion.json` records the final scope; prior pending text above is
historical. The built-in artwork is explicitly degraded/draft and unapproved,
and no image-model execution or complete production acceptance is claimed.

The isolated rendered repeat also passed eight checks, four transitions and
victory:20attacks,12damage in the first dungeon,88health on boss entry and
88at the end, zero deaths and no harness health grant. The unchanged copied
app export's750 hashed inputs remained identical after play. This is
stronger gameplay evidence than the prior backend-only fixtures. Evidence:
`visible-completion.json`, `visible-playtest.log`, and
`native-game/qa/topdown-playtest/final.png`.
