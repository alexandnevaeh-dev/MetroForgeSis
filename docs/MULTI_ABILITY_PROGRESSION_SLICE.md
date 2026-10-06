# Multi-Ability Progression Slice

## Abilities
- Ability A: `ground_slam`
- Ability B: `phase`

## Route
`room_000 -> room_001 -> room_002 -> room_003 -> room_004 -> room_005 -> room_006 -> room_007`

## Pickups And Gates
- `room_002`: Dash pickup; `room_002 -> room_003` requires `dash`.
- `room_004`: Ground Slam pickup and safe weak-floor teaching gate; `room_004 -> room_005` is a down transition requiring `ground_slam`.
- `room_006`: Phase pickup and combined gate; `room_006 -> room_007` is a phase-barrier transition requiring `phase` and `ground_slam`.
- `room_007`: endpoint and `boss_final` encounter.

## Runtime Result
Run ID: `multi_ability_full_20260901_163000`.

The input-simulated route completed all 7 planned transitions, collected `dash`, `ground_slam`, and `phase`, passed the dash gate, physically broke the ground-slam WeakFloor through normal input, crossed the physical phase barrier through a release-to-press dash input, passed the combined transition, and defeated `boss_final`.

Persisted telemetry: `user://multi_ability_progression_telemetry.json`.

## Save Behavior
The production autosave written by ability acquisition contains `dash`, `ground_slam`, and `phase`, with `room_007` as the saved room. Manual reload confirmation remains required because the headless save-reload probe produced no readable marker despite exiting successfully.

## Known Limitations
- The route uses the existing generic pickup, gate, room, combat, and save systems; it is a compact proof slice, not a full all-ability campaign.
- No checkpoint occurs after the combined gate in this eight-room fixture, so checkpoint activation is not asserted by its route telemetry.
- Manual gameplay review is still required for player-facing readability and feel.