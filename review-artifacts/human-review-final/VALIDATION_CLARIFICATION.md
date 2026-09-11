# How `RUNTIME_VALIDATED 19/20` coexists with `godot_runtime SOFT_FAIL 194/238`

All numbers below are freshly measured against `GeneratedGames/integ-sideview-polish` (this
packet's revision), not carried over from an earlier report. No threshold was changed and no
failure was relabeled to produce them — see the raw logs cited at the end.

## Three different numbers, three different things

| Number | What it is | Where it comes from |
|---|---|---|
| `RUNTIME_VALIDATED 19/20 gates passed` | The **validation report** — one row per top-level QA gate (`required_files`, `godot_imports`, `godot_runtime`, `gameplay_screenshot_qa`, `godot_playtest`, `modern_metroidvania_gate`, …) | `validation_report.json` → `results[]`, 20 rows this run (19 base gates + the newly-wired `modern_metroidvania_gate`) |
| `godot_runtime SOFT_FAIL 194/238` | **One of those 20 rows.** Its message is the internal tally of `RuntimeSmokeTest.tscn`, a single Godot scene with 238 individual assertions (`_check` = hard, `_check_soft` = soft) | The row's own `message` field; the scene is `templates/godot-metroidvania/scripts/test/RuntimeSmokeTest.gd` |
| Windowed run: **280/280**, 0 soft-fail, 0 fail | The *same* 238-assertion scene, re-run with a real GPU framebuffer instead of headless | Measured directly this session (see "Reproduced" below) |

## Why headless is 238 checks, 194 pass, 44 soft-fail, 0 hard-fail

`godot_runtime` is invoked as `godot --headless --path <project> res://scenes/test/RuntimeSmokeTest.tscn`
during ordinary validation — no GPU, no window. I re-ran that exact command against the fresh
build and counted every line between the scene's own `SMOKE_TEST_RESULTS_BEGIN`/`_END` markers:

```
238 total   194 PASS   44 SOFT_FAIL   0 FAIL
```

**All 44 of the soft failures, with no exceptions, are `gameplay_screenshot_<id>` checks** — the
scene's own screenshot-capture assertions (`_capture_named_screenshot`, `RuntimeSmokeTest.gd:1057`).
On the `headless` `DisplayServer`, `get_viewport().get_texture().get_image()` for these calls comes
back null/blank (there is no real framebuffer to read), so the pixel-diversity check each capture
runs (`_check_soft(..., distinct.size() >= 4)`) cannot pass — not because the underlying feature is
broken, but because the check is asking a windowless process "does this screenshot look varied,"
and there is no screenshot. `_finish()` only counts **hard** (`_check`) failures toward the process
exit code (`RuntimeSmokeTest.gd:2286-2295`); there are zero, so the process exits 0 and this gate is
recorded as `SOFT_FAIL` (a state label, not a blocking failure) — `passed: true` in the report,
non-blocking, and `RUNTIME_VALIDATED` stands. Every other category of check in the scene — autoload
wiring, room loading, save/load, quests, inventory, combat, boss phases, camera bounds, ability
gating, playtest hooks — is unaffected and passes both headless and windowed.

## Why the windowed run has 280 checks, and why it's 280/280

Capture strategy also runs the *same* scene windowed, with a real GPU (`METROFORGE_CAPTURE=1
METROFORGE_CAPTURE_STRATEGY=windowed_gpu`, `--rendering-driver metal`, resolution 1920×1080). I
reproduced that run directly this session and diffed the two result sets by check name:

```
280 total   280 PASS   0 SOFT_FAIL   0 FAIL
```

The extra 42 are **not new features being tested** — they are the `_visible` companion check for
each `gameplay_screenshot_<id>` (`_check_soft("gameplay_screenshot_%s_visible" % shot_id, ...)`,
`RuntimeSmokeTest.gd:1121`), which only gets reached at all once a capture actually returns pixels
worth checking for a minimum color count. Headless never reaches that second assertion for any
shot (there's nothing decodable to check "is it visible enough" on); windowed does, for all of
them. 44 base screenshot checks headless → windowed: SOFT_FAIL → PASS (44). Plus 42 (not 44) new
`_visible` checks appear, because two shot ids are captured twice under the same name
(`slice_boss_combat`, `slice_combat`) and each duplicate's `_visible` check collides on name rather
than being double-counted as new — a pre-existing minor naming overlap in the capture list, not a
defect this session introduced or was asked to fix. 238 + 42 = 280, matching exactly.

## Skipped, unavailable, and failed — named precisely, not summarized away

- **Skipped, this archetype:** `gameplay_screenshot_qa` is `SKIPPED` on **top-down** only
  (`integ-topdown-polish`) — its own windowed capture attempt returns `exitCode 0` but "did not
  write a decodable PNG" (`qa/capture_telemetry.json`, `strategy: "failed"`). This is a pre-existing
  top-down capture-path gap, present before this session's changes too (`GeneratedGames/integ-topdown`
  showed the identical `SKIPPED` message). Not touched or claimed fixed here.
- **Unavailable, both archetypes:** every hosted/local diffusion provider (`qwen-image-edit`,
  `comfyui`, `dreamo`, `diffusers`, `pulid`) reports `UNAVAILABLE` in this environment — no network
  model access, no local GPU diffusion runtime installed. This is an environment fact, not a defect;
  it is why `AssetProduction` scores low in `MODERN_METROIDVANIA_GATE` (below) and why props/
  backgrounds fall back to procedural generation.
- **Failed, real and unhidden:** `MODERN_METROIDVANIA_GATE` genuinely fails at **80/100** for
  side-view as of the current revision (`AssetProduction 63/70`, `RoomComposition 49/70`,
  `ParallaxDepth 60/70` — below the 70 bar; `RoomReadability` now **passes at 100/70**, up from a
  broken `66/70` — see `HUMAN_REVIEW.md` §4, the metric itself was measuring the wrong region of
  every room, not the rooms themselves being bad). This is by design **advisory** — it is pushed
  into `qaReport.results` *after* `qaReport.passed` is already computed (`pipeline.ts`), so it
  never flips `RUNTIME_VALIDATED` to failed, and it is never fed into automated repair. It exists
  specifically so this exact situation — "the game launches and plays cleanly, but is not visually
  production-ready" — has a legible, per-dimension score instead of being invisible behind a green
  runtime gate. **No pass/fail threshold in this gate was loosened at any point this session** —
  every score change documented below and in `HUMAN_REVIEW.md` came from either fixing a metric
  that was measuring the wrong thing, or from the underlying art/composition actually changing.

## Every MMG number that changed this session, and exactly why

| Dimension | Was | Now | Why (not "the bar moved") |
|---|---|---|---|
| AssetProduction | 79/70 (an earlier, inflated pass) | 63/70 | A routing bug (`a4497d38`, prior turn) had a character-sheet worker answering prop/background requests and mislabeling the result `fallbackGenerated: false` (counted as "real" art). Fixed — those assets now correctly count as placeholders, so the honest ratio is lower, not the bar. |
| RoomComposition | 44/70 | 49/70 | `avgDecorationDensity` was a flat, wrong `0` — the metric only read TileMap decor cells, blind to the Sprite2D props/architecture this pipeline actually uses (`HUMAN_REVIEW.md` §3). Fixed to see real decoration; the room's actual (modest) prop count was not changed to produce this number. |
| RoomReadability | 66/70, FAIL | 100/70, PASS | `traversableAreaRatio` measured occupancy against the *whole room rectangle*, including purely decorative sky headroom every Foundry room has by design. Every room was structurally biased toward "too open" regardless of its actual floor-band quality. Fixed to measure the reachable band only (`HUMAN_REVIEW.md` §4) — the `[0.35, 0.85]` band-pass threshold itself is byte-for-byte unchanged. |
| ParallaxDepth | 60/70 | 60/70 (unchanged) | Visual density of mid/near backgrounds was independently improved and verified with real pixel measurements (`HUMAN_REVIEW.md` §6), but this dimension's remaining 40 points require provider-sourced (non-placeholder) art, not denser procedural pixels — stated explicitly so the density fix is never mistaken for score movement it cannot produce. |

See `HUMAN_REVIEW.md`'s "Effective asset sources" and per-item sections for the visual evidence
behind each of these.

## Reproduced (exact commands used for the numbers above)

```
godot --headless --path GeneratedGames/integ-sideview-polish res://scenes/test/RuntimeSmokeTest.tscn
HOME=<isolated> METROFORGE_CAPTURE=1 METROFORGE_CAPTURE_STRATEGY=windowed_gpu \
  godot --path GeneratedGames/integ-sideview-polish --resolution 1920x1080 \
  --rendering-driver metal --audio-driver Dummy \
  res://scenes/test/RuntimeSmokeTest.tscn --quit-after 900
```

`godot_playtest` (`PlaytestRunner.gd`, 8/8 checks: `world_scene_loads`,
`playtest_route_file_present`, `playtest_persona_configured`, `playtest_used_input_simulation`,
`playtest_completed_transitions`, `playtest_reached_victory_flow`,
`playtest_victory_state_or_boss_defeated`, `playtest_telemetry_emitted`) is a separate,
already-passing gate and unaffected by any of the above.
