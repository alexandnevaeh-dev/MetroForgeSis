# Parallel changelog

## 2026-08-14 — CLAUDE — side-view: fixed a real MEDIUM-scale room-transition bug + movement-feasibility coverage gap

- **Agent:** CLAUDE
- **Branch:** `feature/claude-generation-runtime`

Found while empirically verifying a movement-feasibility fix at MEDIUM scale (a check that had
never been exercised beyond TINY_TEST this session): `godot_playtest` regressed to 4/8 on a fresh
104-room/5-boss MEDIUM generation, failing at the very first room transition. Root cause:
`WorldManager.transition_to_room()` is called synchronously from `RoomTransition._on_body_entered`
— itself a physics-signal callback firing during the physics server's own step — and
`_load_room()`'s `queue_free()`/`add_child()` sequence mutates the new room's physics shapes
(one-way platforms, weak floors, its own transition triggers) while still nested inside that same
flush, throwing "Can't change this state while flushing queries" and silently aborting the
transition. Top-down's equivalent (`OverworldManager.load_area()`) already had the right guard
(`await get_tree().process_frame` before any physics mutation) — side-view was simply missing the
pattern top-down already used. Fixed by awaiting one physics frame at the top of
`transition_to_room()` before touching the scene tree.

That fix has a real side effect: room transitions now legitimately take one frame longer, which
surfaced 4 further bugs in test code (not the fix itself) that fired-and-forgot a transition then
checked post-transition state after a fixed, now-too-short frame wait instead of actually awaiting
the transition's completion — `boss_room_plays_boss_music`, `ability_gate_node_present_after_navigation`,
`ability_gate_opens_after_unlock`, `player_death_respawns_at_checkpoint_room` in
`RuntimeSmokeTest.gd`, plus `GameManager._do_respawn()` itself firing `transition_to_room()` without
awaiting it — real production code (every player death), not just a test artifact. All fixed by
awaiting the coroutine at each call site instead of guessing a frame count.

Also closed a real coverage gap in `packages/procedural/src/movement-feasibility.ts`: `grapple` was
excluded from the "up transition" feasibility check entirely (its computed reach was calculated but
literally never used for anything), and its reach constant was a hardcoded `220px` never connected
to the real per-project `grappleSpeed` stat. Now grapple genuinely drives the check via
`grappleSpeed`; `wall_jump`/`wall_slide`'s previous accidental self-referencing tautology (always
passed by construction, not by real math) is now an explicit, documented design decision instead —
chain-bounce wall-climbing genuinely isn't modeled well by a single-impulse height formula, and a
naive one would have introduced false-positive failures on legitimate level designs.

Verified: full monorepo build/typecheck/test green throughout; a completely clean side-view
TINY_TEST regeneration (no manual file syncing) reaches `RUNTIME_VALIDATED: 18/18 gates passed`;
the MEDIUM-scale project that originally surfaced the bug now passes its smoke test cleanly
(180/180 hard checks, only the pre-existing, unrelated headless-screenshot soft-fail remains).

## 2026-08-14 — CLAUDE — side-view archetype: godot_playtest 4/8 → 8/8 — the "mature" archetype had never actually been runtime-verified

- **Agent:** CLAUDE
- **Branch:** `feature/claude-generation-runtime`

Went looking for a smaller, previously-scoped gap (side-view's `RuntimeSmokeTest.gd` boss-victory
check uses a direct `take_damage()` call instead of simulated input) and found the much bigger
thing it was standing in for: side-view's own `godot_playtest` gate — the "mature" archetype,
assumed working — had never actually been run against the real engine either. A fresh TINY_TEST
generation scored 4/8 on exactly the gate top-down started this week at. Nine further real bugs
later (none introduced this session; all pre-existing, just never exercised), it's 8/8.

### Root causes found and fixed

- **The exact type-inference/missing-`class_name` bugs already fixed for top-down's
  `WorldMapPanel.gd`, unfixed here** — `MinimapPanel.gd extends WorldMapPanel` with no
  `class_name WorldMapPanel` anywhere, plus the same `:=` type-inference failures on a
  ternary-like boolean and a `.replace()` call. This alone crashed the map/inventory/quest UI and
  cascaded into 9 failing checks that looked unrelated (`world_map_view_present`,
  `final_boss_defeat_emits_game_completed`, `currency_hud_reflects_real_state`, save-migration
  checks, etc.) — one root cause wearing nine different faces.
- **Three `PauseMenu.gd` `queue_redraw()` calls pointed at a stale scene path** missing a `/VBox`
  segment every other reference to those panels already had — a scene restructuring that never
  finished propagating to the script. Same missing segment duplicated into `RuntimeSmokeTest.gd`'s
  own map/inventory presence checks.
- **`_check_npc_interaction` asserted against an orphan `DialogueOverlay`** it instantiated itself,
  while `NPC._begin_dialogue()` actually drives the real one `World.tscn` already has in the
  "dialogue_overlay" group — the test's copy was never touched by anything. Read the real instance
  instead.
- **A genuine GDScript closure bug**: `var completed := false; signal.connect(func(): completed =
  true)` — lambdas capture outer locals by value, not by reference, in GDScript. Confirmed live —
  the lambda's own print showed `completed=true` immediately before the next line outside it read
  `false`. Fixed with the standard single-element-array workaround.
- **`_free_new_children()`'s `queue_free()` calls were never awaited**, letting accumulated pending
  frees from earlier in the same test resolve on whatever frame a later, unrelated
  `get_child_count() == before + N` check happened to await, throwing off an exact-count assertion
  with no real connection to the frees. Await a settling frame inside the helper; updated all 7
  call sites.
- **The v1→v2 save-migration test overwrote its own fixture's target file** — the check right
  before it wrote a real save to the same slot, and `reset_save()` only clears in-memory state,
  not disk, so `load_game()` loaded the real save first and never touched the legacy fixture the
  test exists to exercise.
- **The top-down boss-arena-exit-lock bug, ported to the older `WorldManager`/`RoomTransition`
  system** — plus a race the top-down fix didn't need to handle, since this `WorldManager` rebuilds
  the *entire room* per transition rather than just re-opening doors: reordered `_load_room` so the
  lock is fully applied before `current_room_id`/`room_entered` ever announce the room as loaded.
- **The top-down "fake elapsed time" and "player death frees the room, looks identical to a real
  boss kill" bugs**, both present in the older `PlaytestAgent.gd` too — fixed the same way
  (`Time.get_ticks_msec()`, `reset_health()` pre-fight, `is_instance_valid()` guards, a real time
  floor instead of aborting after one missed approach).
- **The actual reason the fight only ever landed exactly one hit no matter how long it ran**:
  `_defeat_final_boss` poked `AttackHitbox.activate()`/`.deactivate()` directly instead of calling
  the player's own `_perform_attack()`, which is what positions the hitbox via
  `attack_hitbox.position.x = 30 * facing` before activating it — direct poking left it wherever it
  was last positioned. Fixed to call the real methods, and to set `facing` explicitly (it only
  updates while movement input is actively pressed, and the walk-to-target loop stops pressing
  input once close). Neither fix alone was sufficient: `AttackHitbox`'s own `CollisionShape2D`
  carries a further fixed local offset of `(30, -20)` on top of the Area2D's `30 * facing`
  position, so the swing's real reach centers ~60px out from the player — while the bot's approach
  walked the player's *center* to within 12px of the boss's, well past that reach. Retargeted the
  approach at a real melee-range standoff instead of the boss's center. 200 HP boss now drops in
  exactly 20 landed hits.

Verified live against real Godot 4.7.1 across ~10 iterative runs, then confirmed via a completely
clean `metroforge create` regeneration with no manual file syncing:
`final_qa: PASSED (RUNTIME_VALIDATED: 18/18 gates passed)`. Full monorepo `pnpm test` (387 tests)
green afterward — one unrelated flaky timeout on a pre-existing NVIDIA catalog test, confirmed
passing at 359ms in isolation (resource contention from concurrent Godot runs, not a regression).

## 2026-08-13 — CLAUDE — top-down archetype: godot_playtest 8/8 (was 2/8) — the real boss AI was dead code

- **Agent:** CLAUDE
- **Branch:** `feature/claude-generation-runtime`

Adapted the automated playtest bot for top-down (out of scope in the prior `godot_runtime` pass)
and chased the boss fight through ~10 live-Godot iterations before it actually completed. Each
apparent fix that didn't work turned out to be masking a different real bug further down the same
critical path — verified against the real Godot 4.7.1 binary at every step, never just typechecked.

### Root causes found and fixed

- **`Boss.tscn` was wired to the wrong script.** It used `TopDownEnemyController.gd` (a generic
  enemy: no telegraph, 1.1s untelegraphed attack cooldown) while `BossController.gd` — the
  phase/telegraph/`bosses.json`-weakness-data-driven boss script an earlier pass built — was never
  referenced by any scene, making its telegraph timing, phase transitions, and weakness multiplier
  100% dead code. Rewired `Boss.tscn` to it. `BossController.gd` itself was also incomplete: no
  chase movement (never called `move_and_slide()`) and applied side-view-style gravity in a
  floating top-down scene — added real chase-when-not-telegraphing movement, removed the gravity.
- **`dash_through` weakness was unreachable.** `BossController._on_hit_received()` already checked
  `player.get("_is_dashing") == true` for double damage, but `TopDownPlayerController.gd` never
  defined `_is_dashing` — `get()` on a missing property is `null`, so the multiplier could never
  fire for any player, ever. Added the property (mirrors the existing "dash" = sprint-speed input).
- **Boss-arena exit lock plus its own reentrancy bug.** Added exit-sealing while a boss is alive to
  `OverworldManager._spawn_pois()`; the auto-reopen-on-death handler wrote `monitoring`/
  `monitorable` directly from inside the boss's own `died` signal, which fires from inside an
  `Area2D` in/out signal callback where Godot rejects that write ("blocked during in/out signal") —
  fixed via `set_deferred()`.
- **False-positive win detection.** The fight loop read "boss node reference went invalid" as the
  win condition — true on a real kill, but also true when the *player* dies, since
  `GameManager`'s respawn flow calls `load_area()`, which frees every child of the room including
  the still-alive boss. A player death was being scored as a boss kill. Now checks player-death
  first.
- **Dodge granularity.** The playtest bot polled `boss._telegraph_active` once per multi-frame
  approach/attack action, often noticing a telegraph after the swing already landed. Extracted
  `_step_toward()` out of `_walk_player_to()` so the fight loop can react every physics frame.
- **Residual chip damage.** The route only visits pickups on each leg's *origin* room, never the
  boss room itself — the bot could reach the fight already damaged from incidental contact earlier
  in the dungeon. `reset_health()` before the boss fight starts.

Verified via a completely clean `metroforge create` regeneration (no manual file syncing):
`final_qa: PASSED (RUNTIME_VALIDATED: 18/18 gates passed)`. Full monorepo `pnpm test` (387 tests,
81 files) green afterward. `pnpm build`: `packages/qa`, `packages/generation`, `apps/cli` all
clean; `apps/desktop`'s renderer `vite build` fails on a pre-existing, unrelated issue
(`packages/shared/dist/config.js` pulling `node:path`/`node:url` into the browser bundle) not
touched this session.

## 2026-08-13 — CLAUDE — top-down archetype: runtime smoke test 13/13 (was 0/0 or crashing)

- **Agent:** CLAUDE
- **Branch:** `feature/claude-generation-runtime`

Diagnosed and fixed the actual reasons a fresh `TOP_DOWN_ACTION_ADVENTURE` TINY_TEST generation
couldn't pass Godot runtime validation — verified against the real Godot 4.7.1 binary, not just
typechecked. Several of these were pre-existing bugs in `templates/godot-topdown-adventure/`
(not introduced this session) that had never been runtime-verified before.

### Root causes found and fixed

- **`packages/procedural/src/topdown/world.ts`** — the progression graph used
  `type: 'ability'` was needed but the code had `type: 'key'` for dungeon-item reward nodes;
  `validateReachability` (world.ts) only grants unlocks for `type: 'ability'` nodes, so the
  abstract chain was permanently "unsolvable." Also scaled `generateTopDownWorld()` to produce
  `TOP_DOWN_PROFILE_DEFAULTS[profile].dungeonCount` real item-gated dungeons (deterministically
  scattered entrances, one dungeon's boss grants the item gating the next) instead of always
  exactly one fixed 4-room dungeon regardless of profile; only the *last* dungeon's boss is named
  `boss_final` (GameManager's win condition), earlier ones get distinct boss ids. Added
  `dungeonItemsById` (dungeonId → item) since `dungeonItemId` alone can't represent multiple
  dungeons; kept `dungeonItemId` for existing single-dungeon callers.
- **`packages/qa/src/validator.ts`** — the repair engine's "restore missing template file" logic
  (`TEMPLATE_DIR`) was hardcoded to `templates/godot-metroidvania` regardless of the project's
  actual archetype, so a top-down project's *intentionally* absent side-view files (e.g. a
  deleted `PlayerController.gd`) kept getting silently reintroduced from the wrong template on
  every repair pass. Now resolves the template dir from the project's own `game_dna.json`
  archetype via `getGameArchetypePlugin`. Also: `registered_abilities_valid` now checks top-down
  GameDNA abilities (which are dungeon *items*, not movement ability ids) against
  `TOP_DOWN_DUNGEON_ITEMS` instead of `REGISTERED_ABILITIES`; `required_scenes_exist` checks for
  `data/world/overworld.json` on top-down instead of `scenes/rooms/*.tscn` (top-down has none —
  see below); `required_files`'s hardcoded `scripts/player/PlayerController.gd` is now
  archetype-conditional (`TopDownPlayerController.gd` for top-down).
- **`packages/godot/src/assembler.ts`** — top-down `rooms.json` entries were hardcoded to
  `archetype: 'hub'|'combat'`, discarding the real archetype (including `'boss'`) recorded on the
  world-graph node — this alone failed `room_archetype_fidelity` for every boss room. Now
  preserved. Also merges `gameDna.abilities` (top-down's dungeon items) into `items.json` so
  `InventoryManager.grant_item()` recognizes them — they weren't in the side-view-oriented
  `gameContent.items` array at all, so every chest/gate grant silently failed before this.
- **Dead code**: deleted `templates/godot-topdown-adventure/scripts/player/{PlayerController,
  AbilityController,AbilityRegistry,PlayerAbility}.gd` + `abilities/*.gd` (9 files) — unmodified
  side-view leftovers from the initial template scaffold that `Player.tscn` no longer referenced
  (it already used `TopDownPlayerController.gd`/`TopDownCamera.gd`); confirmed via repo-wide grep
  before removing. Also deleted `scripts/world/WorldManager.gd` — a second, unused room-swap
  manager coexisting with the actual one attached to `World.tscn`
  (`scripts/world/OverworldManager.gd`, which spawns everything from
  `data/world/overworld.json` at runtime rather than loading a pre-baked scene per room).
- **Real GDScript bugs, unrelated to archetype-wiring, found only by actually running Godot**:
  `Enemy.tscn`'s attack hitbox was named `ContactHitbox` but `TopDownEnemyController.gd` expects
  `$AttackHitbox` (`Boss.tscn` had it right); `TopDownPlayerController.gd`'s `CARDINALS` dict used
  `const` with `.normalized()` calls, which Godot 4 rejects as non-constant — changed to
  `static var`; `SaveManager.consume_pending_player_health()` returns a `Dictionary` but
  `TopDownPlayerController.gd` treated it as a bare float; `WorldMapPanel.gd` was missing its own
  `class_name WorldMapPanel` declaration (so `MinimapPanel.gd extends WorldMapPanel` couldn't
  resolve) and had two more `:=` type-inference parse errors; `RuntimeSmokeTest.gd`'s own
  `var start := player.global_position` failed for the same reason (`player` was typed `Node`).
  `LockedDoor.gd`/`ItemGate.gd`/`ChestPickup.gd` (added this session to match the class-name
  contract `RuntimeSmokeTest.gd`/`OverworldManager.gd` already expected) build their own child
  nodes in `_ready()` rather than via a `.tscn` scene tree, since `OverworldManager._spawn_pois()`
  instantiates them with plain `ClassName.new()`.
- **`packages/qa/src/smoke-output.ts` format mismatch**: the top-down `RuntimeSmokeTest.gd`
  printed `"PASS name"` (no colon); the parser regex requires `"PASS: name"` (the side-view
  template's actual format). Every top-down runtime check was silently discarded
  (`0/0 runtime checks passed`) even on a fully successful run — fixed the GDScript print, not the
  parser, since the parser is the established shared contract.
- `RuntimeSmokeTest.gd`'s `player_moves_diagonally` check drove the player via a manual
  `velocity=...; move_and_slide()` call from outside any physics step (no measurable movement) —
  replaced with real simulated input (`Input.action_press`) across awaited physics frames, driving
  the actual controller logic instead of bypassing it.

### Verified live (real Godot 4.7.1, not typechecked)

- `godot_runtime`: **13/13 PASS** (autoloads, world/player load, 8-directional movement, attack
  hitbox, `data/world/overworld.json` present, chest grants item, locked door opens with key,
  item gate opens with tool, `OverworldManager` present, dungeon area loads via `load_area`).
- `pnpm build` clean (all 13 packages + desktop), `pnpm test` — 194/194 in touched packages
  (procedural/qa/godot/ai), no regressions.

### Known remaining gap (not attempted this pass — separate scope)

- `godot_playtest`: 2/8 — `templates/godot-topdown-adventure/scripts/test/PlaytestRunner.gd` is a
  byte-for-byte-length-identical copy of the side-view template's version (same 68 lines),
  unmodified for top-down's persona/input-simulation/victory-detection model. Adapting the
  automated playtest-bot layer for a new archetype is comparable in scope to everything above and
  was explicitly out-of-scope in the original implementation spec ("sophisticated AI playtest
  bots" — do not implement yet). Left as an honest gap rather than a rushed fix.

---

## 2026-08-13 — CURSOR — premium visual redesign (design system + shell + Create/Dashboard/Studio)

- **Agent:** CURSOR
- **Branch:** `feature/cursor-desktop-studio` (also synced to `Forged-cursor-desktop` worktree)

### Audit

- No `docs/ui-audit/` screenshots present — audited via code.
- Prior UI: warm bronze/cream tokens (`#c4a574`), brand+project in left sidebar only, flat panels, no top command bar, no collapse rail.
- All 16 nav routes + Ctrl+K / Ctrl+1–6 shortcuts preserved.

### Modules changed (Cursor-owned)

- `apps/desktop/src/styles.css` — full forge token set (obsidian/graphite + cyan/blue/violet/amber), layered grid/vignette background, glass/metal panel tiers L0–L3, motion + `prefers-reduced-motion`, shell/topbar/rail styles.
- `apps/desktop/src/App.tsx` — top command bar (logo, project path, New Game / Studio / Preview / Ctrl+K), collapsible left nav rail (Ctrl+B), active glow strip.
- `CreateScreen.tsx` — hero + form layout on panel tiers.
- `ProjectDashboard.tsx` — panel-tier dashboard cards.
- `GenerationStudio.tsx` — studio header + L1–L3 panels (review gate / generate bar / workspace); kept review-gate restore / live progress / activity empty states.
- `DungeonEditor.tsx` — tiny optional-chain fix for `nodes?.find` (typecheck unblock; no behavior change).

### Shared contracts touched

- None (frontend/CSS only; no Electron/handlers/packages).

### Tests run

- `pnpm --filter @metroforge/desktop typecheck` — passed
- `pnpm --filter @metroforge/desktop build` — passed

### Next (same redesign stream)

- PHASE 6–11: Asset Gallery, World/Room/Dungeon, Models/Providers/Routing, QA/Settings, motion polish.

---

## 2026-08-13 — CURSOR — studio resume + consume Claude spatial/routing IPC

- **Agent:** CURSOR
- **Branch:** `feature/cursor-desktop-studio`

### Modules changed

- `GenerationStudio.tsx` — restore pending review gate; live progress; activity empty/reload
- `ProjectDashboard.tsx` — refresh, playtest room jumps, recent activity → Studio
- `WorldMapPreview.tsx` / `GoToPalette.tsx` — keyboard map nav + Tab focus trap
- `metroforge-api.ts` — typed `explainModelRouting` / `getOverworldMap` / `getDungeonGraph` / `getRoomCollision`
- `RoutingInspector.tsx` — real rejection traces from `explainModelRouting`
- `WorldEditor.tsx` — spatial view prefers `getOverworldMap`
- `DungeonEditor.tsx` — prefers `getDungeonGraph`, falls back to world graph filter
- `RoomEditor.tsx` — collision layer draws `getRoomCollision` rects when present

### Shared contracts touched

- Consumed Claude-owned preload/handlers only (no handler edits).

### Tests run

- `pnpm --filter @metroforge/desktop typecheck` — passed
- `pnpm --filter @metroforge/desktop build` — passed

---

## 2026-08-13 — CLAUDE — Cursor backend requirements (routing trace, top-down spatial APIs, modelId)

- **Agent:** CLAUDE
- **Branch:** `feature/claude-generation-runtime`

Implements all 7 items in `docs/CURSOR_BACKEND_REQUIREMENTS.md`.

### Modules changed (Claude-owned)

- `apps/desktop/electron/handlers.ts` — `generate-game`/executor now type and thread `archetype`
  through to `GenerationPipeline.run()` (was already consumed there, just untyped at the IPC
  boundary); new `explain-model-routing`, `get-overworld-map`, `get-dungeon-graph`,
  `get-room-collision` handlers; `categorizeAssetPath` realigned to the gallery taxonomy
  (Player/NPC/Enemy/Boss/Tileset/Background/Prop/Weapon/Item/UI/Icon/VFX/Animation/Music/SFX/Voice)
  to match `apps/desktop/src/studio/types.ts`'s own copy exactly; `list-assets` now returns `modelId`.
- `apps/desktop/electron/preload.ts` — bridges for `explainModelRouting`, `getOverworldMap`,
  `getDungeonGraph`, `getRoomCollision`; `generateGame` opts gained `archetype?: string`.
- `apps/desktop/package.json` — added `@metroforge/procedural` as an explicit dependency
  (handlers.ts now imports `TopDownOverworld`/`TopDownPoi` types from it).
- `packages/ai/src/model-catalog.ts` — new `explainModelRouting()` + `RoutableModelEntry`/
  `ModelRoutingExplanation` types: real per-model accept/reject trace (license via
  `LicenseRouter`, provider-enabled, RAM/VRAM fit), built by reusing `rankModelsForCapability`'s
  scoring rather than duplicating it. `packages/ai/src/model-catalog.test.ts` — 4 new tests.
- `packages/ai/src/registry.ts` — `CapabilityRouter` candidate ranking is now health-aware
  (healthy > degraded > unavailable, priority as tiebreaker); never excludes a candidate on
  health alone, so `FallbackManager` still has a last resort. `packages/ai/src/registry.test.ts`
  (new file, 4 tests).
- `packages/ai/src/license-router.ts` — `classify`/`isCommercialSafe`/`filterCommercialSafe` now
  take a narrower `LicenseSubject` structural type instead of full `ModelEntry`, so the same
  logic is reusable from `CapabilityRouter` without constructing fake catalog entries.
- `packages/assets/src/asset-pipeline.ts` — `GeneratedAsset.modelId?: string`, threaded from the
  3 real `imageGen.generateImage()` call sites (tileset biome loop, sprite/character path, manual
  tileset path); left `undefined` for procedural/checkpoint/pixel-art-processor assets, which
  have no underlying model.
- `packages/generation/src/events.ts` — `ArtifactGeneratedEvent.modelId?: string`.
- `packages/generation/src/pipeline.ts` — `ArtifactGenerated` event and `db.artifacts.create()`
  now carry `asset.modelId`.
- `packages/godot/src/assembler.ts` — `AssetManifestEntry.modelId?: string`, so
  `generation_manifest.json` (and therefore `list-assets`) carries it for already-generated projects.
- `packages/procedural/src/topdown/world.ts`, `world.test.ts` — fixed a build break found on this
  branch (stale `dungeonItem` reference where the param had been renamed to `dungeonItemId`;
  missing `optional` field on 4 literal edges; test file's relative imports weren't updated after
  it moved into `src/topdown/`). Not new functionality — restoring `pnpm build` to green.

### New IPC contracts (typed request/response live in handlers.ts + preload.ts)

- `explainModelRouting(capability)` → `ModelRoutingExplanation` (packages/ai/src/model-catalog.ts)
- `getOverworldMap(projectPath)` → reads `data/world/overworld.json` (written by
  `packages/godot/src/assembler.ts`'s `writeTopDownWorld()`), returns the region/node/edge shape
  Cursor specified. Errors honestly (`{error}`) when the project has no top-down overworld data.
- `getDungeonGraph(projectPath, dungeonId?)` → groups `overworld.json` areas by dungeon id
  (`dungeon_000_r2` → `dungeon_000`), derives room kind / keys / doors / criticalPath from real
  POI data. `miniBossId` is left `undefined` — `generateTopDownWorld()` doesn't place a distinct
  mini-boss POI today, so this is an honest gap, not a guess.
- `getRoomCollision(projectPath, roomId)` → area's real `collisionRects` (tile-derived, not
  decorative).
- Verified all three live against a real `TOP_DOWN_ACTION_ADVENTURE` TINY_TEST generation
  (`metroforge create --archetype TOP_DOWN_ACTION_ADVENTURE`), inspecting the actual
  `overworld.json` output — not just typechecked.

### Tests run

- `pnpm build` — clean (all 13 packages + desktop renderer/electron/preload)
- `pnpm test` — 342/342 passed (74 files)
- Live TINY_TEST generation with `--archetype TOP_DOWN_ACTION_ADVENTURE`: assembly/world_topology
  pass; static QA gates `registered_abilities_valid`/`room_archetype_fidelity`/
  `required_scenes_exist` fail — expected, the top-down Godot template is still mid-adaptation
  (still has side-view ability scripts) per the other agent's own in-progress work; not something
  this pass touched or claims to fix.

### Known issues / honest gaps

- `getDungeonGraph`'s `miniBossId` is always `undefined` (no mini-boss concept in the generator yet).
- `generateTopDownWorld()` (packages/procedural/src/topdown/world.ts) still only ever produces
  one fixed 4-room dungeon regardless of profile (SMALL/MEDIUM/LARGE don't get more dungeons) —
  `getDungeonGraph`'s multi-dungeon `dungeonId` selection logic is ready for when that changes,
  but there is only ever one dungeon to select today.
- Top-down static QA gates still fail on a fresh generation (see Tests run) — template-side work,
  not backend routing/API work.

---

## 2026-08-13 — CURSOR — palette rooms/assets + empty editors

- **Agent:** CURSOR
- **Branch:** `feature/cursor-desktop-studio`

### Modules changed

- `apps/desktop/src/studio/GoToPalette.tsx` — Ctrl+K searches rooms and assets in the active project
- `apps/desktop/src/studio/DungeonEditor.tsx` — AI CommandBar; hide chrome without a project
- `apps/desktop/src/studio/StudioContext.tsx` — `hasActiveProject` for consistent empty workspaces
- World/Room/Gallery/Export/Preview/QA/Manual Generator hide editor chrome until a project is selected
- Gallery and Room Editor empty-filter states; layout tokens for 1920 / 1440 / 1366

### Shared contracts touched

- None modified.

### Tests run

- `pnpm --filter @metroforge/desktop typecheck` — passed
- `pnpm --filter @metroforge/desktop build` — passed

---

## 2026-08-13 — CURSOR — empty states + project library search

- **Agent:** CURSOR
- **Branch:** `feature/cursor-desktop-studio`

### Modules changed

- `apps/desktop/src/studio/NoProjectHint.tsx` — New Game / Projects when no active project
- Project-backed screens show the hint; Projects list is searchable with an active card
- `apps/desktop/src/studio/PreviewScreen.tsx` — double-click map opens room; asset cards open gallery

### Shared contracts touched

- None modified.

### Tests run

- Desktop typecheck/build — this pass

---

## 2026-08-13 — CURSOR — QA/export preflight + studio click-through

- **Agent:** CURSOR
- **Branch:** `feature/cursor-desktop-studio`

### Modules changed

- `apps/desktop/src/studio/QAScreen.tsx` — doctor refresh, gate filter, skipRuntime, checkpoints, Open {screen}
- `apps/desktop/src/studio/ExportScreen.tsx` — getProjectDashboard preflight, Play/Open Godot
- `apps/desktop/src/studio/GenerationStudio.tsx` — activity search/click, world open-room, artifact → gallery
- `apps/desktop/src/studio/StudioContext.tsx` — `openAsset` / `focusAssetId`
- `apps/desktop/src/studio/AssetsGallery.tsx` — consume focused asset
- `apps/desktop/src/studio/WorldMapPreview.tsx` — double-click `onActivate`

### Shared contracts touched

- None modified.

### Tests run

- Desktop typecheck/build — this pass

---

## 2026-08-13 — CURSOR — room focus + gallery/dungeon density

- **Agent:** CURSOR
- **Branch:** `feature/cursor-desktop-studio`

### Modules changed

- `apps/desktop/src/studio/StudioContext.tsx` — `focusRoomId` / `openRoom` / generator prefill
- `apps/desktop/src/studio/RoomEditor.tsx` — search, keyboard list, occupancy overlay, NPCs/collectibles/weak floors
- `apps/desktop/src/studio/WorldEditor.tsx` — Open in Room Editor focuses the selected node
- `apps/desktop/src/studio/DungeonEditor.tsx` — dungeonId picker, critical-path select, jump to room
- `apps/desktop/src/studio/AssetsGallery.tsx` — search; open in generator; room usage jumps
- `apps/desktop/src/studio/GenerateAsset.tsx` — ManualAssetType list, seed, restore, gallery prefill
- `apps/desktop/src/studio/VirtualizedRoomList.tsx` — arrow-key navigation

### Shared contracts touched

- None modified.

### Tests run

- `pnpm --filter @metroforge/desktop typecheck` — passed
- `pnpm --filter @metroforge/desktop build` — passed

---

## 2026-08-13 — CURSOR — live workers + studio density

- **Agent:** CURSOR
- **Branch:** `feature/cursor-desktop-studio`

### Modules changed

- `apps/desktop/src/studio/SettingsScreen.tsx` — extracted; audio/CPU limits; live worker meters
- `apps/desktop/src/studio/CreateScreen.tsx`, `ProjectsScreen.tsx`, `PreviewScreen.tsx` — extracted from App
- `apps/desktop/src/studio/ConcurrencyMeters.tsx` — `getConcurrencyStatus` meters
- `apps/desktop/src/studio/StatusBar.tsx` — click-through to Models/Providers/Studio/Settings + compact meters
- `apps/desktop/src/studio/WorldEditor.tsx` — map selection + inspector
- `apps/desktop/src/studio/ProjectDashboard.tsx` — jumps to Studio/World/Assets/QA
- `apps/desktop/src/studio/RoutingInspector.tsx` — filter + catalog jump; RankedModel type export
- `apps/desktop/src/studio/ModelsScreen.tsx` — arrow-key catalog rows
- Settings profile options aligned to `TINY_TEST | SMALL | MEDIUM | LARGE`

### Shared contracts touched

- None modified. Renderer now saves `app.concurrency.audio` / `app.concurrency.cpu` through existing `setAppSettings`.

### Tests run

- `pnpm --filter @metroforge/desktop typecheck` — passed
- `pnpm --filter @metroforge/desktop build` — passed

---

## 2026-08-13 — CURSOR — models/providers density + archetype note

- **Agent:** CURSOR
- **Branch:** `feature/cursor-desktop-studio`

### Modules changed

- `apps/desktop/src/studio/ModelsScreen.tsx` — search, virtualized catalog, hardware, inspector
- `apps/desktop/src/studio/ProvidersScreen.tsx` — provider cards + key presence
- `apps/desktop/src/App.tsx` — extracted those screens; Create note updated now that IPC accepts archetype
- `apps/desktop/src/studio/GenerationStudio.tsx` — inspector reads `modelId` when events include it
- `apps/desktop/src/studio/metroforge-api.ts` — HardwareSnapshot / CatalogModel
- `docs/CURSOR_BACKEND_REQUIREMENTS.md` — archetype requirement marked partially landed

### Shared contracts touched

- None modified. Frontend types widened to match existing `getHardwareProfile` spread payload.

### Tests run

- `pnpm --filter @metroforge/desktop typecheck` — passed
- `pnpm --filter @metroforge/desktop build` — passed

- **Agent:** CURSOR
- **Branch:** `feature/cursor-desktop-studio`
- **Worktree:** `C:/Users/alexa/OneDrive/Documents/Metroidvania/Forged-cursor-desktop`

### Modules changed (Cursor-owned)

- `apps/desktop/src/studio/StudioContext.tsx` — shared active project (session-persisted)
- `apps/desktop/src/studio/ProjectSelect.tsx` — common project switcher
- `apps/desktop/src/studio/QAScreen.tsx` — environment doctor + `getValidationResults` + acceptance
- Studio screens now consume the active project instead of each picking the first list item
- Create: archetype cards; after generate, project becomes active and can open Studio/Dashboard
- Ctrl+K palette: screens + projects, arrow-key selection
- Status bar / sidebar show the active project

### Shared contracts touched

- None. `getValidationResults` typing in the renderer now matches the existing handler array payload.

### Tests run

- `pnpm --filter @metroforge/desktop typecheck` — passed
- `pnpm --filter @metroforge/desktop build` — passed

---

## 2026-08-13 — CURSOR — desktop studio shell


- **Agent:** CURSOR
- **Branch:** `feature/cursor-desktop-studio`
- **Worktree:** `C:/Users/alexa/OneDrive/Documents/Metroidvania/Forged-cursor-desktop`
- **HEAD at branch create:** `a40914c`

### Modules changed (Cursor-owned)

- `apps/desktop/src/styles.css` — design tokens, shell, editors, reduced motion, 1440/1366 breakpoints
- `apps/desktop/src/App.tsx` — grouped navigation, keyboard jump, new screens, Create archetype field
- `apps/desktop/src/studio/*` — Generation Studio layout, gallery, generator, world/room/dungeon, routing, export, typed bridge
- `apps/desktop/index.html` — window title
- `docs/CURSOR_WORKSTREAM_STATUS.md`
- `docs/CURSOR_BACKEND_REQUIREMENTS.md`
- `docs/PARALLEL_CHANGELOG.md`

### Shared contracts touched

- **None modified.** Preload/handlers/schemas/package exports were not edited.
- Frontend `generateGame` options type now includes optional `archetype`. The extra field is sent over existing IPC; the handler type does not declare it yet (compatible additive payload).

### Backend requirements discovered

Documented in `docs/CURSOR_BACKEND_REQUIREMENTS.md`:

- `generateGame.archetype`
- `explainModelRouting`
- `getOverworldMap`
- `getDungeonGraph`
- `getRoomCollision`
- `listAssets` category taxonomy
- `modelId` on generation artifact/task events

### Tests run

- `pnpm --filter @metroforge/desktop typecheck` — passed
- `pnpm --filter @metroforge/desktop build` — passed
- No desktop unit-test script exists; backend/Godot packages not exercised by this agent.

### Known issues

- Spatial/dungeon views degrade honestly when metadata is missing.
- Original working tree still contains this renderer copy so the running Vite desktop can hot-reload; do not treat Claude-owned packages in that tree as Cursor work.

### Integration requirements

- Claude should read `archetype` from the generate-game job payload.
- After backend contracts land, Routing / World Spatial / Dungeon can drop inferred fallbacks.
- Merge `feature/cursor-desktop-studio` into the generation branch only for `apps/desktop/src`, `apps/desktop/index.html`, and `docs/CURSOR_*` / `docs/PARALLEL_CHANGELOG.md`.
