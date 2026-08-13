# Parallel changelog

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
