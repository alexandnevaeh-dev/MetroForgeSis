# Claude Workstream Status

Backend/generation/runtime/QA workstream status, maintained by the Claude agent working `feature/claude-generation-runtime`. Companion to `docs/PARALLEL_CHANGELOG.md` (append-only log), `docs/CURSOR_WORKSTREAM_STATUS.md` and `docs/CURSOR_BACKEND_REQUIREMENTS.md` (the other agent's own status/asks).

Last updated: 2026-08-14.

## How this session started

Repo state at session start was far ahead of this session's own prior context: another agent had already implemented most of a large prior backlog (ability framework with 9 real modular abilities, playtest personas + telemetry, quests, dialogue, shops, inventory, minimap, movement-feasibility QA, atomic multi-slot saves, COMMERCIAL_SAFE mode routing, database persistence for artifacts/validation results) and was — verified live, mid-session, via files changing between successive `Read` calls — actively scaffolding a second game archetype (`TOP_DOWN_ACTION_ADVENTURE`) in the same working tree. That agent has since moved to a real isolated worktree (`../Forged-cursor-desktop`, branch `feature/cursor-desktop-studio`) and left a concrete backend-requirements handoff in `docs/CURSOR_BACKEND_REQUIREMENTS.md`, which this session implemented in full.

## Completed (this session, verified)

### Pass 1 — generation-mode routing + health-aware ranking
- Generation-mode expansion (`NVIDIA_ONLY`, `COMMERCIAL_SAFE`, `OFFLINE`, `FASTEST`, `HIGHEST_QUALITY`, `LOW_VRAM`, `BALANCED`) — `RoutingContext`/`ModelMetadata`/`AIProvider` extended, `CapabilityRouter` filters wired, `LicenseRouter` broadened to a reusable structural type (`LicenseSubject`). Converged with the other agent's independent `mode-routing.ts`/`catalog-reconciliation.ts` factoring — no lasting conflict.
- Health-aware candidate ranking in `CapabilityRouter.getCandidates()` (healthy > degraded > unavailable, priority as tiebreaker, nothing ever hard-excluded) — closes the one real gap an Explore-agent audit found in `ProviderHealthMonitor` (it existed and was used for dashboards, but nothing fed live provider health into routing decisions).
- Fixed a real, concurrent-edit-caused build/test break across `packages/procedural/src/topdown/world.ts` + its test file (stale `dungeonItem` reference after a param rename, missing `optional` field on 4 literal edges, test file's relative imports not updated after it moved into `src/topdown/`) — mechanical, not new functionality.

### Pass 2 — Cursor backend requirements (`docs/CURSOR_BACKEND_REQUIREMENTS.md`, all 7 items)
1. `generateGame` archetype — typed end-to-end (preload → handler → `GenerationPipeline.run()`, which already consumed it); previously worked by accident (untyped passthrough), now real.
2. `explainModelRouting(capability)` — new `packages/ai/src/model-catalog.ts` export, real per-model accept/reject trace (license via `LicenseRouter`, provider-enabled, RAM/VRAM fit), reusing `rankModelsForCapability`'s scoring rather than duplicating it.
3. `getOverworldMap(projectPath)` — reads `data/world/overworld.json` (written by `assembler.ts`'s `writeTopDownWorld()`), returns region/node/edge spatial payload.
4. `getDungeonGraph(projectPath, dungeonId?)` — real room-kind/keys/doors/criticalPath derivation from `overworld.json` POI data.
5. `getRoomCollision(projectPath, roomId)` — real per-area `collisionRects`.
6. `categorizeAssetPath` in `handlers.ts` realigned to the exact same taxonomy as the renderer's own copy (`apps/desktop/src/studio/types.ts`), so the two never disagree.
7. `modelId` threaded through `GeneratedAsset` → `ArtifactGeneratedEvent` → `db.artifacts.create()` → `AssetManifestEntry`/`generation_manifest.json` → `list-assets`. Only set where a real image-generation provider result exists — `undefined` for procedural/checkpoint assets, not fabricated.

All 3 new spatial/routing APIs were verified against a real `TOP_DOWN_ACTION_ADVENTURE` TINY_TEST generation's actual `overworld.json` output, not just typechecked.

## Verified already complete by the other agent (source-checked, not just doc claims)

An Explore-agent audit against actual source + tests (not `docs/CURSOR_HANDOFF_AUDIT.md`'s own claims) confirmed these are genuinely done, with file:line evidence:

- AbilityCatalog/AbilityController architecture, dash migrated, all 5 core movement abilities (double jump, wall slide, wall jump, air dash, ground slam) real and modular.
- Gate-to-ability validation (`registered_abilities_valid` QA gate) and `MovementFeasibilityValidator` (real jump/dash-reach math, wired as a static QA gate).
- GameDNA movement runtime sync (`data/player/movement.json` written at assembly time, read by `PlayerMovementConfig.gd`).
- Room archetype persistence (13 distinct archetypes assigned and preserved, `room_archetype_fidelity` QA gate).
- Atomic save (temp-file + rename), save migrations, real 3-slot multi-slot save/load.
- Dead-code cleanup: `AbilityGate.gd/.tscn`, `AssetSprite.gd` fully removed; `GodotProjectAssembler.validate()` doesn't exist (never re-added).
- Database persistence: `artifacts` and `validation_results` repositories are called from the real `GenerationPipeline`, not just unit-tested in isolation.

### Pass 3 — top-down Godot runtime: 0/0 (or crashing) → 13/13 smoke-test checks passing

Full root-cause diagnosis (not a template swap) — see `docs/PARALLEL_CHANGELOG.md`'s matching entry
for the complete list. Summary: fixed a progression-graph node-type bug that made the abstract
ability chain permanently unsolvable; scaled `generateTopDownWorld()` to real profile-scaled,
item-gated multi-dungeon generation; made the QA repair engine's template-restore logic
archetype-aware (it was silently reintroducing deleted side-view files into top-down projects);
fixed `room_archetype_fidelity`/`registered_abilities_valid`/`required_files`/
`required_scenes_exist` to actually understand the top-down archetype; deleted 10 dead side-view
leftover files plus one dead duplicate world-manager script; fixed 6 distinct real GDScript bugs
(wrong node name, illegal `const` expression, wrong return type assumption, missing `class_name`,
two `:=` type-inference failures) that only running the actual Godot binary surfaced; fixed a
PASS/FAIL output-format mismatch between the top-down smoke test and its TS parser that silently
discarded every result even on a fully passing run.

Verified live against real Godot 4.7.1: `godot_runtime` gate now 13/13 PASS.

### Pass 4 — top-down `godot_playtest`: 2/8 → 8/8, via 6 distinct real runtime bugs

Adapted `PlaytestAgent.gd`/`PlaytestRunner.gd` for top-down (Pass 3 left this explicitly out of
scope) and then chased the boss fight through five rounds of live-Godot diagnosis before it
actually completed. Each failure looked like the previous "fix" being wrong; each was really a
different bug on the same critical path:

1. **Boss-arena exit lock, and its own reentrancy bug.** Added exit-sealing while a boss is alive
   (classic pattern: don't let the fight be walked away from) to `OverworldManager._spawn_pois()` —
   `AreaPortal`/`LockedDoor` instances set `monitoring = true` in their own deferred `_ready()`,
   which runs *after* the spawn call that tried to lock them, so the lock has to wait a
   `process_frame` first. The auto-reopen-on-death handler then hit a second bug: it wrote
   `monitoring`/`monitorable` directly from inside the boss's own `died` signal — which fires from
   inside an `Area2D` in/out signal callback, where Godot rejects that write outright
   ("blocked during in/out signal") — fixed via `set_deferred()`.
2. **False-positive win detection.** The fight loop treated "boss node reference went invalid" as
   the win condition (true when `HealthComponent` frees the boss on a real kill) — but a *player*
   death also frees the boss, because `GameManager`'s respawn-at-checkpoint flow calls
   `load_area()`, which `queue_free()`s every child of the current room, boss included. A player
   death was being scored as a boss kill. Fixed by checking player-death first.
3. **The real boss AI was dead code.** `Boss.tscn` was wired to `TopDownEnemyController.gd` (a
   generic enemy script, no telegraph, 1.1s untelegraphed attack cooldown) while
   `BossController.gd` — the actual phase/telegraph/weakness-data-driven boss script this session's
   earlier work (`bosses.json` phases, `WEAKNESS_DAMAGE_MULTIPLIER`) was built for — was never
   referenced by any scene. Rewired `Boss.tscn` to it, and completed `BossController.gd` itself:
   it had no chase movement at all (never called `move_and_slide()`) and applied side-view-style
   gravity in a floating top-down scene. Added real chase-when-not-telegraphing movement.
4. **Dodge granularity.** Even with a real telegraph, the playtest bot only checked
   `boss._telegraph_active` once per multi-frame approach/attack action — by the time it noticed,
   the swing had often already landed. Extracted `_step_toward()` from `_walk_player_to()` so the
   boss-fight loop could poll every physics frame and react within the ~0.6-0.8s telegraph window
   instead of after it.
5. **`dash_through` weakness was unreachable.** `BossController._on_hit_received()` already checked
   `player.get("_is_dashing") == true` for double damage (`bosses.json` lists it on this boss), but
   `TopDownPlayerController.gd` never defined `_is_dashing` — `get()` on a nonexistent property is
   `null`, so the multiplier could never fire. Added the property (mirrors the existing "dash" =
   sprint-speed input) and had the playtest bot hold dash through its swings, the same strategy a
   real player reading the boss's own weakness data would use.
6. **Residual chip damage.** The route only visits pickups on each leg's *origin* room — never the
   boss room itself, since nothing transitions *from* it — so the bot could reach the fight already
   damaged from incidental enemy contact earlier in the dungeon. `reset_health()` before the boss
   fight starts, so this gate proves "is the boss beatable," not "did the bot arrive undamaged."

Verified live against real Godot 4.7.1 across ~10 iterative runs (`--headless … PlaytestRunner.tscn
--quit-after 12000`), then confirmed via a completely clean `metroforge create` regeneration with
no manual file syncing: `final_qa: PASSED (RUNTIME_VALIDATED: 18/18 gates passed)`. Full monorepo
`pnpm test` (387 tests) still green afterward.

### Pass 5 — side-view `godot_playtest`: turned out to be 0/8 in practice too, now 8/8

Went looking for the smaller "victory-path runtime assertion" gap in `RuntimeSmokeTest.gd` (its
boss-victory check uses a direct `take_damage(max_health)` call, not simulated input) and found
something much bigger on the way: side-view's own `godot_playtest` gate — the "mature",
supposedly-already-working archetype — had never actually been runtime-verified either. A fresh
TINY_TEST generation scored 4/8 on the same gate top-down started at, then a chain of *nine*
further real bugs before it actually passed. None of this was introduced this session; all of it
predates it and had simply never been exercised against the real engine before.

1. **`WorldMapPanel.gd`/`PauseMenu.gd`/`MinimapPanel.gd` — the exact type-inference and missing-
   `class_name` bugs already fixed for top-down, unfixed here.** `var known := room_id in discovered
   or room_id == current` and `var label := room_id.replace(...)` both fail static type inference
   the same way top-down's copies did; `MinimapPanel.gd extends WorldMapPanel` with no
   `class_name WorldMapPanel` declared anywhere. This alone crashed the map/inventory/quest panels
   and cascaded into `world_map_view_present`, `inventory_view_present`,
   `final_boss_defeat_emits_game_completed`, and 6 more unrelated-looking check failures — a single
   root cause masquerading as nine.
2. **Three `queue_redraw()` calls in `PauseMenu.gd` (map/inventory/quest) pointed at a stale scene
   path** — `$Panel/MapPanel/WorldMapView` etc., missing a `/VBox` segment the actual `.tscn` has
   (and every *other* reference to these panels already included). A scene restructuring that
   never finished propagating to the script. Same missing segment duplicated into
   `RuntimeSmokeTest.gd`'s own `world_map_view_present`/`inventory_view_present` checks.
3. **`_check_npc_interaction` drove an orphan `DialogueOverlay`.** `NPC._dialogue_overlay()` looks
   up the "dialogue_overlay" group tree-wide — `World.tscn` already instances one there — but the
   test instantiated a *second*, disconnected copy and asserted against that one, which
   `_begin_dialogue()` never touched. Read the real instance from the group instead.
4. **A real GDScript closure bug in `_check_boss_victory_flow`.** `var completed := false;
   EventBus.game_completed.connect(func(): completed = true)` — GDScript lambdas capture outer
   locals *by value*, not by reference, so the assignment only ever mutated the closure's own
   snapshot. Confirmed live: the lambda printed `completed=true` from inside itself while the
   very next line outside it read `false`. Fixed with the standard single-element-array
   capture-by-reference workaround.
5. **`_free_new_children()`'s `queue_free()` calls were never awaited**, so accumulated pending
   frees from earlier assertions in the same test function could resolve on whatever frame a
   *later*, unrelated `get_child_count() == before + N` check happened to await next, throwing off
   an exact-count assertion that had nothing to do with the original frees. Made the helper await
   a settling frame itself and updated all 7 call sites.
6. **The v1→v2 save-migration test wrote its legacy fixture to the same slot a check one line
   above had just written a real save to.** `reset_save()` only clears in-memory state, not the
   on-disk file — `load_game()` found and loaded the real save first, never touching the v1
   fixture the test existed to exercise. Delete the slot's file before writing the fixture.
7. **The exact top-down boss-arena-exit-lock class of bug, in the older `WorldManager`/
   `RoomTransition` system.** Ported the same fix: lock a boss room's `RoomTransition` triggers
   while its boss is alive, re-enable on death — plus closing a race the top-down version didn't
   have to deal with, since `WorldManager` here rebuilds the *entire room* (not just re-opens
   doors) on every transition: `_load_room` now applies the lock *before* announcing the room
   loaded via `current_room_id`/`room_entered`, so nothing reacting to those two signals can start
   fighting before the lock is actually in place.
8. **The same "fake elapsed time" bug top-down had, in the older `PlaytestAgent.gd`**, plus the
   same "player death frees the room, indistinguishable from a real boss kill" bug — fixed the
   same way (`Time.get_ticks_msec()`, `reset_health()` before the fight, `is_instance_valid()`
   guards throughout, real time floor instead of giving up after one missed approach).
9. **The real reason this fight only ever landed exactly one hit regardless of how long it ran.**
   `_defeat_final_boss` poked `player_attack.activate()`/`.deactivate()` directly instead of
   calling the player's own `_perform_attack()` — which is what actually positions the hitbox via
   `attack_hitbox.position.x = 30 * facing` before activating it. Poking it directly left the
   hitbox wherever it was last positioned. Fixed to call `_perform_attack()`/`_on_attack_finished()`
   for real, and set `facing` explicitly first (`PlayerController` only updates it while movement
   input is actively pressed — the walk-to-target loop stops pressing input once already close,
   so `facing` goes stale). That still wasn't enough on its own: `AttackHitbox`'s own
   `CollisionShape2D` carries a *further* fixed local offset of `(30, -20)` beyond the Area2D's
   own `30 * facing` position, so the swing's real reach is centered ~60px out from the player,
   not adjacent to them — while the bot's approach walked the player's *center* to within 12px of
   the boss's, i.e. well past that reach on the near side. A real player naturally stops at melee
   range; the bot was walking into the boss instead. Retargeted the approach at a real
   melee-range standoff (`boss.position - 60px` in the approach direction) instead of the boss's
   center. Boss health dropped 200→0 in exactly 20 landed hits afterward, once every attack
   actually connects.

Verified live against real Godot 4.7.1 across ~10 iterative runs, then confirmed via a completely
clean `metroforge create` regeneration with no manual file syncing:
`final_qa: PASSED (RUNTIME_VALIDATED: 18/18 gates passed)`. Full monorepo `pnpm test` (387 tests)
still green afterward (one unrelated flaky timeout on a pre-existing NVIDIA catalog test,
confirmed to pass cleanly at 359ms in isolation — resource contention from the concurrent Godot
runs, not a real regression).

## Partial — real, open gaps

- A mini-boss concept doesn't exist in the top-down generator yet (`getDungeonGraph.miniBossId` is
  always `undefined`) — add one if the dungeon design calls for it.

## Next (recommended, not started by me)

1. A mini-boss concept doesn't exist in the top-down generator yet — add one if wanted.
2. `TOP_DOWN_PROFILE_DEFAULTS.townCount` places NPC/save clusters on the overworld but no
   distinct "town" scene/area concept exists — currently honest (no fake town), but a real one
   would need its own area kind.
3. `apps/desktop` renderer `vite build` currently fails (`packages/shared/dist/config.js` pulls
   `node:path`/`node:url` into the browser bundle — pre-existing, not touched this session; `tsc`
   and the electron-main bundle both succeed, only the Vite renderer step fails).

## New contracts / APIs

- **New IPC handlers + preload bridges:** `explainModelRouting`, `getOverworldMap`, `getDungeonGraph`, `getRoomCollision` (see `docs/PARALLEL_CHANGELOG.md` for exact shapes).
- **`generateGame` / `generate-game` IPC:** `archetype?: string` now typed end-to-end.
- `RoutingContext` gained `nvidiaOnly?`, `offline?`, `commercialSafeOnly?`, `maxVramMb?` (additive).
- `ModelMetadata`/`AIProvider` gained `commercialUse?`, `estimatedSpeed?`, `estimatedQuality?`, `minVramMb?` (additive).
- `LicenseRouter` methods now accept the exported `LicenseSubject` structural type instead of requiring a full `ModelEntry` — existing `ModelEntry` callers are source-compatible.
- `GeneratedAsset`, `ArtifactGeneratedEvent`, `AssetManifestEntry`, `ArtifactRecord.model`, and the `list-assets`/`get-generation-events` payloads all gained `modelId?: string` (additive).
- `apps/desktop/package.json` gained an explicit `@metroforge/procedural` dependency (was a phantom/transitive import before).

## Cursor / frontend integration requirements

- All 7 items in `docs/CURSOR_BACKEND_REQUIREMENTS.md` are implemented and typed. The renderer can now call `explainModelRouting`, `getOverworldMap`, `getDungeonGraph`, `getRoomCollision` via the preload bridge, and read `modelId` off `ArtifactGenerated` events / `listAssets()` results — `GenerationStudio.tsx` already reads `modelId` when present per the latest changelog entry, so this should light up without further frontend changes.
- `getOverworldMap`/`getDungeonGraph`/`getRoomCollision` return `{error: string}` (not a thrown IPC error) when a project has no top-down data (e.g. a `SIDE_VIEW_METROIDVANIA` project) — render that message rather than treating an empty/absent field as a crash.
- Not yet exposed: a way to regenerate/resize the top-down world for non-TINY_TEST profiles, since the generator itself doesn't support it yet (see Partial/Next above).

## Tests

- `pnpm build`: 13/13 packages + desktop renderer/electron/preload — clean.
- `pnpm test`: 74 files / 342 tests passing, including the full `generation-e2e.test.ts` TINY_TEST pipeline run.
- New this session: `packages/ai/src/registry.test.ts` (4 tests), `packages/ai/src/model-catalog.test.ts` (+4 tests for `explainModelRouting`).
- Live verification: `metroforge create --archetype TOP_DOWN_ACTION_ADVENTURE --profile TINY_TEST` generated a real project; inspected its actual `data/world/overworld.json` to confirm the new IPC handlers' assumptions match real generator output (POI kinds, dungeon area naming, `locked_door`/`keyId` shape). Disposable project cleaned up after.

## Known problems / risks

- **No file-level isolation between agents for most of this session.** Confirmed both agents writing to the same physical working directory concurrently for a stretch (not separate worktrees), which caused one real build breakage this session had to fix. The other agent has since moved to a real `git worktree` (`../Forged-cursor-desktop`), which resolves this going forward.
- Large amount of uncommitted work was sitting in the working tree with no commit checkpoint for most of the session. Recommend committing on the shared branch rather than leaving long uncommitted stretches, given the shared-filesystem history.
