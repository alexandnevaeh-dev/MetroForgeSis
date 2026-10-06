# TOP_DOWN_ACTION_ADVENTURE `godot_playtest` — Pre-Fix Baseline Reproduction

Captured 2026-08-15, before any code changes, per the P0 repair-pass Phase 1 requirement
("reproduce before changing code"). This session's own fresh run — not a re-read of the prior
audit.

## Generation command

```
node apps/cli/dist/index.js create \
  --prompt "a lone ranger explores a desert canyon full of forgotten shrines" \
  --profile TINY_TEST --mode LOCAL_ONLY --seed 424242 \
  --archetype TOP_DOWN_ACTION_ADVENTURE
```

- Seed: `424242`
- Project slug: `a-lone-ranger-explores-a-desert-canyon-full-of-forgotten-shr`
- Output: `GeneratedGames/a-lone-ranger-explores-a-desert-canyon-full-of-forgotten-shr`
- Result: `validation_failed`, 17/18 gates, `automated_repair: FAILED (#1 [godot_playtest] -> still failing)`

## Gate-by-gate result (`validation_report.json`)

All 14 static gates + `godot_imports` PASS. `godot_runtime`: **SOFT_FAIL, 164/165** (one
pre-existing, unrelated soft-fail: `item_pickup_consumable_can_be_triggered`). `godot_playtest`:
**FAIL, 3/8 checks**.

```json
{
  "gate": "godot_playtest",
  "passed": false,
  "state": "FAIL",
  "message": "3/8 playtest checks passed (failed: playtest_persona_configured, playtest_completed_transitions, playtest_reached_victory_flow, playtest_victory_state_or_boss_defeated, playtest_telemetry_emitted)",
  "details": {
    "checks": [
      { "status": "PASS", "name": "world_scene_loads" },
      { "status": "PASS", "name": "playtest_route_file_present" },
      { "status": "FAIL", "name": "playtest_persona_configured" },
      { "status": "PASS", "name": "playtest_used_input_simulation" },
      { "status": "FAIL", "name": "playtest_completed_transitions" },
      { "status": "FAIL", "name": "playtest_reached_victory_flow" },
      { "status": "FAIL", "name": "playtest_victory_state_or_boss_defeated" },
      { "status": "FAIL", "name": "playtest_telemetry_emitted" }
    ],
    "telemetry": null
  }
}
```

`playtest_completed_transitions` failing (`agent.steps_completed > 0` is false) proves the bot
never completed even the *first* route step — this matches the prior audit's narrowing to an
early `_execute_transition` failure. `telemetry: null` confirms `PlaytestAgent.run()` only builds
telemetry inside its final success path, so a failure this early produces no diagnostic output at
all (the Phase 4 problem this pass is required to fix).

## Route being attempted (`playtest_route.json`)

```json
{
  "startRoomId": "overworld",
  "victoryRoomId": "dungeon_000_r3",
  "victoryBossId": "boss_final",
  "transitions": [
    { "fromRoomId": "overworld", "toRoomId": "dungeon_000_r0", "requirements": [] },
    { "fromRoomId": "dungeon_000_r0", "toRoomId": "dungeon_000_r1", "requirements": [] },
    { "fromRoomId": "dungeon_000_r1", "toRoomId": "dungeon_000_r2", "requirements": [] },
    { "fromRoomId": "dungeon_000_r2", "toRoomId": "dungeon_000_r3", "requirements": [] }
  ],
  "persona": { "id": "victory_rusher", "walkTimeoutSec": 8, "bossAttackTimeoutSec": 12 }
}
```

First failing step: **`overworld -> dungeon_000_r0`** (the very first transition).

## Instrumented reproduction (direct Godot invocation)

To pin down exactly where the first transition dies, temporary debug `print()` statements were
added to a scratch copy of `PlaytestAgent.gd` inside the generated project (never committed to
the template) and run directly:

```
Godot_v4.7.1-stable_win64.exe --headless --path <project> res://scenes/test/PlaytestRunner.tscn --quit-after 12000
```

Relevant captured output:

```
DBG _execute_transition from=overworld to=dungeon_000_r0 current=overworld
DBG player start pos=(256.0, 192.0)
DBG walk_to target=(176.0, 240.0) start=(256.0, 192.0) timeout=8.0
DBG   t=0.23 pos=(242.2, 199.9) vel=(-77.8, 77.8) dist=77.4
DBG   t=0.48 pos=(219.7, 211.6) vel=(-77.8, 77.8) dist=52.2
DBG   t=0.73 pos=(216.1, 232.0) vel=(-77.8, 77.8) dist=40.9
DBG   t=0.98 .. t=7.98  pos=(216.1, 232.0) vel=(-77.8, 77.8) dist=40.9   <- frozen, 30 consecutive samples
DBG walk_to TIMEOUT end=(216.1, 232.0) dist=40.9
DBG after pickups player pos=(216.0, 231.9) current=overworld
DBG portal found at=(196.0, 114.0) target_area_id=dungeon_000_r0
DBG walk_to target=(196.0, 114.0) start=(216.0, 231.9) timeout=8.0
DBG   t=0.23 pos=(216.1, 218.8) vel=(-77.8, -77.8) dist=106.7
DBG   t=0.48 pos=(210.9, 193.8) vel=(-77.8, -77.8) dist=81.2
DBG   t=0.73 pos=(191.8, 184.0) vel=(-2.3, -93.2)  dist=70.1
DBG   t=0.98 .. t=7.98  pos=(193.4, 184.0) vel=(0.0, -110.0) dist=70.1   <- frozen again, 29 consecutive samples
DBG walk_to TIMEOUT end=(193.4, 184.0) dist=70.1
DBG walk_to_portal result=false player_pos=(193.4, 184.0) current=overworld
DBG _execute_transition final result=false current=overworld
```

- Player position: **frozen** at `(216.07, 231.99)` from t=0.73s through t=7.98s (30 identical
  samples), then again frozen at `(193.39, 184.00)` from t=0.98s through t=7.98s of the *second*
  sub-walk, in both cases with a **constant, non-decaying, non-zero `velocity`** — i.e.
  `move_and_slide()` is being fully blocked (zero net displacement) every single physics frame,
  not merely slowed.
- Expected destination (chest pickup): `(176.0, 240.0)` — never reached (stopped 40.9px short).
- Expected destination (portal): `(196.0, 114.0)` — never reached (stopped 70.1px short).
- Transition id: `overworld -> dungeon_000_r0` (route index 0).
- Portal involved: `ow_dungeon_0` (`AreaPortal`, `target_area_id = "dungeon_000_r0"`), correctly
  found by `_find_portal` — the portal lookup itself is not the problem.
- World/inventory state at failure: `GameManager.current_room_id` remains `"overworld"` the
  entire time; no item has been collected (the chest was never reached either).

## Root-cause data point

Cross-referencing the generated project's own `data/world/overworld.json`, the chest POI
`ow_chest` sits at **exactly** `(176, 240)` — the identical top-left corner of one of
`overworld`'s randomly-generated `collisionRects` (`{ "x": 176, "y": 240, "w": 16, "h": 16 }`),
i.e. the pickup itself was generated on top of solid terrain. The freeze point `(216.07,
231.99)` sits in a diagonal gap between two *other* randomly-scattered single-tile obstacles
(`{224,240}` and `{192,208}`, touching only at a shared corner) — a classic zero-width diagonal
pinch that a 16×16 physical body cannot pass through even though the two tiles don't literally
overlap.

Full root-cause narrative and fix are in `docs/debug/TOPDOWN_PLAYTEST_REPAIR.md`.
