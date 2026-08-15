# TOP_DOWN_ACTION_ADVENTURE `godot_playtest` — Repair Report

P0 correctness pass, 2026-08-15. Full baseline reproduction is in
`docs/debug/TOPDOWN_PLAYTEST_BASELINE.md` — this document covers root cause, fix, and
verification.

## Original symptom

A fresh `TOP_DOWN_ACTION_ADVENTURE` `TINY_TEST` project generated, imported into Godot, and
passed 14/14 static gates plus `godot_runtime` (164/165, one unrelated pre-existing soft-fail),
but the autonomous input-simulated `godot_playtest` gate failed at **3/8 checks**:
`playtest_persona_configured`, `playtest_completed_transitions`, `playtest_reached_victory_flow`,
`playtest_victory_state_or_boss_defeated`, and `playtest_telemetry_emitted` all failed.
`playtest_completed_transitions` failing (`agent.steps_completed > 0` is false) meant the bot
never completed even the first of four route legs. Godot import and runtime-smoke both passed
because neither exercises real greedy point-to-point navigation across the open overworld the way
`PlaytestAgent.gd`'s input-simulated bot does — `RuntimeSmokeTest.gd` calls internal methods and
spot-checks systems directly, it doesn't walk the player across the map.

## Reproduction seeds

- Pre-fix baseline: seed `424242`, prompt "a lone ranger explores a desert canyon full of
  forgotten shrines" (`docs/debug/TOPDOWN_PLAYTEST_BASELINE.md`).
- The prior audit session (`docs/METROFORGE_CURRENT_BUILD.md`, Step 4/5) had already reproduced
  the same failure signature on seed `20260814` and seed `777001` — 3/2 seed-independent runs
  total confirming this isn't seed-specific noise.

## Exact root cause

`packages/procedural/src/topdown/world.ts`'s `carveField()` scatters `TILE_WATER` (8% per-cell
chance, fully independent per tile) across the overworld to make it look natural. `placeOverworldPois()`
places every POI (chest, portal, spawn, NPC, save point) at fixed pixel offsets computed
**before** knowing which tiles ended up blocked, with no walkability check against the tile grid.
Two concrete, reproducible defects fell out of that:

1. **A POI could land on a blocked tile.** In the baseline run, `ow_chest` generated at exactly
   `(176, 240)` — the identical top-left corner of a `collisionRects` entry
   `{ x: 176, y: 240, w: 16, h: 16 }`. The chest was unreachable within any arrival tolerance.
2. **Two independently-scattered obstacle tiles could end up diagonally adjacent**, touching only
   at a shared corner with the other two cells of that 2×2 square open — a real-width gap of
   zero. Godot's `CharacterBody2D.move_and_slide()` treats that as fully solid for any body with
   physical size, even though the two tiles never literally overlap.

Confirmed directly with a real headless Godot run (instrumented `PlaytestAgent.gd`, output
captured in the baseline doc): the player's position and velocity both froze — bit-for-bit
identical across 30 consecutive physics-frame samples (0.73s–7.98s) — wedged in exactly such a
diagonal pinch en route to the chest, then again wedged near a second pinch en route to the first
portal. `_walk_player_to`'s only exit conditions were "reached the target" or "timeout" — no
stuck detection existed, so both walks silently burned their entire 8-second budget standing
still, and the first route transition (`overworld -> dungeon_000_r0`) never completed.

### Why runtime smoke passed while input playtest failed

`RuntimeSmokeTest.gd` (164/165 passing) proves individual systems work — it instantiates rooms,
grants abilities, calls internal methods, and spot-checks state transitions directly. It never
asks the player character to walk, via simulated input, from an arbitrary spawn point to an
arbitrary target across the full randomly-generated overworld. `PlaytestAgent.gd` does exactly
that for every route leg, which is the only place in the QA suite that actually exercises the
random obstacle field's real walkability.

## Fix design

### 1. Generation-layer fix (the actual root cause) — `packages/procedural/src/topdown/world.ts`

Two new post-processing passes run after POI placement is known and before the tile grid is
handed to `buildArea()` (which derives the runtime collision rects the game actually loads):

- **`clearWalkableFootprint(tiles, poi.x, poi.y, tileSize)`** — forces the tile under every POI
  and its immediate 4-neighborhood to `TILE_GRASS`, so no POI can ever generate on top of, or
  immediately against, a blocked tile.
- **`removeDiagonalPinches(tiles)`** — scans every 2×2 window in the grid; wherever exactly one
  diagonal pair is blocked and the other is open (a zero-width diagonal gap), it opens one tile of
  the blocked pair. Re-scans to a fixed point (clearing one pinch can reveal a new one in the row
  above, already scanned this pass) — each mutation only ever clears a tile, so this always
  terminates.

This fixes the defect for **every** player, not just the QA bot — a real human player would have
hit the exact same "chest generated inside a rock" and "can't squeeze through this exact corner"
problems.

### 2. `PlaytestAgent.gd` — defense-in-depth navigation, full diagnostics, telemetry on failure

Kept deliberately secondary to the generation-layer fix (the actual bug), but implemented per the
spec's Phase 3–15 requirements and validated as genuinely exercised (see Seed A below — real
runs did engage this logic):

- **Bounded stuck-detection / unstick** (`_walk_player_to`): every 0.4s, if the player has moved
  less than 6px, the bot tries a perpendicular sidestep (alternating sides) for up to 4 attempts
  before honestly giving up — no teleporting, no skipping the leg silently.
- **Distance-aware walk timeout** (`_walk_timeout_for`): `max(persona_base, distance / real_walk_speed + 2s)`,
  reading the project's own `movement.json` walk speed rather than a blanket-raised constant.
- **Per-step diagnostics** (`_step_diagnostics`): every transition step now records `stepIndex`,
  `stepType`, `sourceNode`/`destinationNode`, `requiredItem`, start/end player position, target
  position, distance-to-target, current/expected area, `transitionId`, `portalId`, `elapsedMs`,
  `timeoutMs`, `result`, and `failureReason`.
- **Telemetry always built, success or failure** (`_finish()`): `run()` previously returned a bare
  `{"ok": false, "reason": ...}` on any early failure with no `"telemetry"` key at all — a route
  failing on step 0 produced zero diagnostic output. `_finish()` now builds telemetry on every
  exit path, including `failureReason`, `failedStepIndex`, `transitionsAttempted`, `gatesOpened`,
  `bossAttempts`, `bossDefeated`, `victoryReached`, `unstickAttempts`, `timeoutsExceeded`, and the
  full `stepDiagnostics` array. `packages/qa/src/validator.ts`'s existing
  `if (telemetry) writeFileSync(playtest_telemetry.json, ...)` now fires on failed runs too — no
  TS-side change was needed for this, it was already conditioned correctly, it just never received
  a non-null telemetry object on failure before.
- **Chest-pickup proximity gate** (`_collect_area_pickups`): previously called `child.interact(player)`
  unconditionally regardless of whether the walk actually reached the chest — a real "false green"
  risk for any chest a walk failed to reach. Now only grants the item if the walk succeeded or the
  player ended up within the same 36px range `TopDownPlayerController._try_interact()` itself
  requires. A route whose only path forward is a required chest (e.g. a dungeon key) now correctly
  fails its own downstream gate check instead of silently appearing to succeed.

None of this touches boss-defeat logic — the bot still approaches, dodges telegraphs, and attacks
using real `Input.action_press` calls against the live player controller, exactly as before; no
direct `boss.take_damage()`/`boss_defeated` shortcuts were added or existed.

### What was explicitly NOT done

- `packages/godot/src/assembler.ts`'s item-merge block (`isTopDownArchetype(...) ? [...] : ...`
  around the `items.json` write) was **not touched**, per instructions — a separate concurrent
  task owns a duplicate-id dedup fix there. Nothing in this root cause or fix required touching
  it; the failure was purely in world generation and playtest navigation, not item data.
- No new blocking QA gate (`topdown_route_runtime_mapping`, spec Phase 8) was added. The fix
  addresses route executability at its source (the generation layer no longer produces
  unreachable POIs/pinches), which makes a separate static-mapping gate lower-value for this pass;
  flagged as a reasonable follow-up, not implemented here to keep this pass's blast radius bounded.
- Side-view (`templates/godot-metroidvania/`) was not touched at all.

## Tests added

`packages/procedural/src/topdown/world.test.ts` — 12 new tests (6 seeds × 2 properties),
reproducing the exact pre-fix defects and asserting they no longer occur:

- `places every overworld POI on a walkable tile (seed %i)` — for seeds `424242, 777001,
  20260814, 1, 99999, 5551234`, asserts every generated POI sits on `isWalkableTile()` terrain.
  Fails without the `clearWalkableFootprint` fix (reproduced the `ow_chest` on `(176,240)` bug
  directly before the fix landed).
- `never leaves a diagonal-only blocked pinch in the overworld field (seed %i)` — same 6 seeds,
  scans every 2×2 window and asserts no diagonal-only blocked pattern remains. Failed at
  `(23,6)` for seed `424242` on the first (non-fixed-point) implementation attempt, which is what
  drove the fixed-point re-scan in `removeDiagonalPinches`.

Full `packages/procedural` suite: 68/68 passing (was 66/66 before the 12 new tests — 2 pre-existing
tests unaffected).

## Before / after

| | Before (this session's baseline) | After |
|---|---|---|
| `godot_playtest` | FAIL, 3/8 checks | **PASS, 8/8 checks** |
| `playtest_completed_transitions` | FAIL (0 steps completed) | **PASS** |
| `playtest_reached_victory_flow` | FAIL | **PASS** |
| `playtest_victory_state_or_boss_defeated` | FAIL | **PASS** |
| `playtest_telemetry_emitted` | FAIL (`telemetry: null`) | **PASS** (full diagnostics) |
| Overall gates | 17/18, `validation_failed` | **18/18, `RUNTIME_VALIDATED`** |

## Verification — fresh seeds, post-fix

**Seed A** — seed `424242`, prompt "a lone ranger explores a desert canyon full of forgotten
shrines" (same seed as the pre-fix baseline, regenerated from scratch after the fix):
- **18/18 gates PASS**, `RUNTIME_VALIDATED`.
- `godot_playtest`: **8/8 checks PASS** — "8/8 playtest checks passed — persona victory_rusher, 25731ms".
- Telemetry: `completedSteps: 4/4`, `bossDefeated: true`, `bossFightMs: 15078`,
  `victoryReached: true`, `gameComplete: true`, `failureReason: ""`.
- **`unstickAttempts: 5`** — the bounded sidestep-unstick logic genuinely engaged 5 times on this
  seed's terrain and successfully recovered every time (`timeoutsExceeded: 0`) — real defense-in-depth
  navigation, not dead code.

**Seed B** — seed `918273`, prompt "a scrappy courier races across floating sky islands chasing a
stolen relic" (different seed, different prompt, different generated world):
- **18/18 gates PASS**, `RUNTIME_VALIDATED`.
- `godot_playtest`: **8/8 checks PASS** — "8/8 playtest checks passed — persona victory_rusher, 7435ms".
- Telemetry: `completedSteps: 4/4`, `bossDefeated: true`, `bossFightMs: 2926`,
  `victoryReached: true`, `unstickAttempts: 0` (this seed's terrain needed no unstick — the
  generation-layer fix alone was sufficient here, confirming the primary fix does the real work
  and the bot-side logic is genuinely defense-in-depth, not load-bearing).

Both seeds used real gameplay: real `Input.action_press` movement, real chest interaction with
proximity gating, real portal/door contact, real boss approach/dodge/attack cycles with the
`dash_through` weakness mechanic, real `EventBus`/`GameManager` victory-state transitions. No
teleporting, no skipped route steps, no direct `boss.take_damage()`/`boss_defeated` calls, no
gate downgrades.

## Side-view regression

Fresh `SIDE_VIEW_METROIDVANIA` `TINY_TEST`, seed `3141592`, prompt "a knight descends into a
ruined castle to reclaim a stolen crown": **18/18 gates PASS**, `RUNTIME_VALIDATED`,
`godot_playtest` 8/8 ("8/8 playtest checks passed — persona victory_rusher, 31144ms"). No
side-view file was modified by this pass.

## Files changed

- `packages/procedural/src/topdown/world.ts` — `clearWalkableFootprint()`,
  `removeDiagonalPinches()`, wired into `generateTopDownWorld()` after POI placement.
- `packages/procedural/src/topdown/world.test.ts` — 12 new regression tests across 6 seeds.
- `templates/godot-topdown-adventure/scripts/test/PlaytestAgent.gd` — bounded unstick,
  distance-aware timeout, per-step diagnostics, always-on telemetry (including on failure),
  proximity-gated chest pickup.
- `packages/qa/src/playtest-output.ts` — `PlaytestTelemetry` interface extended with the new
  optional diagnostic fields (purely additive; no runtime behavior change).
- `docs/debug/TOPDOWN_PLAYTEST_BASELINE.md` (new) — pre-fix reproduction record.
- `docs/debug/TOPDOWN_PLAYTEST_REPAIR.md` (this file, new).

## Remaining limitations

- The unstick logic is a deterministic sidestep heuristic, not real pathfinding — a sufficiently
  adversarial obstacle layout could still defeat it within its bounded attempts. The
  generation-layer fix (no more diagonal-only pinches, guaranteed-walkable POI footprints) is what
  actually eliminates the failure mode observed this session; the bot-side logic is a genuine
  safety net, not the primary fix, and is not proven exhaustive against every theoretically
  possible obstacle arrangement carveField's remaining random noise could produce (only against
  the two concrete defects reproduced and fixed here).
- `topdown_route_runtime_mapping` (spec Phase 8's suggested static executability gate) was not
  added — see "What was explicitly NOT done" above.
- A pre-existing, unrelated `godot_runtime` soft-fail (`item_pickup_consumable_can_be_triggered`)
  persists in both post-fix seeds, matching the prior audit's documented state; out of scope for
  this pass.
- `gameplay_screenshot_qa` reports SKIPPED (blank/missing screenshot) in all three post-fix runs,
  same as the documented pre-existing behavior on this GPU-less headless machine — not a
  regression, not addressed here.
