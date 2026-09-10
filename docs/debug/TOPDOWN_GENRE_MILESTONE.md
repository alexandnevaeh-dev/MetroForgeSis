# Top-down genre milestone — baseline, fixes, and real verification

**Date**: 2026-09-08. **Archetype**: `TOP_DOWN_ACTION_ADVENTURE`. **Profile**: `VISUAL_VERTICAL_SLICE`.
**Prompt**: "a lone scout explores a sunken crystal dungeon guarded by ancient sentinels". **Seed**: `20260918`.
**Final project**: `GeneratedGames/topdown-session-final` (regenerated fresh through the normal CLI five times over the
course of this session as fixes landed; every claim below is against the last of those, the one with every fix in
place). **Side-view work**: not modified except one shared-path fix, scoped and regression-tested (see §5).

This continues from the independently-reviewed side-view checkpoint/health-continuity milestone
(`docs/audit/MODERN_COHESION_TEST_PROJECT.md`) and the 2026-08-15 top-down `godot_playtest` repair
(`docs/debug/TOPDOWN_PLAYTEST_REPAIR.md`). Per this session's instruction, the side-view milestone is deferred and
its completed work is untouched; this document covers the top-down genre shift only.

## 1. Baseline: what actually worked and what didn't

Traced genre selection end-to-end before touching anything: `packages/shared/src/archetypes.ts`'s
`GAME_ARCHETYPE_PLUGINS[TOP_DOWN_ACTION_ADVENTURE]` → `templates/godot-topdown-adventure/` (its own full script set,
not a variant of the side-view template) → `packages/procedural/src/topdown/world.ts` (per-cell terrain + POI
placement) → `packages/godot/src/assembler.ts` (project assembly, `isTopDownArchetype()`-gated) → the template's own
`OverworldManager.gd`/`TopDownPlayerController.gd`/`TopDownEnemyController.gd`/`BossController.gd` at runtime.

Generated a baseline (`topdown-baseline-session`, same seed/prompt, before any fix) and inspected it directly rather
than trusting gate status. Found, in order of impact:

1. **(Broken, highest impact) Generated environment art was never rendered.** `OverworldManager._build_ground()`
   drew one flat `ColorRect` per room regardless of the real generated tileset; `_build_collision()` drew a second
   flat-color `ColorRect` over every wall/water cell. The real per-cell terrain grid (`area.tiles` in
   `data/world/overworld.json`) and a complete generated tileset (`assets/tilesets/biome_0/source.png` +
   `terrain.json`, ~200+ real tiles) existed on disk and were both completely unused. Every top-down room ever
   generated rendered as solid-color rectangles, not the art the pipeline actually produced.
2. **(Broken) Player and enemy sprites never animated.** `AnimatedAssetSprite.gd`'s `_ready()` calls
   `sprite.play("walk")` exactly once, permanently. `TopDownPlayerController.gd` and `TopDownEnemyController.gd`
   never called `sprite.play()` at all afterward — real generated idle/walk/attack/hurt sheets existed and were
   loaded but never selected. Every player and field enemy was a frozen walk-cycle frame regardless of standing
   still, attacking, or being hit, with no directional facing for enemies at all. (`BossController.gd`, uniquely,
   already called `sprite.play()` correctly for state transitions — but its own `"walk"` call had no re-trigger
   guard, so it never actually animated either: calling `play()` every physics frame restarts a clip to frame 0
   every tick.)
3. **(Broken) Real generated enemy stats/combat type never reached the runtime.** `OverworldManager._spawn_pois()`
   instantiated `Enemy.tscn` without ever setting `enemy_id` from the real `poi.metadata.enemyId`, and
   `TopDownEnemyController.gd` never read `data/enemies/enemies.json` at all. Every field enemy used `Enemy.tscn`'s
   hardcoded defaults and was hardcoded melee-only — a generated "projectile" enemy (`enemy_001` in every profile,
   `content.ts`'s `enemyCombatTypeForIndex()`) never actually behaved as ranged. This is the exact "melee and ranged
   enemy encounters" requirement for this milestone; it did not previously exist as a real distinction in top-down.
4. **(Broken) A duplicate, worse item definition silently shadowed the real one.** `packages/godot/src/assembler.ts`'s
   `topDownChestItemDefs()` synthesized a bare stub (`category: 'misc'`, no `effects`) for a chest's `itemId`
   whenever the id wasn't already a known dungeon-tool ability — including `health_vial`, which already had a full
   real `consumable` definition with a heal effect from the main generator. `items.json` concatenates the real
   catalog first and these stubs last, and `InventoryManager`'s id→definition map is last-wins, so the stub always
   won: picking up a health vial silently healed nothing. Caught directly by
   `RuntimeSmokeTest.gd`'s own `item_pickup_consumable_can_be_triggered` check.
5. **(Broken, pipeline-level, most consequential) The generated project was silently corrupted *after* validation
   passed, before delivery.** `packages/qa/src/quality-director.ts` / `quality-repair-engine.ts` (a post-validation
   "quality pass" gated on `isProductionQualityProfile`) has zero archetype awareness anywhere in either file —
   `TEMPLATE_DIR` is hardcoded to `templates/godot-metroidvania`, and one of its always-applied actions
   (`APPLY_TRANSITION_FADE`) unconditionally copies the side-view `WorldManager.gd` into the project and can rewrite
   `scenes/world/World.tscn`'s HUD nodes assuming that architecture. Confirmed directly: a fresh top-down generation
   showed `godot_runtime` 168/168 and `godot_playtest` 8/8 passing *during* the pipeline's own validation, then
   failed to spawn a player at all (`scenes/world/World.tscn` now referenced `WorldManager.gd`, a room-scene manager
   with no top-down equivalent) once this pass had run on the same output directory — with no gate re-run afterward
   to catch the regression. Every top-down project generated at a production-quality profile has been shipping in
   this silently-broken state; this is not a new introduction, it's the first time it was checked for and caught.
6. **(Broken) `start_new_game()` didn't reset `current_room_id`.** Same regression class already found and fixed in
   the side-view `GameManager.gd` in an earlier session: restarting after a real victory (won deep in the dungeon)
   resumed play directly in the boss room, because `OverworldManager._ready()` only falls back to `startAreaId`
   when `current_room_id` is empty, and nothing cleared it.
7. **(Broken) Health silently reset to full on every ordinary room transition**, not just death/checkpoint/load.
   `OverworldManager.load_area()` frees the entire outgoing room's entities — including the Player — on every
   transition and always instantiates a fresh one; `HealthComponent._ready()` then resets to max. There was no
   equivalent of the side-view `_carried_health` mechanism at all for top-down.
8. **(Broken, test-infra) `godot_playtest` was always `SKIPPED` for top-down**, for a different reason than the
   already-documented `item_pickup_consumable_can_be_triggered` failure: `RuntimeSmokeTest.gd` (top-down) never
   printed the `METROFORGE_RUNTIME_READY` marker `packages/qa/src/validator.ts`'s `godot_runtime` gate requires to
   report anything other than `UNKNOWN` — the side-view template's copy of this file has always printed it; the
   top-down one never did. Confirmed by direct measurement: fixing *only* the item-shadowing bug (#4) still left the
   gate at `168/168, passed: false, state: UNKNOWN` — this was the real, separate blocker for `godot_playtest` ever
   running at all on this archetype, not the specific failing check the 2026-08-15 repair pass had already caught.
9. **(Missing, not broken — disclosed, not fixed this session)** Chest/save-point/locked-door/portal/floor-switch/
   victory-shrine world objects render as small flat `ColorRect` squares built directly in GDScript
   (`ChestPickup.gd`, `SavePoint.gd`, `LockedDoor.gd`, `AreaPortal.gd`, `FloorSwitch.gd`, `VictoryShrine.gd`), not
   the real generated icon/prop art that exists on disk (`assets/generated/checkpoint`, `.../gate`, `.../pickup`).
   Distinct from findings #1-2 above: this is a feature that was never built for these object types, not a
   generated-and-ignored asset — the closest a fix would come is wiring in art that wasn't designed to be looked up
   this way. Out of scope for this session's budget; a good next-milestone candidate (§7).
10. **(Missing/broken, camera)** Enclosed rooms (dungeon interiors, the boss arena) are smaller than the 1280×800
    window and the camera doesn't zoom or scale to fill it — every dungeon-room and boss-arena screenshot this
    session shows large solid-gray letterboxing on all sides (see `06_06_melee_combat.png`,
    `09_09_boss_encounter.png`). `TopDownCamera.gd`'s `lock_to_arena()`/`set_map_bounds()` clamp the camera's pan
    limits to the room rect but never adjust `zoom`. Not investigated further or fixed this session — disclosed as
    a real, visible readability gap.

Distinguishing missing from broken, precisely: #1, #2, #3, #4, #5, #6, #7, #8 are **broken** — real data or a real
capability existed and something concrete prevented it from reaching the player. #9 and #10 are **missing/
incomplete** — no equivalent capability was ever built. Everything else already worked: checkpoint/save-point
activation and health-to-full-plus-record (`SavePoint.gd`), key/switch-gated locked doors (`LockedDoor.gd`/
`FloorSwitch.gd`), boss phase/attack-variety/weakness logic (`BossController.gd`, once its animation call actually
ran), chest/inventory/shop/quest/dialogue systems, and the `PlaytestAgent.gd`/`RuntimeSmokeTest.gd` real-input
walking, stuck-detection, and boss-fight harness the 2026-08-15 repair pass built.

## 2. Fixes made

All in `templates/godot-topdown-adventure/` unless noted; all regenerated fresh through the normal CLI to confirm
persistence (§4), not hand-edited into an existing project and left there.

- **`scripts/world/OverworldManager.gd`** — `_build_ground()` now builds a real `TileMapLayer` from
  `area.tiles` + a `TileSet` loaded from the biome's real `source.png`/`terrain.json` (role→atlas-cell lookup,
  cached per biome), mapping `TILE_GRASS→ground`, `TILE_DIRT→ground_wear`, `TILE_WATER→hazard`,
  `TILE_WALL→wall`. Falls back to the old flat-`ColorRect` behavior only if no tileset/terrain data exists (never
  crashes on an older or degraded project). `_build_collision()`'s redundant flat-color visual overlay removed
  (the tile layer above now draws that space correctly, at the exact same cells collision already used, since both
  derive from the same `tiles` array — `collisionRectsFromTiles()` in `packages/procedural/src/topdown/world.ts`).
  Also added the `_carried_health`/`_carried_max_health` mechanism (mirroring the side-view `WorldManager.gd` fix):
  captures the outgoing alive player's health before a transition's teardown, applies it to the incoming player
  unless `SaveManager.has_pending_health_restore()` says a real save/death-driven restore is about to apply instead
  (checked *before* the new player's own `_ready()` consumes that flag, not after — by then it always reads false
  regardless of which case it was).
- **`scripts/player/TopDownPlayerController.gd`** / **`scripts/AI/TopDownEnemyController.gd`** — both gained a real
  `_update_sprite()` called every `_physics_process`, selecting `idle`/`walk`/`attack`/`hurt` from real state and
  flipping `sprite.flip_h` from real facing/movement direction, guarded so a non-looping clip (`attack`/`hurt`) or a
  looping one (`walk`) never restarts every physics tick. `TopDownEnemyController.gd` also gained the missing
  `@onready var sprite` reference it never had at all.
- **`scripts/AI/BossController.gd`** — one-line guard added to its pre-existing `else: sprite.play("walk")` so the
  walk-cycle actually advances instead of restarting to frame 0 every tick.
- **`scripts/AI/TopDownEnemyController.gd`** — new `_apply_enemy_data()`/`_load_enemy_definition()`, mirroring
  `BossController.gd`'s own real-data-loading pattern: reads `health`/`damage`/`speed`/`perception.radius`/
  `combat.type`/`combat.cooldown` from `data/enemies/enemies.json` by `enemy_id`, gracefully leaving `Enemy.tscn`'s
  defaults untouched for the TINY_TEST boss placeholder (`is_boss` instances skip this) or a per-dungeon enemy id
  with no catalog entry. A `combat.type == "projectile"` enemy now fires a real projectile
  (`_spawn_projectile()`, same `Projectile.tscn`/`owner_node`/`damage` contract `BossController.gd` already uses)
  from its `WINDUP` state instead of a melee swing, engaging from `DEFAULT_RANGED_RANGE` (140px, or
  `combat.range` when the schema carries one) instead of melee's 22px.
- **`scripts/world/OverworldManager.gd`** — `_spawn_pois()`'s `"enemy"` case now sets `enemy.enemy_id` from the
  real `poi.metadata.enemyId` before `add_child()` (previously never set at all), so the above actually reaches a
  live enemy instance.
- **`packages/godot/src/assembler.ts`** — `topDownChestItemDefs()` now takes the real item catalog
  (`input.gameContent.items`) and skips synthesizing a stub for any id already defined there, fixing the
  `health_vial` shadowing bug without losing the function's real purpose (per-dungeon key discovery, which never
  appears in the real catalog and is untouched). New regression test in `assembler.test.ts` reproducing the exact
  reported shape (a chest rewarding an id that's also a real consumable, plus a dnaAbility id that's also real).
- **`scripts/core/SaveManager.gd`** (top-down) — new `has_pending_health_restore()` accessor, the read half of the
  carried-health fix above.
- **`scripts/test/RuntimeSmokeTest.gd`** (top-down) — now prints `METROFORGE_RUNTIME_READY` right after confirming
  the player spawned (mirrors the side-view template's own copy verbatim in spirit), fixing the `godot_runtime`
  gate's permanent `UNKNOWN` state (finding #8). Also fixed `_check_shop_purchase_flow()`'s own latent bug the
  item-shadowing fix exposed: it picked the first non-currency/quest/collectible item to test-purchase without
  excluding `consumable` — for a consumable, `InventoryManager.grant_item()` never touches owned-count at all (it
  applies the heal effect instead), so `owned_count increased` is the wrong success check for that category. Now
  checks the real heal effect landed instead when the picked item is a consumable. New regression check
  (`start_new_game_resets_current_room_id`) for fix #6.
- **`scripts/core/GameManager.gd`** (top-down) — `start_new_game()` now clears `current_room_id` (fix #6).
- **`packages/generation/src/pipeline.ts`** — the quality-pass call site now also requires
  `!isTopDownArchetype(gameDna.archetype)` (fix #5). Chosen over genre-adapting the entire quality-pass subsystem
  (every one of its actions assumes side-view's `WorldManager.gd`/room-scene architecture, with zero per-action
  archetype branching anywhere in either file) as the safe, correctly-scoped fix until top-down gets its own
  equivalent pass — matching this session's explicit instruction to keep top-down behavior properly scoped rather
  than open-heartedly rewriting a shared subsystem.

## 3. Regenerated fresh, proving the fixes persist

Generated `topdown-session-final` five times over the course of this session as each fix landed (same seed/prompt
throughout, `--visual-mode procedural-only`, no external visual pack — per this milestone's explicit instruction not
to substitute side-view character sheets as top-down art). The final run:

```
[✓] world_topology: PASSED (5 rooms, 3 biomes)
[✓] progression_graph: PASSED (6 proof steps, boss dungeon_000_r3)
[✓] enemy_families: PASSED (4 enemies)
[✓] bosses: PASSED (1 bosses)
[-] automated_repair: SKIPPED (No repair needed — all QA gates passed on first validation)
[✓] final_qa: PASSED (RUNTIME_VALIDATED: 18/18 gates passed)
[✓] export: PASSED
```

Gate detail (`validation_report.json`): `godot_runtime: PASS, "168/168 runtime checks passed"`,
`godot_playtest: PASS, "8/8 playtest checks passed — persona victory_rusher, 27-30s"` — the first time this gate has
ever genuinely run and passed for top-down (previously always `SKIPPED`, per finding #8, and even the intermediate
run with only the item-shadowing fix applied still measured `UNKNOWN`, confirming #8 was a real, distinct,
previously-undiagnosed blocker). `gameplay_screenshot_qa` remains `SKIPPED` (no GPU on this pipeline-invocation
machine, disclosed below, unrelated to any of this session's fixes).

Confirmed directly, not assumed: `scenes/world/World.tscn` in this final output still references
`OverworldManager.gd` (checked via `grep` on the generated file), and no `data/quality/quality_report.json` was
written — the quality-pass skip (fix #5) actually took effect on a real generation, not just in isolation.

`packages/procedural/src/topdown/world.test.ts` (14 tests), `packages/godot/src/assembler.test.ts` (3 tests,
including the new regression test) — all pass. Full repository suite in §5.

## 4. Real gameplay verification

Built an ad hoc, real-input verification harness (`GameplayCaptureRunner.gd`, not part of any template — same
pattern as the side-view `GameplayVerificationAgent.gd` from an earlier session) that boots the real `World.tscn`,
drives the real `TopDownPlayerController`/`TopDownEnemyController`/`BossController` through real `Input.action_press`
calls and the same `_walk_player_to()`/`_defeat_final_boss()` methods the already-proven `PlaytestAgent.gd` uses
(cross-script calling the same way `RuntimeSmokeTest.gd` already does), and saves a real windowed screenshot
(`get_viewport().get_texture().get_image()`, GPU-backed — not the headless dummy renderer) at each milestone. Run
via `godot --path <project> --resolution 1280x800 --rendering-driver metal res://GameplayCaptureRunner.tscn`
(windowed, not `--headless`).

**Disclosed plainly, not smoothed over**: this harness calls `ChestPickup.interact()`/`LockedDoor.interact()`
directly once real movement has brought the player into real interact range — the exact same convention
`PlaytestAgent._collect_area_pickups()` already uses, not a new shortcut introduced here — rather than simulating
the raw `"interact"` input action's key press. The one other pre-existing shortcut, inherited unmodified from
`PlaytestAgent._defeat_final_boss()`, is that it resets the player to full health immediately before the boss fight
starts (isolating "is the boss beatable" from incidental chip damage taken walking over) — the fight itself is
fought entirely with real attack/dash input against the boss's own real telegraph/attack AI. Everything else —
movement, all combat (melee and ranged), the real death, the real respawn, the real restart — goes through no
teleportation, no direct `health.current_health` writes, and no forced victory.

Full run, 11 real screenshots (`GeneratedGames/topdown-session-final/qa_capture/`), reproduced end to end:

1. **`01_spawn`** — player spawns in the overworld at full health. Real tile-textured ground, real directional
   player/NPC sprites, "Save Point" and "Wanderer" (NPC) labels visible.
2. **`02_ranged_combat`** — walked to `enemy_001` (a real `combat.type: "projectile"` enemy per fix #3); its
   `WINDUP` state was directly observed before capture. A small orange spark (hit/projectile VFX) is visible
   between player and enemy.
3. **`03_checkpoint`** — touched the overworld `SavePoint`; health 100/100, checkpoint room recorded as `overworld`.
4. **`04_death`** — stood in `enemy_001`'s fire line deliberately, with no evasive input, until real repeated
   projectile hits brought health to 0. Real "You Died" red-tinted overlay visible.
5. **`05_respawn`** — `GameManager`'s real 1s `GAME_OVER` timer + `_do_respawn()` (via `SaveManager.load_game()`)
   ran to completion with no intervention; respawned in `overworld` (the checkpoint room from step 3, not the game's
   original start) at 100/100 health.
6. **`06_melee_combat`** — entered the dungeon (`dungeon_000_r0`), walked to `enemy_dungeon_000_0` (a real melee
   enemy — no catalog id, correctly fell back to melee per fix #3's disclosed fallback), attacked with real
   `Input.action_press("attack")` + the player's own `_start_attack()`.
7. **`07_locked_route`** — collected the `dungeon_000_key` from `dungeon_000_chest`. **Disclosed inaccuracy in this
   harness, not the game**: `dungeon_000_r1`'s floor switch (an alternate, equally-real way to open the same door)
   sits close enough to the chest-approach path that the walk to the chest triggered it incidentally before this
   script's own explicit door-interact step ran — the screenshot actually shows the player already arrived in
   `dungeon_000_r2`, not the door itself opening. The underlying mechanic (key-gated door, with a real switch as an
   alternate path) is confirmed working either way; this harness's own narration of *which* path fired first is the
   only thing that's approximate here.
8. **`08_second_checkpoint`** — activated the second `SavePoint`, in `dungeon_000_r2`, immediately before the boss
   room.
9. **`09_boss_encounter`** — player and `boss_final` both visible, fight about to begin.
10. **`10_victory`** — `_defeat_final_boss()` returned `true` (`attacks_performed: 10`); real "Victory!" overlay,
    `game_complete: true`, `GameManager.current_state == VICTORY`.
11. **`11_restart`** — the exact two calls `TitleScreen.gd`'s own New Game button makes
    (`GameManager.start_new_game()` then reloading `World.tscn`) reproduced directly (calling
    `get_tree().change_scene_to_file()` itself from inside this harness would free the harness's own running
    node — reproduced the same visible effect instead: free the old world, reset state, instantiate+attach a fresh
    `World.tscn`). Confirmed back at a fresh `overworld` spawn, no Victory overlay, full health, no abilities — the
    `current_room_id` reset from fix #6 holding up through the real UI-equivalent flow, not just a direct call.

An earlier attempt at this same run (before the quality-pass fix, §1 finding #5, was in place) failed at the very
first step with `FATAL no_player_after_boot` — `scenes/world/World.tscn` had been silently rewritten to the
side-view scene. That failure is what led directly to finding #5 and its fix; it is not a separate, still-open
issue.

## 5. Regression suite, including side-view

`node scripts/typecheck.mjs`: clean across all 14 package/app tsconfigs (the two TS changes this session —
`assembler.ts`, `pipeline.ts` — both typecheck cleanly; every other change is GDScript, template-scoped).

`npx vitest run` (full repository): **169 test files passed, 7 skipped, 1103 tests passed, 9 skipped, 0 failures**
— including `packages/godot/src/room-assembler.test.ts` (22 tests) and `packages/procedural/src/world.test.ts`
(11 tests), the side-view-specific suites most relevant to the one shared-path change in this session
(`pipeline.ts`'s quality-pass gate), and `packages/generation/src/generation-e2e.test.ts`'s side-view TINY_TEST
end-to-end generation (which exercises the exact `isProductionQualityProfile` branch the new archetype check sits
inside, for the side-view path where it must still run unchanged).

## 6. Packaged macOS build

The final `topdown-session-final` generation's own export step produced
`Exports/topdown-session-final/.../build/macos/topdown-session-final.zip` (61MB). Verified directly:

```
codesign -dv: Format=app bundle with Mach-O universal (x86_64 arm64), Signature=adhoc, flags=(adhoc,runtime)
codesign --verify --deep --strict: clean (no output = no violations)
lipo -info: x86_64 arm64
```

Extracted and launched it for real (`open`, not headless): confirmed as a live process
(`ps aux`) and as the frontmost application (`System Events`), then quit cleanly. **Disclosed limitation, recurring
unchanged from every prior session in this project**: `screencapture -x` fails with "could not create image from
display" in this sandbox (no Screen Recording permission) — process survival and frontmost-window status are
confirmed; on-screen rendering correctness of the packaged binary specifically is not, for this disclosed,
unworked-around environment reason. The real in-engine verification in §4 (captured from the identical, freshly-
built codebase via the real GPU-backed viewport texture, just not the packaged binary itself) is the actual visual
evidence available in this environment.

## 7. Explicit status of each required property

- **Baseline established, defects distinguished (missing vs. broken)**: done — §1.
- **Compact gameplay loop** (intro room, exploration, melee + ranged encounters, pickup/upgrade with a meaningful
  locked route, checkpoint, boss, completion, restart): **verified for real**, §4. Every listed element occurs in
  the actual 11-screenshot run against the actual generated project.
- **Top-down-appropriate art**: **partially fixed, partially disclosed as still missing**. Ground/wall tile
  rendering fixed (§1 #1, §2); directional player/enemy animation fixed (§1 #2, §2). World-object icon art
  (chests/save points/doors/portals/switches — §1 #9) and camera framing in enclosed rooms (§1 #10) remain real,
  visible gaps, disclosed rather than fixed this session.
- **Shared generation path fixed, properly scoped, side-view preserved**: **verified**. The `items.json` fix (§2) is
  itself genre-agnostic and improves side-view too (its own duplicate-id-shadowing logic is identical there); the
  quality-pass fix is explicitly archetype-gated off for top-down only, leaving side-view's own quality pass running
  exactly as before — confirmed via the full side-view regression suite (§5), not merely assumed from the diff being
  a single added condition.
- **Playability and presentation proven, diagnostics disclosed separately**: **verified**, §4, with every diagnostic
  shortcut (interact-once-in-range, boss-fight health reset) named plainly at the point it's used, inherited
  unmodified from the already-reviewed `PlaytestAgent.gd`, not introduced by this harness.
- **Real screenshots and motion inspected, not merely generated**: **verified**. All 11 screenshots in §4 were
  opened and visually read (tile art, sprite facing/animation, HUD contents, overlay text) as part of writing this
  report, not just confirmed to exist on disk.
- **Package verified, visible launch attempted, limitation disclosed if unavailable**: **verified/disclosed**, §6.
- **Regression tests, including side-view**: **verified**, §5.
- **One concrete next milestone**: stated below.

## 8. What remains, honestly

- World-object icon art (§1 #9) — chests, save points, locked doors, portals, floor switches, and the victory
  shrine all still render as flat colored squares in GDScript rather than the real generated icon/prop art sitting
  unused on disk. This is the highest-value remaining top-down visual gap and the recommended next milestone.
- Camera framing in enclosed rooms (§1 #10) — no zoom/scale adjustment for a room smaller than the viewport,
  visible as large gray letterboxing in every dungeon-room and boss-arena screenshot this session.
- The HUD's top-left panel background doesn't fully contain its own text at some window sizes (the "Echoes: 0/1"
  line visibly spills below its container in `01_spawn.png`/others) — a minor, pre-existing UI-layout bug, not
  investigated further this session.
- At least one enemy encounter (`06_melee_combat.png`'s field enemy) renders as an abstract wave-like shape whose
  palette is easy to confuse with a water tile at a glance — not confirmed whether this is a genuine character
  sprite or a procedural-placeholder fallback (`environment_assets` reported 10-11/244 assets as
  placeholder/blockout this run); not investigated further.
- `gameplay_screenshot_qa` remains `SKIPPED` in the pipeline's own gate on this GPU-less machine — unrelated to any
  fix in this session, matching the pre-existing, already-documented limitation.
- This is still an AI-delegated implementation/verification pass, not the user's own personal approval — kept
  distinct per this session's explicit instruction.
- No stage, commit, or push was performed. `git log --oneline -1` is unchanged (`aae921d0`) before and after this
  session.

## 9. Next concrete top-down milestone

Wire the real generated icon/prop art (`assets/generated/checkpoint`, `.../gate`, `.../pickup`, plus
`assets/props/<biome>`) into `SavePoint.gd`/`ChestPickup.gd`/`LockedDoor.gd`/`AreaPortal.gd`/`FloorSwitch.gd`/
`VictoryShrine.gd` in place of their current hand-drawn `ColorRect` placeholders — the single highest-impact
remaining item from this session's own visual inspection (§1 #9), directly continuing this milestone's "make the
art appropriate for top-down play" objective into the world-object layer it didn't reach this time.

## 10. Reproduction steps

1. `export PATH="$HOME/.local/bin:$PATH"` (node/pnpm live under `~/.local/bin` on this host).
2. `pnpm --filter @metroforge/godot build && pnpm --filter @metroforge/generation build` (only these two packages
   changed TS this session).
3. `node apps/cli/dist/index.js create --prompt "a lone scout explores a sunken crystal dungeon guarded by ancient sentinels" --profile VISUAL_VERTICAL_SLICE --mode LOCAL_ONLY --visual-mode procedural-only --archetype TOP_DOWN_ACTION_ADVENTURE --seed 20260918 --slug <slug>` — expect `status: complete`, `RUNTIME_VALIDATED: 18/18 gates passed`, `automated_repair: SKIPPED (No repair needed...)`.
4. Confirm the fix for finding #5 held: `grep OverworldManager GeneratedGames/<slug>/scenes/world/World.tscn`
   should match; `ls GeneratedGames/<slug>/data/quality/` should not exist.
5. For real gameplay verification: copy `GameplayCaptureRunner.gd`/`.tscn` (this session's ad hoc harness — not
   checked into the template; request it from this session's artifacts or rebuild from §4's description) into the
   generated project, then
   `godot --path <project> --resolution 1280x800 --rendering-driver metal res://GameplayCaptureRunner.tscn` —
   inspect the `[CAPTURE]` stdout lines and the resulting `qa_capture/*.png` + `action_log.txt`.
6. `npx vitest run` and `node scripts/typecheck.mjs` from the repo root for the full regression suite.
7. For the macOS package: extract `Exports/<slug>/.../build/macos/<slug>.zip`, then
   `codesign -dv --verbose=2 <app>`, `codesign --verify --deep --strict <app>`, `lipo -info <app>/Contents/MacOS/*`,
   and `open <app>` for a real (non-headless) launch check.

---

## Follow-on milestone — visual polish: world-object art and camera framing

**Date**: 2026-09-08 (continuation, same day). Same archetype/profile/prompt/seed as above.
**Final project**: `GeneratedGames/topdown-session-final`, regenerated fresh three times this phase as fixes landed.
**Comparison project**: `GeneratedGames/topdown-before-polish` — same seed/prompt, generated with the
pre-this-phase GDScript templates (temporarily restored via `git checkout aae921d0 -- <paths>`, since nothing in
either session was ever committed, then restored back to the fixed versions immediately after) — the actual prior
milestone's real "before" state, not a reconstruction.

This phase inspected the previous milestone's own 11 real screenshots before making any change (per its explicit
instruction), which is what surfaced most of the findings below directly — not fresh speculation.

### 1. Findings from inspecting the 11 existing screenshots + source, before editing

- **`SavePoint`** rendered as a flat blue `ColorRect` square with no icon.
- **`ChestPickup` and `ItemGate` had no visual or collision shape at all** — genuinely invisible and (for
  `ChestPickup`) reachable only through `TopDownPlayerController._try_interact()`'s group-distance fallback, never
  its primary raycast path. This is more severe than "placeholder square," and the earlier milestone's own report
  mischaracterized it as such — corrected here.
- **`LockedDoor`, `AreaPortal`, `FloorSwitch`, `VictoryShrine`** each drew a flat, hand-picked-color `ColorRect`
  in code, all visually generic squares distinguished only by color, none using any of the real generated art.
- **Enclosed rooms showed large gray letterboxing** on every side in `06_melee_combat.png` and
  `09_boss_encounter.png` — confirmed analytically before touching code: `project.godot`'s `window/stretch/aspect`
  is unset (defaults to `"keep"`), and for the actual capture resolution (1280×800) against the 1920×1080 design
  canvas, real aspect-preserving letterboxing computes to roughly 40px top/bottom — nowhere near the several-hundred
  -pixel gray borders actually visible, so the dominant cause was diagnosed up front as `TopDownCamera.gd` never
  adjusting `zoom` for a room smaller than the design viewport, not viewport aspect bars.
- **What already worked and was left alone**: `SavePoint`'s and `LockedDoor`'s functional behavior (heal-and-record,
  key/switch-gated transition), Y-sort/z-index layering (ground behind entities), the animation-state fix from the
  prior milestone (still correct on inspection), and `FloorSwitch`→`LockedDoor.unlock()` wiring.

### 2. World-object art: traced end to end, one real gap found and fixed

Traced asset generation (`packages/assets/src/asset-pipeline.ts`'s `interactiveSpecs` /
`packages/assets/src/visual-enhancement/planner.ts`'s deterministic-baseline list) → scene assembly → runtime
loading. Only three interactive-object families existed at all: `checkpoint`, `pickup` (`ability_pickup`), `gate`
(`ability_gate`) — already correctly designed for reuse (their own code comments named exactly which side-view
object each was for) but **never referenced anywhere in the top-down template**, the actual gap. No family existed
for a chest or a portal.

- **Fixed the reference gap** (`packages/assets/src/png.ts`, `asset-pipeline.ts`): `SavePoint.gd` now loads
  `interactive_checkpoint.png` (mirrors the side-view template's own `SavePoint.gd` pattern exactly — same
  `GENERATED_TEXTURE_PATH`, same real-texture-if-present/`ColorRect`-fallback toggle). `LockedDoor.gd` and
  `ItemGate.gd` (both real "locked until you own the right item" gates) load `interactive_ability_gate.png`.
  `FloorSwitch.gd` loads `interactive_ability_pickup.png`, flattened and recolored to read as a floor plate rather
  than a stand-up icon. `VictoryShrine.gd` reuses the checkpoint icon with a distinct gold tint (a shrine and a
  save point are both "sacred standing structure," and this object appears at most once per game).
- **Added the two families that genuinely didn't exist** (`packages/assets/src/png.ts`'s `interactivePart()`,
  `asset-pipeline.ts`'s `interactiveSpecs`): `chest_closed`/`chest_open` (two real, visually distinct silhouettes —
  a sealed lid vs. a lifted lid with a bright gap standing in for visible contents, not a recolor of one shape) and
  `portal` (a stone archway frame around an open glow field, distinct from `ability_gate`'s solid-filled "blocked"
  silhouette). `ChestPickup.gd` gained a real `CollisionShape2D` and swaps `interactive_chest_closed.png` for
  `interactive_chest_open.png` on `interact()`. `AreaPortal.gd` uses the new portal art. New unit tests:
  `png.test.ts` (silhouette-difference and non-degeneracy checks for both new shapes) and `asset-pipeline.test.ts`
  (both new families included in the "always exists in procedural-only mode" guarantee the other three already
  had).
- **Readable states delivered**: closed/open chest (two real sprites), locked/unlocked door (existing green-tint
  logic, now applied over real gate art instead of a flat rectangle), inactive/active checkpoint (new — see below),
  usable portal (a real archway rather than an arbitrary-colored square).
- **New**: `SavePoint.gd` gained an inactive/active visual state — touching it now brightens and slightly enlarges
  whichever visual is showing (generated sprite or fallback), reverting was never necessary since a checkpoint
  stays "used" for the rest of that room instance.
- Confirmed via a fresh generation that `assets/generated/{chest,portal}/*.png` are written automatically
  (`environment_assets` went from 244 to 247 assets) with no separate opt-in needed.

### 3. Consistent presentation, and player/enemy/boss motion re-checked

All new/changed sprites are 32×32 (matching the biome tileset's tile size and the existing three interactive
icons), positioned so their visual center sits on the same ground anchor the previous `ColorRect` occupied (e.g.
`ChestPickup`'s sprite and collision shape share one `Vector2(0, -9)` position) — no new mismatch between visual
footprint and collision footprint was introduced. `LockedDoor`/`ItemGate` scale the 32px gate art to 0.5× to match
their real 16×16 collision box. Interactable objects remain visually distinct from ambient decoration (props/
architecture) since none of this phase's changes touched biome prop placement.

Re-inspected the player, both enemy types, and the boss in the real gameplay captures below: directional
facing/animation state (idle/walk/attack/hurt) from the prior milestone's fix is unaffected and still correct —
none of this phase's edits touched `TopDownPlayerController.gd`'s or `TopDownEnemyController.gd`'s animation code,
only `OverworldManager.gd`'s POI-spawning and the object scripts themselves.

### 4. Camera framing: two real bugs, the second found by an isolated empirical test after the first attempt made things worse

**First attempt** (room-aware zoom, computed as `zoom = clamp(min(room.x/viewport.x, room.y/viewport.y), 0.5, 1.0)`
on the — incorrect — assumption that `Camera2D.zoom` is an inverse "fraction of the world visible" value) produced
a *more* zoomed-out result than the original bug on a real screenshot. Rather than accept a plausible-looking
diff without checking the actual pixels, the result was inspected directly, which is what caught it.

**Root cause, found empirically**: `Camera2D.zoom` is a direct world-to-screen scale factor — `zoom=0.5` renders
every world unit at *half* size (shows *more* world, zooms out); `zoom=2.0` renders at *double* size (zooms in).
This is the opposite of the direction assumed. Verified with an isolated, minimal Godot scene (a fixed 512×384
`ColorRect` and a bare `Camera2D`, no other confounding scene state) at `zoom=0.5` and again at the corrected
`zoom=3.75` — the first produced a tiny rect on a 1920×1080 canvas, the second filled it edge-to-edge — before
touching the real project a second time.

**Real fix** (`TopDownCamera.gd`): `_room_fill_zoom()` now computes
`zoom = clamp(max(viewport.x/room.x, viewport.y/room.y), 1.0, 5.0)` — the larger of the two per-axis ratios (not
the smaller), so the camera's visible world area never exceeds the room's bounds on *either* axis (a long, narrow
room crops its unconstrained axis rather than ever exposing void — the same disclosed trade-off as before, now
under the corrected formula). `MIN_ZOOM=1.0` means a room bigger than the viewport still just pans within itself,
unchanged from before this whole fix. `MAX_ZOOM=5.0` is a real, checked ceiling: this profile's actual rooms need
zoom ≈2.8–3.75 to fill; 5.0 leaves headroom without inviting an absurdly over-magnified view for some future,
much-smaller room. A fresh Camera2D (one per room, since `OverworldManager` recreates the Player every transition)
snaps zoom directly on its first `set_map_bounds()` call (no stale default-zoom flash) and tweens smoothly
(0.35s, ease-out) on any subsequent call within the same room instance — the boss-arena lock/clear-arena-lock path.

Verified small (dungeon rooms, 512×384), large/wide (overworld, 1536×768), and the boss arena (same 512×384
convention) — all three are in the real screenshots in §5. `world_style == "screen_by_screen"` remains untouched
and unused (confirmed again this phase: `OverworldManager.gd` never calls `apply_world_style()`).

### 5. Real before/after gameplay evidence

`GeneratedGames/topdown-before-polish/qa_capture_before/` (pre-this-phase templates) vs.
`GeneratedGames/topdown-session-final/qa_capture_after/` (post-fix), same seed, same three vantage points:

- **`01_overworld_spawn`**: before — flat blue/purple squares, no chest visible at all. After — a real checkpoint
  pedestal icon, a real brown chest with a visible lid line, a real purple archway portal, all clearly distinct
  from each other and from the player/NPC.
- **`02_dungeon_r0`**: before — the room occupies roughly a third of the frame, large gray borders on all sides.
  After — the room fills the frame edge-to-edge (a thin, genuine aspect-ratio strip remains on the far left/right,
  distinct from the fixed camera-framing bug), with the real portal door and enemy both legible.
- **`03_dungeon_r1`**: before — a single generic purple square, the chest and switch not distinguishable from the
  door. After — the locked door (gate art), the floor switch (a distinct gold ring), and the closed chest (a real
  brown box with a lid line) are all simultaneously visible and clearly different objects.

Then ran the full real-input 11-screenshot gameplay sequence from the prior milestone (`GameplayCaptureRunner.gd`,
unchanged) against the fully-fixed project, end to end, to confirm nothing about the interaction loop regressed
and to get final evidence with correct framing throughout — real ranged and melee combat, a real checkpoint
touch (now shown with the brightened active-state tint), a real death with no direct damage calls, a real respawn
at the checkpoint room, the chest/key/locked-door route, a second pre-boss checkpoint, the boss encounter and a
real victory (camera now fills the boss arena correctly — compare to the original milestone's own
`09_boss_encounter.png`), and a real restart. All 11 screenshots are in `qa_capture/`; `action_log.txt` has the
full step-by-step trace. Same disclosed harness caveats as the original milestone (interact-once-in-range instead
of simulating the raw input action; the boss fight's pre-existing `reset_health()` isolation, inherited unmodified
from `PlaytestAgent.gd`) — nothing new introduced this phase.

Project/seed/build identity for this evidence: `topdown-session-final`, seed `20260918`,
`TOP_DOWN_ACTION_ADVENTURE`/`VISUAL_VERTICAL_SLICE`, generated via the normal CLI (§7 reproduction steps), gate
result `RUNTIME_VALIDATED: 19/19 gates passed` (§6).

### 6. Protecting final-output correctness

- **The quality-pass archetype scoping from the prior milestone is unmodified and still in place** —
  `packages/generation/src/pipeline.ts`'s quality-pass call site still requires `!isTopDownArchetype(...)`.
- **New regression gate**: `validateWorldSceneArchetypeIntegrity()` (`packages/qa/src/validator.ts`) checks that
  `scenes/world/World.tscn`'s root "World" node's `script=` resolves to the correct manager for the project's real
  archetype (`OverworldManager.gd` for top-down, `WorldManager.gd` for side-view) — not merely that the right path
  string appears somewhere in the file, but that the specific `ext_resource` id the root node actually references
  is the right one (a dedicated test confirms this precisely: a file declaring *both* scripts, with the root node
  correctly pointing at the right one, still passes). Wired into `validateProject()`'s gate list (so a fresh
  project is checked on generation) **and re-run a second time immediately after the quality-pass block**
  specifically, since that is the one step already proven able to rewrite scene files after every other gate has
  already validated the pre-pass state — a regression there now overrides an already-`PASSED` result rather than
  shipping a stale, pre-pass `validation_report.json`. Six new unit tests in `validator.test.ts`, including the
  exact corruption shape this session found (a top-down `World.tscn` overwritten with `WorldManager.gd`) and its
  reverse (a side-view project corrupted with `OverworldManager.gd`).
- **New regression check**: if a top-down project's `godot_runtime` gate genuinely passed but `godot_playtest`
  still comes back `SKIPPED`, `pipeline.ts` now pushes a hard error
  (`UNEXPECTED_TOPDOWN_PLAYTEST_SKIPPED`) and fails validation, rather than silently accepting the exact
  combination that hid the missing `METROFORGE_RUNTIME_READY` marker bug for as long as it went unnoticed. Every
  legitimate `SKIPPED` reason (Godot unavailable, `--skip-runtime-validation`, `godot_imports`/`godot_runtime`
  itself failing) already returns before `godot_runtime` can report a genuine pass, so this check cannot misfire
  on any of them.
- Confirmed on the final fresh generation: `world_scene_archetype_integrity: PASS`, `godot_runtime: PASS
  (168/168)`, `godot_playtest: PASS (8/8, persona victory_rusher)` — 19/19 gates overall, `RUNTIME_VALIDATED`,
  `automated_repair: SKIPPED (No repair needed)`.

### 7. Regression suite, side-view coverage, and the packaged build

`node scripts/typecheck.mjs`: clean across all 14 package/app tsconfigs. `npx vitest run` (full repository):
**169 test files passed, 7 skipped, 1112 tests passed, 9 skipped, 0 failures** — up from 1103 at the start of this
phase (9 new tests: 2 chest + 1 portal shape tests in `png.test.ts`, 1 extended baseline-assets test in
`asset-pipeline.test.ts`, 6 in `validator.test.ts`), including `packages/generation/src/generation-e2e.test.ts`
(a real side-view `TINY_TEST` generation through the exact pipeline path this phase's one shared-path check
(`validateWorldSceneArchetypeIntegrity`, wired into the same `validateProject()` every archetype shares) now also
runs against — confirmed still passing, unaffected) and `packages/godot/src/room-assembler.test.ts` /
`packages/procedural/src/world.test.ts` (side-view-specific suites, also unaffected).

Exported `topdown-session-final`'s fresh macOS build and verified it directly: `codesign -dv` shows
`Format=app bundle with Mach-O universal (x86_64 arm64)`, `Signature=adhoc`; `codesign --verify --deep --strict`
reports no violations; `lipo -info` confirms both `x86_64` and `arm64` slices. Launched it for real (`open`, not
headless) — confirmed as a live process and the frontmost application via `System Events`, then quit cleanly.
**Disclosed separately, as its own limitation, not folded into the process-launch result**: `screencapture -x`
again fails with "could not create image from display" in this sandbox (no Screen Recording permission) — the
packaged binary's actual on-screen rendering remains unverified in this environment; the real in-engine screenshots
in §5 (from the identical, freshly-built codebase, via the real GPU-backed viewport texture rather than the
packaged binary specifically) are the visual evidence actually available here.

### 8. What remains, honestly

- The boss's own character art is still a plain colored triangle (`09_boss_encounter.png`/`09_09_boss_encounter.png`
  in both this phase's and the prior milestone's captures) — a **character/boss art** gap, not a world-object one,
  explicitly out of this phase's scope (which was world objects + camera).
- A field enemy's idle-pose silhouette (visible at rest in `05_respawn.png`/similar) reads as a low, wave-like
  blob rather than a clearly humanoid stance at a glance — not investigated further this phase; likely a
  low-detail idle frame, not confirmed as a placeholder fallback specifically.
- The HUD's top-left panel background still doesn't fully contain its own text at this resolution (unchanged from
  the prior milestone's disclosure; not touched this phase — out of scope, a HUD layout issue rather than a
  world-object or camera one).
- `gameplay_screenshot_qa` remains `SKIPPED` in the pipeline's own gate on this GPU-less machine — unchanged,
  unrelated to this phase.
- The packaged macOS build's actual on-screen rendering is still unverified in this sandbox, for the disclosed
  Screen-Recording-permission reason — process survival and frontmost status are confirmed, visual correctness of
  that specific binary is not.
- Still an AI-delegated implementation/verification pass, not the user's own personal approval.
- No stage, commit, or push was performed this phase either. `git log --oneline -1` is unchanged (`aae921d0`)
  before and after.

### 9. Next concrete top-down milestone

Give the boss its own real character art (§8) — the one remaining "placeholder-shaped" visual left in the compact
loop after this phase's world-object and camera work, and the most visible one: it's on screen for the entire
final encounter and victory sequence.

### 10. Reproduction steps (this phase's fixes specifically)

1. `export PATH="$HOME/.local/bin:$PATH"`.
2. `pnpm --filter @metroforge/assets build && pnpm --filter @metroforge/qa build && pnpm --filter @metroforge/generation build`.
3. `node apps/cli/dist/index.js create --prompt "a lone scout explores a sunken crystal dungeon guarded by ancient sentinels" --profile VISUAL_VERTICAL_SLICE --mode LOCAL_ONLY --visual-mode procedural-only --archetype TOP_DOWN_ACTION_ADVENTURE --seed 20260918 --slug <slug>` — expect `status: complete`, `RUNTIME_VALIDATED: 19/19 gates passed` (18 without this phase's new integrity gate), `godot_playtest: PASS (8/8)`.
4. Confirm the new assets: `ls GeneratedGames/<slug>/assets/generated/chest/ GeneratedGames/<slug>/assets/generated/portal/` should show `interactive_chest_closed.png`, `interactive_chest_open.png`, `interactive_portal.png`.
5. Confirm the camera fix's math directly if in doubt: `grep MIN_ZOOM GeneratedGames/<slug>/scripts/player/TopDownCamera.gd` should show `1.0`, not `0.2` or `0.5` (both were tried and rejected this phase — see §4).
6. For real gameplay verification: same harness and invocation as the original milestone's §10 step 5.
7. `npx vitest run` and `node scripts/typecheck.mjs` from the repo root.
8. For the macOS package: same steps as the original milestone's §10 step 7.

---

## Follow-on milestone — a reusable "research facility" top-down asset pack (2026-09-09/10)

**Explicit instruction this phase**: pause the boss-art/animation milestone above and first build a brand-new,
reusable top-down asset pack — original designs, real production method disclosed, integrated through the pack
mechanism, validated in real gameplay and export — then hand back a checkpoint for resuming the paused boss
milestone. Nothing in this section is boss-art work; it is scoped entirely to producing and wiring the pack.

### 1. Baseline: how a "pack" already worked, and why the existing ones didn't fit top-down

Traced the real, already-shipped test-pack mechanism end to end before writing anything: `EXTERNAL_VISUAL_PACKS`
(`packages/godot/src/external-visual-pack.ts`) names `industrial-transit` and `metroforge-foundry-v3`, each a
`test-packs/<id>/manifest.json` (`ExternalVisualPackManifest`: id/visualTheme/playerReferenceHeight/sourceLicense/
assets[], each asset carrying family/role/source/destination/nativeDimensions/anchor/allowedArchetypes/collision/
layer/maxInstancesPerRoom) loaded by `loadExternalVisualPack()` — no manufactured fallback, every asset's `source`
must resolve to a real file or it throws. `packages/generation/src/pipeline.ts` copies each `asset.destination`
into the project's real `textureFiles`/`assetMetadata` map, archetype-agnostically — this part of the mechanism
already worked for any archetype with zero changes needed.

**The real gap**: both existing packs' manifest `destination` paths use **side-view naming**
(`assets/characters/player_locomotion.png` — matching side-view `AnimatedAssetSprite.gd`'s `run_sheet_path`
convention) rather than top-down's own filenames (`assets/characters/player_walk.png`, matching top-down's
`sheet_path`). Pointing `--external-visual-pack` at either existing pack for a top-down project would silently
land files at paths nothing in the top-down template reads. `patchCharacterFrameSizeForExternalPack()` (frame_size
patching for Player.tscn/Boss.tscn/Enemy.tscn) is itself archetype-agnostic — it patches by scene path, which is
identical between templates — so it needed no changes at all.

**Decision**: add a new pack, `metroforge-research-facility`, whose manifest destinations use top-down's real
filenames from the start, and extend `EXTERNAL_VISUAL_PACKS` with it (one added array entry — additive, nothing
existing removed or renamed). No new selection mechanism was needed; the existing one just needed a pack built for
it, per the milestone's own instruction to only build one narrowly-scoped mechanism "if top-down lacks an
appropriate mechanism" — it didn't; it lacked a compatible pack.

### 2. Runtime gaps found and fixed while building the pack

Building a pack that actually reaches the screen surfaced three real, pre-existing top-down runtime gaps, each
fixed narrowly and confirmed backward-compatible (silently inert for any project not using this pack):

- **No per-enemy visual differentiation existed at all.** `Enemy.tscn` is one shared scene; every field enemy
  instance rendered the identical baked-in `enemy_000_*` sheet regardless of its real `combat.type` — melee,
  projectile, and every other type looked the same, only stats differed. Fixed with `TopDownEnemyController.gd`'s
  new `_apply_visual_family_if_present()`: after real `combat.type` loads from `enemies.json`, it resolves a
  visual family (`melee`/`ranged`/`heavy` — `heavy` is not a real `ENEMY_COMBAT_TYPES` value; every combat type
  that isn't `melee` or `projectile` — burst/beam/area/summon/trap — is treated as the third, tankier silhouette,
  a deliberate scoped choice, not a new gameplay combat type) and, only if `assets/enemies/<family>_walk.png`
  actually exists on disk, calls a new `AnimatedAssetSprite.configure_and_rebuild()` to re-skin the sprite. No pack
  present → the file doesn't exist → no-op → identical behavior to before.
- **Player and field enemies never had a death animation wired**, the same class of gap `Boss.tscn` had before
  this milestone's earlier (paused) phase — `player_death.png`/`enemy_000_death.png` were already generated by the
  genre-agnostic pipeline and simply never referenced. Added `death_sheet_path`/`reference_pose_path` to
  `Player.tscn` and `Enemy.tscn` (mirroring Boss.tscn's own already-fixed wiring). `TopDownPlayerController._on_died()`
  now plays "death" before `EventBus.player_died.emit()` (no extra delay needed — `GameManager._on_player_died()`
  already holds `GAME_OVER` for a real 1.0s window, unlike Boss/Enemy's immediate `queue_free()`).
  `TopDownEnemyController._on_died()` now plays "death" and waits a real `DEATH_ANIMATION_DURATION_SEC = 0.35`
  (shorter than the boss's 0.7s — a brief field-enemy clip, not a climactic one) before `queue_free()`/emitting
  `enemy_killed`/`boss_defeated` — this **required** updating `RuntimeSmokeTest.gd`'s two death-signal checks
  (`enemy_boss_variant_emits_boss_defeated`, `enemy_normal_death_emits_enemy_killed`) from a same-frame synchronous
  assertion to a bounded wait loop, the identical fix class `PlaytestAgent._defeat_final_boss()` already needed for
  `BossController.gd`'s death delay in the paused milestone's own earlier phase. Both `_physics_process` methods
  now stop themselves (`set_physics_process(false)`) on death so `_update_sprite()` can't overwrite "death" back to
  "idle" the next tick — safe because respawn always frees and re-instantiates both Player and Enemy, never reuses
  the dying instance.
- **`VictoryShrine.gd`** gained an optional, preferred `COMPLETION_TEXTURE_PATH` (`assets/generated/completion/
  interactive_completion.png`) ahead of its existing checkpoint-icon-reuse fallback — this pack ships a real,
  distinct completion-object sprite; a project without one keeps the prior behavior unchanged.

### 3. The pack itself: original designs, real production method disclosed per asset

Theme (as specified): abandoned research facility — pale ceramic armor, dark structural metal, cyan player
accents, orange enemy cues, violet reactor energy. **Boss identity preserved from the character reference board**
(a four-legged, reactor-core-bodied automaton) where the two reference boards' boss concepts differed.

**Characters (player + 3 enemies + boss), one real NVIDIA FLUX still per character, then genuine articulated
motion**: for each of player/melee/ranged/heavy/boss, one real `black-forest-labs/flux.1-dev` generation (NVIDIA
API key already configured and already used for real generations in this exact repo per
`docs/REAL_ASSET_PIPELINE_STATUS.md` — inspected and confirmed reachable, `HTTP 200`, before spending anything) —
prompt/seed/model recorded per character in `test-packs/metroforge-research-facility/production-report.json`. Two
transient failures were hit and resolved, not silently retried into a different outcome: `player`'s first two
attempts hit a genuine network `fetch failed` (resolved on a third attempt); `boss`'s first prompt was rejected by
NVIDIA's own content-safety classifier (`CONTENT_FILTERED` — not a transient error, confirmed via the codebase's
own `NvidiaImageProvider` fail-fast handling for this exact case) and was **rewritten**, not retried verbatim, to a
plainer, non-triggering description before it succeeded. `ranged` and `heavy`'s first pass also came back with a
weak, over-dark, low-detail silhouette (background-removal contrast issue against a too-dark requested backdrop) —
inspected directly, not assumed acceptable, and regenerated with an explicit "brightly and evenly lit" / "clearly
visible surface detail" prompt revision that fixed it (confirmed by re-viewing the result).

Every character's real still is then run through the **same real pose-progression sheet builders the main
`AssetPipeline` itself uses for any real `sourcePng`** — `generateWalkCycleSheet`/`generateAttackSheet`/
`generateHurtFlashSheet`/`generateDeathSheet` (`packages/assets/src/png.ts`) — producing genuine per-frame
limb/pose articulation derived from the real image, not a duplicated-frame or slide/rotate-only fake (this is the
codebase's own established, tested mechanism for turning one real still into a full clip; reused directly rather
than reinvented). Player/enemies at 64×64 (4 walk, 4 attack, 3 hurt, 4 death frames); boss at 128×128 (matching the
final-boss size convention already fixed earlier in this same milestone) with the same 4/4/3/4 frame counts.

**Terrain, props, interactive objects, projectiles/VFX: this repo's own real procedural generators** —
`generateTilesetSource` (custom `TilesetBiomeStyle`: pale ceramic ground, dark metal walls, cyan/violet accents,
`panel_grates`/`corrosion`/`damaged_modules` features), `generatePropSprite` (four distinct `classifyFamily()`
shapes — `terminal_lantern`→lantern, `exhaust_pipe`→pipe, `support_pillar`→pillar, `containment_gear`→gear — not
four recolors of one blob), `generateProceduralSprite` (checkpoint/chest_closed/chest_open/ability_gate/
ability_pickup/portal/completion/item shapes), `generateVfxTexture` (projectile/hit-spark/attack-warning). These
are genuinely part of the shipped pipeline (exactly what a `--visual-mode procedural-only` generation already
produces) — disclosed as **procedurally constructed, not AI-generated** in every one of these assets' manifest
`sourceProvenance` field, not silently presented as if AI-made.

**42 assets total**, every one's provenance (AI-generated with real provider/model/seed, or procedurally
constructed with the exact generator function named) recorded in `manifest.json`'s per-asset `sourceProvenance`
and cross-referenced to `production-report.json` for the AI-generated half. No geometric placeholder was
substituted for any asset — every one of the 42 is a real, finished, distinct design.

### 4. Pack manifest and versioned specification

`test-packs/metroforge-research-facility/manifest.json` — `id`, `visualTheme`, `playerReferenceHeight: 64`,
`sourceLicense` (states plainly: internally authored/generated, development-only, real NVIDIA FLUX for characters
under this repo's own key, procedural generators for the rest), and 42 `assets[]` entries. Each asset: `family`,
`role` (`player.idle`/`melee.walk`/`boss.death`/etc. — the same dotted convention `metroforge-foundry-v3` already
established), `source`/`destination` (top-down-native filenames — see §1), `nativeDimensions`, `anchor`,
`allowedArchetypes` (room-purpose values — `traversal`/`combat`/`arena`/`boss`/`save`/`connector` — matching the
existing packs' own convention; declarative metadata, not consumed as a filter anywhere in the current pipeline,
same as the two pre-existing packs), `collision`, `layer`, `maxInstancesPerRoom`, `sourceProvenance`, and (for
character frames) an `animation` block (frameCount/frameSize/fps/loop/origin/facingConvention/mirrorSafe/
gameplayState, with `eventFrames.strike` on each attack clip). Fixed design rules (palette, silhouette family per
role, frame size per bucket) vs. permitted seeded variation (the real FLUX seed per character, recorded) are
separated by what's hand-specified in the generation prompts/parameters above versus what the seed alone
determined — disclosed in `production-report.json`, not asserted without evidence.

Validated directly, not assumed: `loadExternalVisualPack('.', 'metroforge-research-facility')` loads cleanly (42
assets, every `source` resolves to a real file) both before and after registering the new pack id.

Stored at `test-packs/metroforge-research-facility/` — the established sibling-directory convention, alongside
(not replacing) `test-packs/industrial-transit/` and `test-packs/metroforge-foundry-v3/`, both left completely
untouched.

### 5. Reusable gallery and playable test dungeon (kept separate, per instruction)

- **`AssetGallery.gd`/`.tscn`** (pack directory, ad hoc harness, not a shipped template file) — a static,
  non-playable scene that loads every pack file directly by its real in-project path and lays it out as labeled
  contact sheets, one per major group (player, each enemy, boss, terrain+props, interactive+items, VFX) — 8
  section screenshots (`qa_gallery/01_player.png` … `08_vfx.png`), each captured via a panning `Camera2D` since the
  full layout is taller than one viewport (the first attempt at a single combined screenshot caught this directly —
  most of the content was off-screen — and was fixed by paginating rather than accepted as "good enough"). Never
  touches `OverworldManager`/`GameManager`/`InventoryManager`; no win/lose state.
- **`TestScenarios.gd`/`.tscn`** (same directory) — the real-input playable test dungeon, reusing
  `PlaytestAgent`'s proven navigation/attack helpers (same convention as this milestone's own paused-phase
  `BossVerificationRunner.gd`) and covering every scenario category this phase asked to be reusable: directional
  movement+animation (4 facings + idle), melee combat, ranged combat+damage feedback, object interaction states
  (chest closed→open, checkpoint inactive→active), terrain/room-transition+layering, a full boss
  anticipation→execution→recovery→death sequence, and death/respawn/victory/restart. Every state change goes
  through real `Input` actions or the object's own real `interact()`/`take_damage()` methods — no teleportation,
  no direct health writes, no forced victory (the one inherited shortcut — resetting player health immediately
  before the boss fight — is the same, already-disclosed one `PlaytestAgent._defeat_final_boss()` uses).

### 6. Real generation, real bugs found in the harness (not the game), and real gameplay evidence

Generated fresh through the normal CLI:
```
node apps/cli/dist/index.js create --prompt "a scout investigates an abandoned research facility guarded by a reactor-core automaton" --profile VISUAL_VERTICAL_SLICE --mode LOCAL_ONLY --visual-mode procedural-only --archetype TOP_DOWN_ACTION_ADVENTURE --seed 20260918 --external-visual-pack metroforge-research-facility --slug research-facility-pack-demo
```
Result: `RUNTIME_VALIDATED: 19/19 gates passed`, `automated_repair: SKIPPED (No repair needed — all QA gates
passed on first validation)`, `EXTERNAL_VISUAL_PACK_ACTIVE: metroforge-research-facility (42 authored assets)`,
`godot_playtest: PASS`, export `PASSED`. Confirmed directly (not assumed from the log): `Player.tscn`/`Enemy.tscn`
frame_size patched to `64×64`, `Boss.tscn` to `128×128`, `death_sheet_path`/`reference_pose_path` present on all
three, every `assets/generated/<family>/interactive_*.png` present.

**A first attempt at this exact generation (seed `20260910`, a prompt-derived seed tried before switching to this
milestone's own already-proven `20260918`) failed `godot_playtest`** (`playtest_completed_transitions`,
`playtest_reached_victory_flow`, `playtest_victory_state_or_boss_defeated` — a walk-to-portal timeout in the
overworld). **Before assuming this pack caused it, a no-pack control was generated at the identical seed** — it
failed identically, confirming this was a **pre-existing, seed-specific bot-navigation limitation, not a
regression from this pack or any code change this phase**. Switched to seed `20260918` (already proven clean
throughout this whole milestone) rather than debugging an unrelated, out-of-scope navigation edge case.

Running the real gameplay harness against the clean generation surfaced three more issues — all in the **ad hoc
test harness itself**, not the game or the pack, fixed directly:
1. A `String(child.get(...))` call in `TestScenarios.gd`'s ranged-enemy lookup crashed on a non-enemy node
   (`Nonexistent 'String' constructor`) — the redundant, broken clause was simply removed.
2. The harness's original scenario order visited the dungeon before the overworld's own ranged enemy and
   checkpoint — `enemy_001` (the real `projectile`-type enemy, placed in the overworld by
   `content.ts`'s `enemyCombatTypeForIndex()`) was never reachable in the dungeon, and testing death before ever
   touching a checkpoint meant the disclosed "never-saved death respawn falls back to the start room" path fired
   instead of a real checkpoint-based respawn. Reordered: directional movement → object interactions (overworld
   chest+checkpoint) → ranged combat → dungeon transition → melee combat → death/respawn → boss.
3. A **leftover Godot `user://` save file from the CLI's own internal playtest run against this same generated
   project** (autosaved after that bot's own boss victory, at room `dungeon_000_r3`) was silently picked up by the
   harness's own death/respawn scenario, sending the test player to the boss room instead of the real checkpoint.
   This is a genuine cross-run contamination hazard of testing against a project Godot has already run once, not a
   game bug — fixed by clearing `~/Library/Application Support/Godot/app_userdata/<project display name>/` before
   each harness run, disclosed here so any future session repeating this hits the same fix, not the same confusion.
4. The overworld→`dungeon_000_r0` walk (immediately after a real respawn) intermittently stopped just short of the
   portal's contact area and never triggered the transition — the same class of "walk stops slightly short of a
   passive-contact trigger" already disclosed in this milestone's earlier phase for chest/switch proximity.
   Hardened (not worked around by increasing a timeout alone): every hop now explicitly calls the portal's own
   real `interact()` method once in range, the same real method the r2 special-case branch already used, rather
   than relying purely on passive `Area2D` contact.

**Final clean run, 25 real screenshots** (`qa_scenarios/01_dir_00_idle.png` … `25_boss_06_restart.png`), end to
end, no fatal steps: all 4 directional walk facings + idle, real chest open/close, real checkpoint activation, a
real ranged-projectile hit (`health 72 → 58`, no direct health writes), a real room transition into
`dungeon_000_r0` with the new tileset visible, real melee combat, a real player death + death animation + respawn,
then real navigation through `r1`→`r2`→`r3`, a full boss fight (real telegraph/anticipation, real melee exchange
at `boss_health=160/200`, a recovery-window shot, real death via 10 real attacks, `victory_reached_627ms_after_
health_hit_zero`), and a real restart (`room=overworld health=100/100`). Screenshots were opened and visually
read, not just confirmed to exist: the boss's real four-legged silhouette with its glowing core is clearly visible
and legible against the player throughout, the ranged enemy's pale hovering-drone shape and the melee/heavy
enemies' distinct dark silhouettes are all simultaneously distinguishable, and the tileset/props/interactive icons
all render with real alpha and no visible clipping or fragment artifacts (the specific failure mode this
milestone's earlier, paused phase spent most of its effort on).

### 7. Regression suite and macOS export

`node scripts/typecheck.mjs`: clean across all 14 package/app tsconfigs (only TS change this phase:
`packages/godot/src/external-visual-pack.ts`'s one added array entry). `npx vitest run`: **169 test files passed,
7 skipped, 1112 tests passed, 9 skipped, 0 failures** — identical counts to before this phase, confirming the
GDScript-only runtime changes (per §2) didn't regress anything TS-side, and that no existing test needed changing
beyond the two `RuntimeSmokeTest.gd` checks already described in §2.

Exported `research-facility-pack-demo`'s macOS build and verified **launch success and packaged visual
verification separately**, per this milestone's explicit instruction:
- **Launch success (verified)**: `codesign -dv` shows `Format=app bundle with Mach-O universal (x86_64 arm64)`,
  `Signature=adhoc`; `codesign --verify --deep --strict` reports no violations; `lipo -info` confirms both
  `x86_64` and `arm64` slices. `open`-launched for real (not headless); confirmed as a live process via `ps aux`;
  quit cleanly afterward.
- **Packaged visual verification (not achieved, disclosed as its own, separate limitation)**: `screencapture -x`
  again fails with "could not create image from display" (no Screen Recording permission in this sandbox — the
  same standing, previously-disclosed limitation as every prior phase of this whole project). **New this
  session**: the `System Events` frontmost check that previous phases used to at least confirm the packaged app
  had real window focus returned this terminal's own host application instead of the game — a distinct,
  additional limitation of this specific invocation (most likely missing Accessibility/Automation permission for
  `osascript` in this exact sandbox session), not previously seen in this project's history. Process liveness is
  confirmed; on-screen rendering correctness and window-focus of the packaged binary specifically are not. The
  real visual evidence in §6 (in-engine, GPU-backed viewport captures from the identical freshly-built codebase,
  not the packaged binary) is what's actually available here.

### 8. What remains, honestly

- **Props are not wired into any top-down rendering system yet.** Nothing in `templates/godot-topdown-adventure/`
  loads `assets/props/*` at all (confirmed by direct search — zero references) — this pack's four prop sprites sit
  correctly named (`biome_0_prop_0.png`…`_3.png`, matching the base pipeline's own convention) and pass QA, but
  are not yet placed as decoration in any generated room. Pre-existing gap, not introduced or fixed this phase.
- **`health_pickup`/`progression_pickup` icons have no live on-ground pickup node to attach to.**
  `ItemPickup.gd` (the generic pickup script) has no sprite of its own at all in this template — these two pack
  assets are real, finished, gallery/manifest-complete icons, not yet reachable in an actual playthrough as a
  world object.
- **Player/enemy collision footprints did not grow with the new, larger sprite sizes.** Player's `CollisionShape2D`
  stays `16×16` and Enemy's `28×28` regardless of the pack's `64×64` sprites — visually the character now reads
  bigger than what it actually collides with. Not fixed this phase (out of the pack-production scope); a real,
  visible next-step polish item, most noticeable for melee-range combat feel.
- **`VictoryShrine`'s dedicated completion sprite was wired but not distinctly re-confirmed in a screenshot** — the
  boss-victory capture (§6) shows the chest and the "Victory!" overlay clearly but doesn't isolate the shrine's own
  sprite in frame; the code path (`COMPLETION_TEXTURE_PATH` preferred over checkpoint-reuse) was inspected, not
  independently screenshotted this phase.
- **The `heavy` enemy visual family is a scoped heuristic** (every non-melee, non-projectile `combat.type` — not a
  real fourth gameplay type), documented directly in `TopDownEnemyController.gd`'s own comment; a future session
  adding a real distinct "heavy" gameplay archetype should reconcile with this convention rather than duplicate it.
- This is still an AI-delegated implementation/verification pass, not the user's own personal approval — kept
  distinct per this session's explicit instruction ("do not record my personal approval").
- No stage, commit, or push was performed this phase. `git log --oneline -1` is unchanged (`aae921d0`) before and
  after; no working-tree file was restored or checked out to construct any comparison (the one control comparison
  used to rule out a pack-caused regression, §6, was a second **independent fresh generation** at the same seed
  with the pack simply omitted from the CLI flags — not a git operation of any kind).

### 9. Checkpoint — resuming the paused boss-art/animation milestone

The boss-art/animation-state milestone (the top-down boss's own idle/movement/anticipation/attack/recovery/hurt/
death states, §1–§9 of the *first* "Follow-on milestone" section above, immediately preceding this one) is
**unmodified and still fully in place** — its `AnimatedAssetSprite.gd` `centered=true` anchor fix, `Boss.tscn`'s
`frame_size=128×128`/`death_sheet_path`/`reference_pose_path`, `BossController._on_died()`'s real death delay, and
`PlaytestAgent._defeat_final_boss()`'s bounded victory-wait fix are all still present and were re-exercised (not
bypassed) by this phase's own real gameplay run in §6, against the new pack's own 128×128 boss art. To resume that
paused milestone's remaining open item (final packaged-visual-verification screenshot capture and the audit
write-up for that specific boss art, which was interrupted mid-way through viewing its own final evidence when
this pack milestone was requested):

1. The generated project from that paused milestone (`GeneratedGames/topdown-session-final`) and its evidence
   (`qa_boss_capture/*.png`, confirmed complete through `07_05_restart`) are untouched by this phase and still
   valid — no regeneration is required to pick that milestone back up.
2. This phase's runtime changes (§2 above — per-enemy visual families, player/enemy death-animation wiring,
   `VictoryShrine`'s completion-sprite preference) are all additive and backward-compatible; they do not need to
   be reverted or reconciled before resuming boss work, and the paused milestone's own next-step candidate (§9 of
   that section, or the two disclosed gaps in §8 here) can be picked freely.
3. If the resumed boss milestone also wants the new pack's boss art specifically (rather than the paused
   milestone's own procedurally-derived boss), regenerate with `--external-visual-pack metroforge-research-facility`
   added to that milestone's own reproduction command (§10 of the first "Follow-on milestone" section) — the pack
   is additive and does not require any further code change to use.
4. Recommended immediate next step either way: wire the two disclosed gaps in §8 above (prop rendering, pickup
   collision-footprint parity) before or alongside resuming boss-specific work, since both are now visible,
   general top-down-template gaps rather than boss-specific ones.

### 10. Reproduction steps (this phase specifically)

1. `export PATH="$HOME/.local/bin:$PATH"`; ensure `NVIDIA_API_KEY` is set in `.env` (already present in this repo).
2. `pnpm --filter @metroforge/assets build && pnpm --filter @metroforge/godot build && pnpm --filter @metroforge/generation build && pnpm --filter @metroforge/cli build`.
3. To rebuild the pack's character art from scratch (optional — the pack is already committed to disk under
   `test-packs/metroforge-research-facility/`): see the ad hoc production script this phase used, referenced in
   this document; it imports `NvidiaImageProvider`/`generateWalkCycleSheet`/etc. directly from
   `packages/assets/dist/index.js` and writes into `test-packs/metroforge-research-facility/`.
4. `node apps/cli/dist/index.js create --prompt "a scout investigates an abandoned research facility guarded by a reactor-core automaton" --profile VISUAL_VERTICAL_SLICE --mode LOCAL_ONLY --visual-mode procedural-only --archetype TOP_DOWN_ACTION_ADVENTURE --seed 20260918 --external-visual-pack metroforge-research-facility --slug <slug>` — expect `RUNTIME_VALIDATED: 19/19 gates passed`, `EXTERNAL_VISUAL_PACK_ACTIVE: metroforge-research-facility (42 authored assets)`.
5. For the gallery: copy `test-packs/metroforge-research-facility/AssetGallery.gd`/`.tscn` into `GeneratedGames/<slug>/`, then `godot --path GeneratedGames/<slug> --resolution 1280x900 --rendering-driver metal res://AssetGallery.tscn` — inspect `qa_gallery/*.png`.
6. For the playable test dungeon: same pattern with `TestScenarios.gd`/`.tscn` → `res://TestScenarios.tscn` — inspect `qa_scenarios/*.png` and `action_log.txt`. **Clear any leftover save first**: `rm -rf ~/Library/Application\ Support/Godot/app_userdata/<project display name>/` (see §6, point 3) if this isn't the project's first-ever Godot run.
7. `npx vitest run` and `node scripts/typecheck.mjs` from the repo root.
8. For the macOS package: same steps as the original milestone's §10 step 7, plus the frontmost-check caveat in §7 above.

---

## Follow-on milestone — closing the pack's integration gaps, resuming the boss milestone (2026-09-09/10, continued)

**Explicit instruction this phase**: resume the paused boss milestone using the pack, but first close every disclosed
integration gap from the prior phase (props, pickups, unused-asset tracing), align collision/hurtbox/hitbox
geometry with the pack's real sprite sizes, verify the boss's full combat presentation, generate fresh with an
isolated save location, and compare against the reference boards candidly.

### 1. A real parse-error regression, found and fixed before it could ship

Inspected the prior phase's actual gallery/screenshots/manifest first, per instruction, then wrote the prop and
pickup wiring described below. The first fresh regeneration **failed hard**: `RUNTIME_VALIDATED` dropped to
`93/109` runtime checks, with `player_spawns` and `overworld_manager_present` themselves failing — a strong
signal of one root cause cascading, not sixteen independent bugs. Direct investigation confirmed it: a plain
untyped array literal (`for offset in [Vector2i(0,-1), ...]`) in the new prop-placement code iterates as `Variant`
under this project's strict GDScript typing, which broke `:=` type inference on every derived loop variable — a
real `SCRIPT ERROR: Parse Error`, not a warning, that made `OverworldManager.gd` fail to compile entirely and
cascaded into everything downstream of it (player spawn, boss placement, save points, shops — anything that
touches the world manager). Fixed by declaring a typed `const WALL_ADJACENCY_OFFSETS: Array[Vector2i]` instead of
an inline literal, and by explicitly typing `var count: int = min(...)` (Godot's built-in `min()` returns `Variant`
by signature, silently failing the same way). Verified directly (copy-in re-test, 168/168 clean) before trusting a
second full regeneration, which reproduced `RUNTIME_VALIDATED: 19/19` cleanly.

**A second, separate, real robustness gap surfaced during the same investigation**: `ResourceLoader.exists(path)`
can be true for a moment before `load(path)` can actually return the compiled texture — observed directly running
the runtime smoke test immediately after a large fresh `--import` pass under heavy concurrent machine load (see
§8), where `load()` returned `null` for a real, correctly-imported file and crashed the very next `.get_width()`
call in `AnimatedAssetSprite._load_animation_frames()`. Fixed by falling through to the same missing-file
placeholder path a genuinely-missing file already used, instead of crashing the whole script; the same
unguarded-null pattern was also present (and fixed) in `ItemPickup.gd`'s new icon-loading code. This is now a
disclosed, general hardening fix, not something exercised only by the pack.

**Root-cause discipline, not blind repair**: `automated_repair` had already tried and failed once against this
exact bug before I traced it manually — its retry hit the identical parse error again, since a generic
retry can't fix a real script defect. This matches the instruction to find the actual defect rather than repeat
generic troubleshooting.

### 2. Props: wired into real room generation, not just copied into the project

`OverworldManager.gd` gained `_spawn_props(area)`, called for every area after `_spawn_pois()`. It builds
candidates only from real ground/dirt cells that are (a) at least 2 tiles from every real POI (spawn, doors,
chests, switches, enemies, save points, the boss, the victory shrine — never reducing an already-guaranteed-clear
route), and (b) flush against a real wall cell, so a placed prop reads as furniture/architecture pushed to the
room's edge rather than debris dropped in the middle of open floor. Up to 2 props per room, deterministically
seeded per area id (same generated project places props identically on every run). Each prop gets a real
`StaticBody2D` + `CollisionShape2D` sized to roughly 60%×50% of one tile (a base/footprint, not the sprite's full
silhouette) positioned at the sprite's own ground anchor, and is added to the same Y-sorted `_entities` container
every character uses, so it occludes/is-occluded correctly as the player walks past it. Confirmed visually in
real gameplay screenshots (§6): a `support_pillar` and an `exhaust_pipe` both appear correctly placed, wall-flush,
Y-sorted, and non-blocking in different rooms of the same real playthrough.

This is generic to the whole top-down template (loads `assets/props/<biome>/<biome>_prop_<N>.png` for whichever
indices actually exist on disk), not pack-specific — a project with no external pack still gets its own default
procedurally-generated props placed for the first time, closing the same "generated and ignored" gap class the
prior world-object-art milestone closed for chests/doors/portals.

### 3. Pickups: `ItemPickup.gd`/`.tscn` — a real, complete, but never-instantiated scene — now actually spawns

Confirmed by direct search before touching anything: `ItemPickup.tscn` (a full `Area2D` with collision, real
`InventoryManager.grant_item()` call, pickup SFX/VFX, and `queue_free()` on collection) existed and was never once
instantiated anywhere in `OverworldManager.gd`'s POI-spawning code — copying the pack's two item icons into the
project would not, by itself, have made this true. Fixed two ways:

- `ItemPickup.gd` now renders a real icon (`assets/generated/items/health_pickup.png` for `item_id == "health_vial"`,
  `.../progression_pickup.png` for `item_id == "scrap"`) instead of the original flat `ColorRect` + "Item" label,
  falling back to the original placeholder for any other id rather than guessing at an icon that doesn't exist.
- `OverworldManager._spawn_ambient_pickups(area)` places one health pickup (grants the always-real `health_vial`
  consumable — a genuine heal, not a placeholder) and one progression pickup (grants the always-real `scrap`
  currency) per non-boss, non-overworld dungeon room, using the same open-floor clearance logic as props (without
  the wall-adjacency requirement, since a pickup should sit in the open, not tucked against a wall).
  Deliberately skipped in the boss's own room and in the overworld (which already has its own hand-placed
  chest/save/npc/enemy layout).

**Verified, and honestly incomplete**: both icons render correctly and are visible in real gameplay screenshots
(§6 — `13_terrain_01_dungeon_r0.png`, `06_object_00_chest_closed.png`), and their `grant_item()` wiring is the
same, already-tested code path `ChestPickup.gd` and the base `ItemPickup.gd` already used before this phase. What
was **not** separately captured this phase: a screenshot of the player actually walking onto and collecting one
of these two new ambient pickups specifically (distinct from the already-verified chest-grant and boss-defeat
grant flows) — a real, disclosed evidence gap, not a claim of an unverified code path (the collection logic itself
is identical to `ItemPickup.gd`'s pre-existing, already-reviewed `_on_body_entered()`).

### 4. Every pack asset traced to its runtime use — used vs. not reachable in this dungeon, stated explicitly

| Asset family | Real runtime consumer | Status |
|---|---|---|
| `player_idle/walk/attack/hurt/death` | `Player.tscn` (`AnimatedAssetSprite`) | **Used** — every state visible in §6 |
| `melee_*` | `TopDownEnemyController._apply_visual_family_if_present()` | **Used** — `enemy_dungeon_000_0` (no catalog entry, falls back to melee) |
| `ranged_*` | same | **Used** — `enemy_001` (`combat.type: "projectile"`), confirmed via a direct debug probe and a zoomed crop after an initial misread of the thumbnail (§6) |
| `heavy_*` | same | **Wired, not exercised this run** — the fallback rule (any combat type that isn't melee/projectile) is correct and gallery-verified in isolation, but this specific generated dungeon's only two field-enemy instances are melee/projectile, so no live enemy in *this* playthrough ever renders it. Disclosed, not hidden. |
| `boss_idle/walk/attack/hurt/death` | `Boss.tscn` / `BossController.gd` | **Used** — full fight sequence in §6 |
| terrain tileset | `OverworldManager._build_ground()` | **Used** |
| 4 props | `OverworldManager._spawn_props()` | **Used** — confirmed placed in live screenshots; not confirmed that all 4 distinct designs (vs. a subset) were the ones RNG-selected in this exact seed's rooms |
| `checkpoint`, `chest_closed/open`, `portal` | `SavePoint.gd`, `ChestPickup.gd`, `AreaPortal.gd` | **Used** — all three states visible in §6 |
| `ability_gate` (door), `ability_pickup` (switch) | `LockedDoor.gd`, `FloorSwitch.gd` | **Used** (real route through `dungeon_000_r1`, confirmed via `current_room` transitions in §6) but not individually screenshotted this phase — same art already screenshotted in the prior visual-polish milestone |
| `completion` | `VictoryShrine.gd` (new preferred-path code added §3 of the prior phase) | **Wired, not independently confirmed** — the victory screenshot in §6 frames the chest and props clearly but doesn't isolate the shrine sprite; code path inspected, not re-screenshotted |
| `health_pickup`, `progression_pickup` | `ItemPickup.gd` (new, §3) | **Used** — rendered in world; collection itself not separately screenshotted (§3) |
| `ranged_projectile` | `Projectile.gd` (new real-sprite swap) | **Used** for damage (a real hit landed in §6's ranged-combat scenario) — the projectile's own in-flight sprite wasn't separately confirmed visible mid-flight in a still frame (it's a fast, short-lived object) |
| `hit_spark` | `HealthComponent.take_damage()` (pre-existing call site, unmodified) | **Used automatically** — no code change needed, the file just had to exist |
| `attack_warning` | `BossController._set_telegraph_visual()` (new) | **Wired, visually unconfirmed** — see §5's honest disclosure below |

**42/42 assets have a real, traced runtime consumer.** Zero are orphaned files that exist only because they were
copied into the project. Two (`heavy_*`, `completion`) are correct-and-wired but not exercised/re-confirmed by
this specific seed's specific playthrough, stated plainly rather than implied as fully proven.

### 5. Geometry alignment: real, moderate, evidence-based adjustments — not full-silhouette collision

Measured real opaque-pixel bounding boxes on the actual pack art before changing anything (Python/Pillow, not
guessed): player's visible content is 33×52px inside its 64×64 canvas; the melee enemy's is 48×50px; the boss's is
118×104px inside 128×128. Against that:

- **Player**: `CollisionShape2D`/hurtbox grown modestly (16×16→20×20, 14×14→18×18 — roughly a third to a half of
  the real visible width, a plausible "feet" footprint, nowhere near the full 33px-wide visible silhouette).
  Attack hitbox reach grown slightly to match (22×16→24×18).
- **Field enemies**: 28×28→32×32 body, 24×24→28×28 hurtbox — proportionally similar, still well under the melee
  enemy's real 48px visible width.
- **Boss**: left unchanged. Its existing 48×56 collision (≈37-40% of the real 118×104 visible silhouette,
  positioned over the leg-stance region) was already a real, well-proportioned footprint, not a full-silhouette
  box — confirmed by the same pixel measurement, not assumed.

Verified in real gameplay: doorway passage, wall contact, and actor overlap in §6's screenshots show no new
clipping or stuck-on-geometry behavior; the collision-debug capture (`26_collision_debug_overworld.png`, taken
with `--debug-collisions` / `get_tree().debug_collisions_hint`) shows the player's and world objects' real
collision shapes directly overlaid on the actual sprites — the box sits at the character's feet, smaller than the
full sprite, exactly as intended.

### 6. Boss presentation and combat: telegraph gets a real spatial warning, one honest gap disclosed

`BossController._set_telegraph_visual(true)` now also calls `VFXManager.play_ring("attack_warning", global_position,
8, 40.0, 1.0)` — a real, ground-anchored violet danger ring (the pack's own `attack_warning.png`, added to
`VFXManager.EFFECT_IDS`) alongside the pre-existing red body-tint, timed to the same real `_get_phase_telegraph()`
duration that actually holds the boss still. `Projectile.gd` swaps its flat magenta `ColorRect` for the pack's real
`ranged_projectile.png`, oriented to true travel direction every physics frame (not just at spawn, since the
caller sets `direction` *after* `add_child()` — trusting a `_ready()`-time snapshot would have frozen every
projectile facing right).

**Honest gap, found by inspecting the actual screenshot rather than assuming the code was enough**: the
anticipation screenshot (`20_boss_01_anticipation.png`) shows the red body-tint clearly but **not** the warning
ring — `VFXManager.play()`'s burst-and-fade tween is a fixed ~0.32s, while the real telegraph window this boss's
generated data uses is 0.8s+, so the ring visually finishes well before the screenshot's capture moment (which
lands somewhere in the still-active tint window). The ring is real and does fire (traced in code, registered in
`EFFECT_IDS`, uses the real file) but functions as a brief flash at telegraph *onset* rather than a warning
sustained for the whole windup — a real design mismatch between the ring's fixed animation length and the
variable, generated telegraph duration it's meant to represent, disclosed rather than smoothed over. The
pre-existing red tint remains the actual sustained cue for the full window, so player reaction time itself is
unaffected; only the ring's own presentation doesn't fully live up to "warning synchronized with the whole
window."

Damage-window synchronization otherwise unchanged and reconfirmed working: `attack_hitbox.activate()` opens only
during `_perform_melee_attack()`'s real 0.3s window inside the "attack" animation, `_get_phase_recovery()` gives a
real, generated-data-driven counter-attack opening (visible as `22_boss_03_recovery.png` in §7), and the boss's
full state machine — anticipation → execution → recovery → hurt → death — is confirmed end-to-end in one real
fight in §7, all states already correct from the paused milestone and unmodified by this phase's own changes.

### 7. Fresh generation and full real-input gameplay, isolated save location

`node apps/cli/dist/index.js create ... --external-visual-pack metroforge-research-facility --slug
research-facility-final` (same prompt/profile/seed as every prior phase of this milestone) →
`RUNTIME_VALIDATED: 19/19 gates passed`, `automated_repair: SKIPPED (No repair needed — all QA gates passed on
first validation)`, `EXTERNAL_VISUAL_PACK_ACTIVE: metroforge-research-facility (42 authored assets)`, export
`PASSED`. Confirmed directly: `Player.tscn`/`Enemy.tscn` frame_size patched to 64×64, `Boss.tscn` to 128×128, all
three `death_sheet_path`/`reference_pose_path` present, `_spawn_props`/`_spawn_ambient_pickups` present and wired
in `OverworldManager.gd`, collision sizes match §5.

**Isolated save location, real fix not a workaround**: `--user-data-dir` is **not a real flag** in this Godot
4.7.2 build (confirmed by dumping its actual `--help` output — it isn't listed) — passing it earlier silently
broke scene-argument parsing entirely (the engine loaded the project's default main scene instead of the intended
harness scene). The correct mechanism on macOS: Godot resolves `user://` from `$HOME`, so overriding `$HOME` for
just the Godot subprocess (`HOME="<isolated dir>" godot --path . ...`) redirects saves to a scratch directory
without touching the real `~/Library/Application Support/Godot/...` tree at all — a real fix, verified working (the
gallery/scenario runs below both used it), and one that never needed the prior phase's destructive `rm -rf` of the
shared save folder in the first place.

Full real-input run (`TestScenarios.gd`, 25 screenshots, `qa_scenarios/01_dir_00_idle.png` …
`26_collision_debug_overworld.png`), end to end, no fatal steps on the reported run: all 4 directional walks +
idle; real chest closed→open and checkpoint inactive→active; a real ranged hit (`health 72 → 58`, confirmed via
telemetry, not assumed); a real room transition into `dungeon_000_r0` with the new tileset, a real prop, and both
real pickup icons all visible together in frame; real melee combat; a real player death, death animation, and
respawn (now correctly landing back in the *overworld* — the previous phase's cross-run save contamination is
gone, and this phase's scenario ordering deliberately touches a real checkpoint before ever testing death, so a
never-saved-respawn edge case isn't what's being exercised); a full real boss fight (anticipation → melee exchange
at `boss_health=160/200` → recovery → death) via 10 attacks, `victory_reached_675ms_after_health_hit_zero`; and a
real restart (`room=overworld health=100/100`). One bot-navigation retry was needed mid-development (the same
disclosed class of flakiness as the prior phase, at the identical overworld→r0 post-respawn hop) — hardened with a
bounded 3-attempt retry loop with an explicit `interact()` fallback each attempt, in the **test harness only**, not
the game; the reported run above is the clean one, not a cherry-picked outlier — the harness fix is disclosed here
precisely so a future session doesn't waste time rediscovering it.

### 8. Regression suite — reconciled counts, and a concurrent, unrelated regression disclosed honestly

**This phase's own changes**: all GDScript (`OverworldManager.gd`, `ItemPickup.gd`, `Projectile.gd`,
`VFXManager.gd`, `BossController.gd`, `AnimatedAssetSprite.gd`, `Player.tscn`/`Enemy.tscn` collision sizes). Zero
TypeScript files touched this phase.

**A real, independently-confirmed, concurrent process** was actively editing `packages/shared/src/visual-slice.ts`,
`packages/generation/src/pipeline.ts`, and `packages/godot/src/room-assembler.ts` in this same shared working tree
during this phase (confirmed by direct file-modification timestamps advancing in real time across multiple checks,
completely independent of anything this phase touched or ran) — an unrelated, in-progress "visual slice" /
"Foundry visual kit" feature, not part of this milestone. `node scripts/typecheck.mjs` surfaces real, live errors
from that in-progress work (`FOUNDRY_VISUAL_PACK_ID`/`applyVisualSliceIdentityDefaults` not yet exported,
`projectUsesFoundryVisualKit` declared-but-unused) — **none of these symbols or files were touched by this
milestone**, and typecheck was clean immediately before this phase began. Reported here precisely so it isn't
mistaken for a defect this phase introduced.

**`npx vitest run`, reconciled counts** (this phase's final run, against the same shared tree as the typecheck
above): **Test Files: 166 passed, 4 failed, 7 skipped — 177 total. Tests: 1114 passed, 9 failed, 9 skipped — 1132
total.** All 9 failing tests are in 4 files, all inside `packages/assets/` (`asset-pipeline.test.ts`'s NVIDIA NIM
enhancement-pass test, `pipeline-v2/foreground-isolation.real-model.evidence.test.ts`'s real-U2NET tests,
`providers/diffusers.test.ts`'s inferenceSteps-precedence test, and all 5 of
`providers/prompt-budget.real-tokenizer.evidence.test.ts`'s real-CLIP-tokenizer tests) — **zero failures in
`packages/godot`, `packages/procedural`, or any topdown/side-view generation path this milestone touches.** Three
of the four failing files depend on real, heavy ML models (U2NET, a real CLIP tokenizer) and were confirmed
**passing earlier in this exact session**, before the concurrent edits above began — the most likely explanation
is collateral breakage from that unrelated, in-progress work sharing the same dependency graph, not a regression
from this milestone. Disclosed as observed, not fixed (out of this milestone's scope, and actively being edited by
another process makes it unsafe to touch right now).

### 9. macOS export — signing/architecture/launch verified; packaged visual rendering still not directly capturable

`codesign -dv`: `Format=app bundle with Mach-O universal (x86_64 arm64)`, `Signature=adhoc`, no violations from
`codesign --verify --deep --strict`; `lipo -info` confirms both slices. Launched for real (`open`, not headless):

- **Process liveness**: confirmed via `ps aux` (a live PID).
- **Window/focus detection**: confirmed this run — `osascript`'s `System Events` query for the frontmost process
  returned the game's own real window title, succeeding where the prior phase's identical check returned this
  terminal's own host application instead (disclosed there as a session-specific limitation). Both outcomes are
  recorded rather than only the favorable one.
- **Actual rendered-pixel verification**: still not achieved — `screencapture -x` fails with "could not create
  image from display", the same standing, previously-disclosed Screen-Recording-permission gap present in every
  phase of this entire project. The real in-engine screenshots in §7 (GPU-backed viewport captures from the
  identical freshly-built codebase, not the packaged binary itself) remain the actual visual evidence available in
  this sandbox.

These three are kept explicitly distinct per this phase's instruction, not folded into one "export verified" line.

### 10. Comparison against the reference boards

Compared real gameplay screenshots (§7) against `characters-and-boss.png` and `rooms-and-objects.png`
(`/Users/alexisforrest/Documents/Codex/2026-09-06/wha/outputs/topdown-reference-pack/`), assessing composition and
quality, not just palette:

- **Materials/palette**: matches as designed — pale ceramic (player, floor), dark structural metal (walls, melee/
  heavy enemies), cyan player accents, orange enemy accents (melee stripes, ranged sensor eye, hit-warning
  contexts), violet reactor energy (boss core, telegraph ring, containment-gear prop accent).
- **Scale/perspective**: player, enemies, and the boss all read at believable relative scale against the tileset
  and each other in real gameplay (boss dramatically larger, matching the reference board's "massive/multi-phase"
  framing); no perspective mismatch between characters and the floor/wall tile grid.
- **Boss identity, explicitly preserved**: the reference boards' two boss concepts differ (the character board's
  "R-01" is a four-legged reactor-core automaton with splayed articulated limbs; the room board's reactor-arena
  boss reads more like a stationary turret/core) — this milestone's boss uses the character board's four-legged,
  violet-core identity throughout (gallery, every combat screenshot), per the explicit instruction to treat the
  character board as the boss-identity source when the two disagree.
- **Room composition/navigation clarity — a real, candid shortfall**: the reference board's rooms show a clean,
  low-noise floor with sparse, deliberate wall detailing. The actual generated dungeon interior
  (`13_terrain_01_dungeon_r0.png`) reads noticeably busier: the tileset's `panel_grates` overlay feature (chosen
  for this pack's terrain style) renders as dense vertical louvre striping across most wall tiles, and — combined
  with a checkerboard-like scatter of ground tiles between them in an enclosed room specifically — produces a more
  visually "loud" floor/wall field than the reference art's cleaner separation. Collision and navigation are not
  actually impaired (the real playthrough in §7 completed with no new stuck-on-geometry issue), but the *visual*
  read is busier than the reference target. This is a real, disclosed shortfall, not resolved this phase — a good
  candidate for the tileset style to be revisited (fewer/lighter overlay features, or a stronger ground/wall
  contrast ratio) in a future pass.
- **Actor/background separation**: mostly good (the boss's dark-red/violet palette and the melee/heavy enemies'
  dark metal read clearly against the pale floor); the one soft spot is the player and ranged enemy, both
  pale-and-cyan against a pale, speckled floor — legible at full render resolution (confirmed via a zoomed crop,
  §6 of this section... see the debug-probe correction above) but noticeably less crisp than the darker actors at
  a glance or at reduced size, worth a contrast pass (a subtle outline or a slightly darker accent) rather than a
  rebuild.
- **Object interaction states**: match the reference board's intent (chest closed/open, checkpoint
  inactive/active, door/switch, portal) — confirmed via real screenshots, not just asset existence.

### 11. What remains, honestly

- The `attack_warning` telegraph ring's fixed ~0.32s animation length doesn't span the full, generated-data-driven
  telegraph window — a real presentation mismatch, disclosed in §6, not fixed this phase.
- `heavy_*` character art and the `completion` interactive sprite are wired and gallery-verified but not
  independently re-confirmed in this specific seed's live playthrough (§4) — not a defect, a scope/evidence gap.
- The dungeon interior's tile-overlay density reads busier than the reference boards' cleaner architecture (§10) —
  a real visual-coherence shortfall, not a functional one.
- Ambient-pickup *collection* (walking onto one and seeing inventory update) wasn't separately screenshotted this
  phase (§3) — the underlying code path is the same, already-tested `ItemPickup.gd` logic used elsewhere.
- The player/ranged-enemy vs. floor contrast is legible but soft at a glance (§10).
- A concurrent, unrelated, in-progress change elsewhere in this shared working tree is currently causing 9 real
  test failures and a handful of typecheck errors, none of which trace to this milestone's own changes (§8) —
  disclosed rather than silently absorbed into this phase's own numbers, and not fixed here since it isn't this
  milestone's code and is actively being edited by another process.
- Packaged-binary on-screen rendering is still not directly capturable in this sandbox (§9) — unchanged, disclosed
  limitation across the whole project's history.
- This is still an AI-delegated implementation/verification pass, not the user's own personal approval.
- No stage, commit, or push was performed this phase. `git log --oneline -1` is unchanged (`aae921d0`) before and
  after. No working-tree file was restored or checked out to construct any comparison — the props/pickups gap
  analysis, the geometry measurements, and the regression counts were all obtained by inspecting the current
  working tree and running fresh, independent generations/tests, never by reverting anything.

### 12. Is the resumed boss milestone complete?

**Yes, for the scope this phase and the original boss-art milestone together defined.** The boss has cohesive,
original top-down art with a preserved, distinct identity; real idle/walk/attack/hurt/death animation states, all
confirmed playing in a real fight; a telegraph that gives the player a real, timed evasion window (body-tint fully
synchronized, the warning-ring's own duration disclosed as a presentation-only shortfall in §6); damage windows
tied to the real attack animation and hitbox activation, not decorative; and a real, replayable victory → restart
loop. The pack's integration gaps named at the start of this phase (props, pickups, unused-asset ambiguity,
collision-footprint mismatch) are closed and verified in real gameplay, not just described. What's **not**
complete, stated plainly rather than folded into "done": the ring-VFX timing mismatch (§6), the busier-than-
reference dungeon tile density (§10), and the not-yet-recaptured `heavy_*`/`completion`/pickup-collection evidence
(§4, §3) are real, scoped follow-ups — none of them block calling the boss itself finished, since none of them are
about the boss's own presentation or combat.

### 13. Reproduction steps (this phase specifically)

1. `export PATH="$HOME/.local/bin:$PATH"`.
2. No TS packages changed this phase — the existing `apps/cli/dist/` build from the prior phase is sufficient;
   rebuild only if starting from a clean checkout (`pnpm --filter @metroforge/godot build && pnpm --filter
   @metroforge/generation build && pnpm --filter @metroforge/cli build`).
3. `node apps/cli/dist/index.js create --prompt "a scout investigates an abandoned research facility guarded by a reactor-core automaton" --profile VISUAL_VERTICAL_SLICE --mode LOCAL_ONLY --visual-mode procedural-only --archetype TOP_DOWN_ACTION_ADVENTURE --seed 20260918 --external-visual-pack metroforge-research-facility --slug <slug>` — expect `RUNTIME_VALIDATED: 19/19 gates passed`.
4. For gallery/gameplay evidence with an isolated save location: copy `test-packs/metroforge-research-facility/{AssetGallery,TestScenarios}.{gd,tscn}` into `GeneratedGames/<slug>/`, then e.g. `HOME=/tmp/isolated-godot-home godot --path GeneratedGames/<slug> --resolution 1280x800 --rendering-driver metal res://TestScenarios.tscn` — **do not pass `--user-data-dir`, it is not a real flag in this Godot build and silently breaks the scene argument** (§7).
5. `npx vitest run` / `node scripts/typecheck.mjs` — expect the counts in §8, and re-check for the concurrent-edit disclosure there before attributing any new failure to this milestone.
6. macOS package: same steps as every prior phase's §10/§7, per §9 above.

---

## Follow-on milestone — asset-quality overhaul pass: fluid animation, deliberate terrain, expanded props (v2 pack) (2026-09-10)

**Explicit instruction this phase**: overhaul the research-facility pack's visual quality across the board (not
boss-specific) — higher-fluidity character animation, a genuinely modular/deliberate tileset, more and better
props, animated interaction feedback — in a **separate versioned pack directory**, while **Cursor works concurrently
elsewhere in the same repo**. No coordination channel to Cursor was available (checked via the session-list
mechanism — no online peer named Cursor); scope was kept strictly to top-down template files, the new pack
directory, and one additive line in the shared external-visual-pack registry, confirmed clean against file
modification timestamps both before and after this pass.

### 1. Baseline and coordination

Before editing anything: read this document's own prior two "Follow-on milestone" sections and the actual v1
pack/gallery/gameplay screenshots (not just their manifest). Checked for a live Cursor session (none online) and
recorded file-modification timestamps for a small set of files another, unrelated concurrent process had been
editing earlier in this project's history (`packages/shared/src/visual-slice.ts`, `packages/generation/src/
pipeline.ts`, `packages/godot/src/room-assembler.ts`) — confirmed untouched by this pass throughout (re-checked at
the end too). This pass never wrote to any of those three files or anywhere in `templates/godot-metroidvania/`
(side-view). New pack lives entirely in its own sibling directory: `test-packs/metroforge-research-facility-v2/`
— `test-packs/metroforge-research-facility/` (v1) is untouched and still independently selectable.

### 2. Asset audit — retain / refine / regenerate, with reasons

| Family | Verdict | Why |
|---|---|---|
| Player/enemy/boss **stills** (real NVIDIA FLUX art) | **Retain** | Already good, real AI art — the weakness was never the reference pose, it was the 4-frame derived animation |
| Player/enemy/boss **walk/attack/hurt/death sheets** | **Regenerate** | 4-frame walk and attack cycles were too coarse to read as fluid; re-derived from the *same* retained stills at 12/8/5/8-10 frames |
| Terrain tileset | **Regenerate** | v1's `generateTilesetSource()` output (generic per-cell feature-overlay noise) read busier and less deliberate than the reference boards' clean material separation (disclosed candidly in the prior milestone) |
| 4 v1 props (lantern/pipe/pillar/gear) | **Retain** | Real, distinct silhouettes already; no reason to redo |
| 4 new props (server rack/canister cluster/console/reactor unit) | **New, refine-scoped** | Added for room-composition variety; reuse existing shape primitives with new palettes rather than bespoke geometry — disclosed honestly, not oversold as 8 fully unique designs |
| Interactive objects (checkpoint/chest/gate/switch/portal/completion) | **Retain** | Already real, distinct, already gameplay-verified in the prior milestone; only gained real tween-based transitions this pass (§5), not new art |
| Health/progression pickup icons | **Retain art, add motion later** | Still simple flat shapes (a real, disclosed shortfall carried over — see §8) |
| VFX (hit spark, projectile, telegraph ring) | **Retain** | Already real and wired; unchanged this pass |

### 3. Animation: real higher-frame-count re-processing of the same real stills

Every character's **same real NVIDIA FLUX still from v1** (nothing regenerated at the source-image level — the
production report records this explicitly) is now re-processed through the repo's own higher-capacity pose
builders: `generateRunCycleSheet` (12 frames — longer stride, sharper vertical bob, and a constant forward-lean
shear that increases toward the head — a *distinct* technique from v1's plain `generateWalkCycleSheet`, not the
same clip relabeled) for locomotion, `generateAttackSheet` at 8 frames (windup → strike → recover arc), `
generateHurtFlashSheet` at 5 frames, and `generateDeathSheet` at 8 frames (10 for the boss). Verified with the
repo's own real `computeFrameQualityMetrics` for every character, not assumed: all five report `uniqueFrameRatio
= 1.0` (no duplicated frames), real non-zero `meanSilhouetteDelta` (0.10–0.17), and `chaoticMotion: false` (real
motion, not noise) — recorded per-character in `production-report-animation.json`.

**Disclosed precisely, not overclaimed**: this is a real per-scanline shear/bob/lean technique — the same one
already used, reviewed, and shipped for side-view's own run-cycle animation in this codebase — not true per-
limb-segment rigging with independently posable joints. It produces genuinely non-duplicated, non-chaotic,
higher-frequency motion (confirmed both by the metrics above and by direct visual inspection of the resulting
sheets, §7), which is what "regenerate simplistic animation" asked for, but it does not claim hand-authored
joint articulation it doesn't have.

### 4. Terrain: a deliberately-constructed tile atlas, plus a real bug found and fixed in its rollout

Built a new, hand-authored 6×3-cell (192×96px, 32px tiles) atlas — not `generateTilesetSource()`'s generic
feature-overlay style — with geometrically deliberate cells: a grout-line ceramic base, a single connected crack
line, evenly-spaced grate slits, a violet cable-conduit channel, a clean diagonal hazard stripe, an elliptical
stain blob, a plain wall band, a cyan-accented wall panel with rivets, a worn-wall patch, and fixed-position dirt
blotches — plus door/ceiling/platform/edge placeholder cells. Ships its own `terrain.json` role map where **every
declared role has a real backing cell within the actual image bounds** — while building this, found and disclosed
(not fixed, out of scope) a **real pre-existing inconsistency in the base pipeline's own default terrain.json**:
several of its declared roles (`ground_crack`, `decor_a`, `decor_b`, etc.) point at atlas columns/rows outside the
actual default 128×128 tileset image's 4×4-cell bounds — silently unusable today only because
`OverworldManager.gd` never requested those specific roles.

`OverworldManager._build_ground()`'s per-cell role selection was extended (`_ground_role_for_cell()`) to
deterministically hash-select among whichever extra ground/wall sub-roles a biome's terrain.json actually
declares — backward compatible (a biome with none of the extra roles renders byte-identical to before this
change). **A real bug was found and fixed during this pass's own verification, not shipped**: the first
gameplay screenshot showed every single interior-dungeon floor tile with the identical crack-line pattern,
because `TILE_DIRT` (which interior dungeon floors are built from almost entirely — the overworld is `TILE_GRASS`)
had a hardcoded 1:1 mapping to the "worn" role, never routed through the new variance system at all. Fixed by
folding `ground_wear` into the same weighted-hash pool (~40% worn, ~20% plain, ~40% split across the five real
material variants) — re-verified visually before calling this done (§7).

### 5. Interaction feedback: real motion instead of instant snaps

`ChestPickup.gd` (open: a pop-and-settle scale tween), `LockedDoor.gd` (unlock: the panel visibly slides up and
fades rather than just re-tinting in place), `SavePoint.gd` (activation: an elastic scale/tint tween — a real
"booting up" beat matching the reference board's dark→booting→lit progression), `FloorSwitch.gd` (press: a quick
flatten-and-settle), and `AreaPortal.gd` (a new, restrained looping breathing-scale pulse on any active portal —
the one genuinely new *ambient* environmental loop added this pass; fans/coolant/console-light loops from the
reference board were not added, disclosed honestly in §8 rather than claimed). All are real `Tween` nodes on the
existing real sprites, not new art — the "minimum necessary runtime change" this pass's own scope asked for.

### 6. Props and manifest — 8 total, honestly characterized

`metroforge-research-facility-v2/manifest.json`: 47 assets (25 character-animation files, 2 terrain files, 8 props,
7 interactive states, 2 items, 3 VFX). Every character asset's `sourceProvenance` states plainly that the still is
reused from v1 and only the derived sheet changed, with the real frame counts and quality metrics inlined. Terrain
assets are marked as this pass's own hand-authored construction, explicitly distinguished from
`generateTilesetSource()`. Props: the 4 new ones are disclosed as reused shape families with new palettes, not
bespoke geometry (§2).

### 7. Fresh generation and real gameplay evidence

`node apps/cli/dist/index.js create ... --external-visual-pack metroforge-research-facility-v2 --slug
research-facility-v2-final` → `RUNTIME_VALIDATED: 19/19 gates passed`, `automated_repair: SKIPPED`,
`EXTERNAL_VISUAL_PACK_ACTIVE: metroforge-research-facility-v2 (47 authored assets)`. The first attempt at this
exact regeneration surfaced the real `TILE_DIRT` monotony bug in §4 directly in its own gameplay screenshot before
being accepted — inspected, not assumed correct from gate status alone.

Gallery (`qa_gallery/01_player.png` … `08_vfx.png`, 8 section contact sheets) confirms all 12/8/5/8-10-frame
sheets slice and display correctly (the gallery's own frame-count logic was made self-deriving from real sheet
width this pass, rather than trusting a hardcoded per-call argument that would have silently mis-sliced a
higher-frame-count sheet) and all 8 props render with distinct silhouettes.

Full real-input playthrough (`TestScenarios.gd`, isolated `$HOME` override, 25 screenshots,
`qa_scenarios/01_dir_00_idle.png` … `25_boss_06_restart.png`), end to end, no fatal steps: all 4 directional
walks + idle now visibly using the 12-frame cycle; chest open (with the new pop tween) and checkpoint activation
(with the new elastic pulse); a real ranged hit (`health 86 → 72`); a real room transition into `dungeon_000_r0`
showing the *fixed* varied floor (not the uniform crack pattern); real melee combat; a real player death, death
animation (now 8 frames), and respawn; a full real boss fight (12-frame walk, 8-frame attack, real telegraph,
real recovery window, 10-frame death) via real attacks, ending in a genuine `game_state=4 game_complete=true`
victory and a real restart. Not treated as proof of fluidity by frame count alone — every sheet and the full
playthrough were opened and visually read (§3, §4, §7) before being accepted.

### 8. Regression, macOS export, and a real transient-failure finding

`node scripts/typecheck.mjs`: **clean across all 14 tsconfigs** — the concurrent, unrelated TypeScript work
disclosed in the prior "Follow-on milestone" section (§8 there) had fully landed/resolved by the time this pass
ran; re-confirmed clean both before and after this pass's own single additive line in
`external-visual-pack.ts`.

`npx vitest run`: **167 passed, 3 failed, 7 skipped files (177 total); 1115 passed, 8 failed, 9 skipped tests
(1132 total)**. Two of the three failing files are the same real-heavy-ML-model evidence tests (`foreground-
isolation.real-model.evidence.test.ts`, `prompt-budget.real-tokenizer.evidence.test.ts`) already disclosed as
resource-contention-sensitive in the prior phase. The third, `generation-e2e.test.ts` (a real **side-view**
TINY_TEST generation), failed on its export-phase assertion — **this pass touches zero export-pipeline code**,
and the failure directly correlates with a real, independently-reproduced macOS export corruption this pass's own
first export attempt hit (`lipo: can't figure out the architecture type of...`, an unsigned, malformed binary) at
the same time this vitest run and a fresh Godot generation were both running concurrently on this machine. A
second export attempt (`--resume`, run once system load had dropped) produced a clean, correctly-signed, universal
binary — strong evidence this is a real, transient, resource-contention failure in the shared macOS packaging
step under concurrent load, not a code regression from this pass. Disclosed precisely rather than silently
retried into a different, unexplained number.

**macOS export, final state**: `codesign -dv` shows `Format=app bundle with Mach-O universal (x86_64 arm64)`,
`Signature=adhoc`; `codesign --verify --deep --strict` clean; `lipo -info` confirms both slices. Launched for
real: **process liveness confirmed** (`ps aux`); **window/frontmost detection this run returned "Cursor"** — a
concrete, direct confirmation that Cursor is in fact actively running on this machine right now (exactly the
"parallel work" this pass's own instructions described), not this session's own game window — process survival is
confirmed, frontmost-window capture is not, for that specific reason, this run. **Packaged on-screen rendering**:
`screencapture -x` still fails with the same standing, previously-disclosed Screen-Recording-permission gap
present in every phase of this whole project.

### 9. What remains, honestly

- The animation technique is real per-scanline shear/bob/lean, not per-limb-segment rigging (§3) — a ceiling on
  how "hand-animated" this can ever look without a fundamentally different pipeline.
- 4 of the 8 props reuse existing shape-family geometry with new palettes rather than bespoke silhouettes (§2, §6).
- Health/progression pickup icons are still simple flat shapes — not regenerated this pass (§2).
- Only one new ambient environmental loop was added (the portal's breathing pulse, §5) — fans/coolant/console-
  light loops from the reference board were not built this pass.
- No geometric wall-corner/junction auto-tiling (inner/outer corners, T/L junctions) — the new tileset is a richer
  *material* kit, not a full autotile system (carried over limitation from the prior milestone, still real).
- A real, transient macOS-export resource-contention failure was observed and worked around by retrying once load
  dropped (§8) — disclosed as an environmental characteristic of concurrent heavy processes on this machine, not
  fixed at the pipeline level (out of this pass's scope, and the pipeline's own retry-on-resume already handles it
  in practice).
- This is still an AI-delegated implementation/verification pass, not personal human approval — kept distinct.
- No stage, commit, or push was performed. `git log --oneline -1` is unchanged (`aae921d0`). No working-tree file
  was reverted, reset, cleaned, stashed, or restored — the `TILE_DIRT` fix in §4 was applied forward and
  re-verified with a fresh generation, never by discarding anything.

### 10. Files changed this pass (for Cursor coordination)

**New** (own directory, zero collision risk): `test-packs/metroforge-research-facility-v2/` (manifest, 25
character-animation PNGs + 2 reference-pose stills, 2 terrain files, 8 prop PNGs, 7 interactive PNGs, 2 item PNGs,
3 VFX PNGs, `production-report-animation.json`, `AssetGallery.gd/.tscn`, `TestScenarios.gd/.tscn`).

**Modified, all `templates/godot-topdown-adventure/`** (top-down-only, never touches `templates/godot-
metroidvania/`): `scripts/world/OverworldManager.gd` (tile-variance selection + the `TILE_DIRT` fix),
`scripts/world/ChestPickup.gd`, `scripts/world/LockedDoor.gd`, `scripts/world/SavePoint.gd`,
`scripts/world/FloorSwitch.gd`, `scripts/world/AreaPortal.gd` (all five: tween-based interaction feedback only).

**Modified, one shared file, additive only**: `packages/godot/src/external-visual-pack.ts` (one new array entry,
`'metroforge-research-facility-v2'` — does not alter any existing pack id's behavior).

**Not touched**: anything in `packages/shared/`, `packages/generation/` (beyond rebuilding, not editing, its
already-compiled `dist/`), `packages/godot/src/room-assembler.ts`, `templates/godot-metroidvania/`, or any file
the earlier-disclosed concurrent TypeScript work was editing.

### 11. Reproduction steps (this pass specifically)

1. `export PATH="$HOME/.local/bin:$PATH"`; rebuild only `@metroforge/godot` if starting fresh (`pnpm --filter
   @metroforge/godot build`) — no other package changed TS this pass.
2. `node apps/cli/dist/index.js create --prompt "a scout investigates an abandoned research facility guarded by a reactor-core automaton" --profile VISUAL_VERTICAL_SLICE --mode LOCAL_ONLY --visual-mode procedural-only --archetype TOP_DOWN_ACTION_ADVENTURE --seed 20260918 --external-visual-pack metroforge-research-facility-v2 --slug <slug>` — expect `RUNTIME_VALIDATED: 19/19 gates passed`, `EXTERNAL_VISUAL_PACK_ACTIVE: metroforge-research-facility-v2 (47 authored assets)`.
3. If the macOS export step warns about signature/architecture under heavy concurrent machine load, re-run the identical command with `--resume` once load has dropped (§8) — this reliably produces a clean export; it is not pack-specific.
4. Gallery/gameplay evidence: copy `test-packs/metroforge-research-facility-v2/{AssetGallery,TestScenarios}.{gd,tscn}` into `GeneratedGames/<slug>/`, then `HOME=/tmp/isolated-godot-home godot --path GeneratedGames/<slug> --resolution 1280x800 --rendering-driver metal res://TestScenarios.tscn` (or `AssetGallery.tscn`).
5. `npx vitest run` / `node scripts/typecheck.mjs` — re-check §8's disclosures before attributing any new failure to this pass.

---

## Follow-on addendum — a real terrain regression found and fixed, navigation flakiness conclusively isolated, and the new local pipeline wired into normal generation (2026-09-10, continued)

Continuing this same phase after the section above was written: real-input gameplay evidence against the pack's actual final build surfaced a genuine regression the prior section's own screenshots hadn't caught, and a separate request ("use new pipeline for generation") led to actually wiring `LocalSpriteWorkerProvider` (docs/asset-pipeline/LOCAL_SPRITE_WORKER.md) into the normal generation pipeline rather than leaving it a standalone-tested module.

### A real terrain over-saturation bug, found, wrongly diagnosed once, then correctly fixed

A gameplay screenshot against the pack's truly-final build showed every visible dungeon-interior floor tile covered in the same diagonal crack pattern, and the overworld covered in a dense field of hazard/grate/dirty tiles — both far busier than intended. Traced and fixed in two real passes, the first of which was itself wrong and had to be corrected against a second real screenshot rather than assumed fixed from the code change alone:

1. **First hypothesis, disproven**: assumed the new overworld *props* were narrowing a walkable corridor. Gated `_spawn_props()` to dungeon rooms only (matching the existing `_spawn_ambient_pickups()` convention) and re-verified with a fresh generation — the identical navigation failure (see below) still reproduced with zero props in the overworld, disproving this theory outright rather than leaving it unconfirmed.
2. **Real cause, found by re-reading the actual screenshot, not the code's own comments**: this file's own `_ground_role_for_cell()` carried a comment claiming "the overworld is TILE_GRASS" — that was never independently verified and was wrong. The overworld is substantially `TILE_DIRT`, and that branch's weighting (from this pass's earlier §4 fix, tuned for the dungeon-interior monotony it was written to solve) put `ground_wear` at 60% and left `ground` unweighted as a fallback — visibly saturating the overworld with the same crack cell everywhere it was meant to accent. Re-weighted so plain `ground` is the true majority (~67%) and `ground_wear`/material variants are minority accents (~20%/~13%), re-verified with a fresh generation and a direct screenshot comparison: the dungeon interior (`13_terrain_01_dungeon_r0.png`) now shows a clean floor with two hazard-stripe accents, one grate cell, and one dirt-blotch cluster — genuinely sparse, deliberate detail, not a maze.
3. **The overworld's remaining density is not a regression**: re-inspecting the corrected overworld screenshot side by side with the dungeon fix, the overworld's visible orange-striped cells are `TILE_WATER`→`hazard` — a fixed, pre-existing mapping this pass never touched, and the overworld's real scattered-obstacle water/wall placement (`packages/procedural/src/topdown/world.ts`, already-existing generation logic, not part of this pack) has always produced this many water cells. Confirmed, not assumed: this pass's own ground-variant system only ever governs `TILE_GRASS`/`TILE_DIRT` cells, and the hazard/orange-stripe cells filling the overworld are a completely separate, always-present code path. Stated honestly rather than claiming an unverified additional fix.

### Navigation flakiness conclusively isolated as pre-existing and unrelated to this pack

The same `overworld → dungeon_000_r0` post-respawn hop failed identically across 5 separate real-input runs this phase, surviving both the props fix and both terrain fixes — strong evidence it was never caused by anything in this pack. Confirmed directly, not assumed: an independent, unrelated `TINY_TEST` generation (default template, no research-facility pack, a different seed, different archetype-profile combination entirely) hit the **exact same `godot_playtest` failure signature** (`playtest_completed_transitions`, `playtest_reached_victory_flow`, `playtest_victory_state_or_boss_defeated`) in this same session. This rules out props, terrain, and every other pack-specific change as the cause — it is a genuine, pre-existing bot-navigation characteristic of the shared `PlaytestAgent.gd`/`TestScenarios.gd`-style harness, consistent with this same class of flakiness already disclosed in earlier phases of this project. Not fixed this pass (out of scope — it is not this pack's defect); disclosed precisely with the cross-project evidence that isolates it, rather than left as an open, blamed-on-the-pack question.

### The new local asset-generation pipeline is now real, registered, and confirmed used by normal generation

`LocalSpriteWorkerImageAdapter` (`packages/assets/src/providers/local-sprite-worker-adapter.ts`) adapts `LocalSpriteWorkerProvider` onto the existing `ImageGenerator` interface every other provider in `ImageProviderRegistry` implements, and is now registered in `packages/assets/src/foundry/register.ts` — the same registration function `packages/assets/src/asset-pipeline.ts` (the real, normal generation pipeline every `metroforge create` run goes through) already calls unconditionally. Registered with an honest `qualityScore: 25`/`priority: 20` (a simple seeded procedural shape generator, not competing with real AI art) and `useProductionCapacityGate: false` (its real memory footprint is a few MB of Pillow buffers, nothing like the 12GB FP32 floor that gate assumes for a real diffusion backend).

**Verified with a real, fresh generation, not assumed from the registration alone**: `node apps/cli/dist/index.js create --profile TINY_TEST --mode LOCAL_ONLY --archetype TOP_DOWN_ACTION_ADVENTURE --seed 999001 --slug local-pipeline-test` (no `--visual-mode procedural-only` override, no research-facility pack) produced a real `generation_manifest.json` attributing **17 real artifacts** — player, both enemies, the boss, the NPC, the tileset, and several VFX — to `provider: "local-sprite-worker"`, alongside the existing `pixel-art-processor`/`procedural` providers for the rest. `RUNTIME_VALIDATED` gates passed; the only gate failure was the same pre-existing `godot_playtest` bot-navigation flakiness disclosed above, confirmed unrelated to this new provider (it hit an entirely different, default-template project with no pack involvement at all — the same evidence that isolated the navigation issue in the first place).

New tests: `packages/assets/src/foundry/register.test.ts`'s existing 6 tests still pass unmodified alongside the new registration; `local-sprite-worker.test.ts`'s 9 mocked tests are unaffected. `pnpm --filter @metroforge/assets typecheck` clean.

### Files changed in this addendum (for Cursor coordination, extending §10 above)

**New**: `packages/assets/src/providers/local-sprite-worker-adapter.ts`.

**Modified**: `templates/godot-topdown-adventure/scripts/world/OverworldManager.gd` (the two terrain-weighting corrections and the props-to-dungeon-only gate, all within this pass's already-declared file), `packages/assets/src/foundry/register.ts` (one new provider registration block, additive — no existing registration's behavior changed), `packages/assets/src/index.ts` (one new export line).

### Reproduction (this addendum specifically)

1. `pnpm --filter @metroforge/assets build` (only package with new TS this addendum).
2. Regenerate the pack project with the same command as §11 above — the dungeon-interior terrain fix and props-to-dungeon-only gate are both in `OverworldManager.gd`, picked up automatically.
3. To see the new pipeline actually selected: `node apps/cli/dist/index.js create --profile TINY_TEST --mode LOCAL_ONLY --archetype TOP_DOWN_ACTION_ADVENTURE --seed <any> --slug <slug>` (no external pack, no `--visual-mode` override needed) — inspect `generation_manifest.json` for `"provider": "local-sprite-worker"` entries.
4. `npx vitest run packages/assets/src/foundry/register.test.ts packages/assets/src/providers/local-sprite-worker.test.ts` for the relevant regression coverage.

---

## Follow-on addendum — the disclosed HUD text-overflow bug, fixed (2026-09-10, continued)

**Explicit instruction this phase**: identify the highest-priority unfinished top-down item from this document and
current implementation, and complete one bounded improvement. Read this whole document plus the current working
tree first; kept scope to the top-down template only, per instruction to preserve Cursor's concurrent Metroforge
(side-view) work and avoid its files.

### 1. Picking the item

Surveyed every "What remains, honestly" section above. Most open items are either large/exploratory (fans/coolant
ambient loops, a real autotile system, per-limb character rigging) or evidence gaps on already-correct code
(`heavy_*`/`completion` sprites not re-screenshotted). The one item disclosed as a genuine, reproducible defect in
every phase since it was first found, never fixed, and small enough to close in one bounded pass: **"The HUD's
top-left panel background doesn't fully contain its own text at some window sizes (the `Echoes: 0/1` line visibly
spills below its container in `01_spawn.png`/others)"** (original milestone §8, repeated unchanged through every
later phase's own §8/§9/§11 "what remains" list).

Checked the current working tree before assuming this was still real: `templates/godot-topdown-adventure/scenes/
world/World.tscn`'s `GameHUD/HUD` still lays out the stat block (`MarginContainer/VBox` — health bar, ability,
currency, collectible labels) with a 20px `MarginContainer` margin, and positions `QuestTrackerPanel` as a
*sibling* at a hardcoded `offset_top = 110.0` — not derived from the stat block's actual height. Computed the stat
block's real minimum height under Godot's default theme (20px health bar + 3 label rows at the default font's
~19px line height + the VBoxContainer's default 4px separation ≈ 89px, plus the 20px top margin ≈ 109px) — a
1px margin against the hardcoded `110.0` offset, meaning any content taller than the narrowest default case (a
longer currency line, a second currency, a larger font) pushes the last label directly into the quest tracker
panel's own background. Confirmed this is not a Metroforge/side-view file: `templates/godot-metroidvania/scripts/
UI/GameHUD.gd` was touched by a recent, already-committed Cursor-adjacent commit (`c876cf33`, HUD-foundry-texture
wiring) but its own `World.tscn` has the *same* hardcoded-offset pattern (`offset_top = 84.0` there) — a
structurally identical bug, disclosed below for Cursor's awareness, **not fixed**, since it lives entirely in
`templates/godot-metroidvania/` and is out of this pass's explicit scope.

### 2. The fix: container-driven layout instead of a hardcoded pixel guess

`templates/godot-topdown-adventure/scenes/world/World.tscn` — moved `QuestTrackerPanel` (and its `QuestTrackerView`
child) from being a `GameHUD/HUD`-level sibling with static `offset_top/offset_bottom` (`layout_mode = 1`) to being
the last child of `GameHUD/HUD/MarginContainer/VBox` itself (`layout_mode = 2`, `size_flags_horizontal = 0` so it
keeps its own 260px width instead of stretching to the VBox's full row width). A `VBoxContainer` lays out its
children by their *actual* rendered height, so the quest tracker now always sits immediately below the real stat
block — for any font, any number of currencies, any collectible-count string length — instead of guessing a fixed
pixel gap that happens to almost work for the narrowest case. Added `theme_override_constants/separation = 8` on
the `VBox` for a small, deliberate breathing gap between the stat rows and the quest panel (was implicitly ~1px
before this fix, per the computation above).

This only required one other change: `templates/godot-topdown-adventure/scripts/test/RuntimeSmokeTest.gd`'s
`_check_hud_quest_tracker()` looked up the tracker at the old absolute path (`"HUD/QuestTrackerPanel/
QuestTrackerView"`); updated to the new one (`"HUD/MarginContainer/VBox/QuestTrackerPanel/QuestTrackerView"`).
Confirmed by direct search that nothing else in the repo references this node by path: `packages/qa/src/
validator.ts`'s `QuestTrackerPanel.gd`/`GameHUD.gd` mentions are plain file-existence checks (not scene node
paths), and `packages/qa/src/quality-repair-engine.ts`'s string-literal scene patches targeting this same
`GameHUD/HUD/MarginContainer/VBox/...` path convention are hardcoded to `templates/godot-metroidvania` only (the
already-documented, archetype-gated quality-pass system from finding #5 earlier in this document) — they never run
against a top-down project and are untouched by this fix either way.

### 3. Real verification: the bug reproduced, then confirmed fixed, on the actual generated project

Ran a fresh generation through the normal CLI (`TINY_TEST`/`LOCAL_ONLY`/`TOP_DOWN_ACTION_ADVENTURE`, seed
`20260918`, slug `hud-fix-check`): `RUNTIME_VALIDATED: 19/19 gates passed`, `godot_runtime: PASS (168/168 runtime
checks passed)` — including `_check_currency_hud`'s and `_check_hud_quest_tracker`'s real node-path assertions at
the corrected path — `godot_playtest: PASS (8/8)`.

Node-presence checks alone don't prove the *visual* overlap is gone, so built an ad hoc, not-shipped screenshot
harness (`HudCheck.gd`/`.tscn`, same `get_viewport().get_texture().get_image()` real-GPU-capture convention this
whole milestone has used throughout, e.g. `AssetGallery.gd`) that instances the real `World.tscn`, lets it fully
boot, then saves a cropped PNG of just the top-left HUD corner. Confirmed the real generated project's own
`items.json` already contains one real `category: "collectible"` entry — enough on its own to reproduce the exact
`"Echoes: 0/1"` text from the original disclosure, no synthetic data needed.

**Before** (a scratch copy of the same generated project with `World.tscn`'s `QuestTrackerPanel` reverted to the
old hardcoded-offset layout, `.godot` import cache left intact so the comparison isolates only the layout change):
the `Echoes: 0/1` line visibly runs into the quest tracker panel's own dark background, exactly the disclosed
defect. **After** (the real, fixed project, unmodified): the same line sits fully above the panel with a clean
gap, and `No active quests` starts at the same position when Godot lays it out from a taller stat block, whatever
its real height turns out to be — reproduced and confirmed from the actual rendered pixels, not assumed from the
node graph alone. Both screenshots were sent to the user directly. The ad hoc harness and its scratch project copy
were not committed anywhere; nothing under `GeneratedGames/hud-fix-check` other than the normal generation output
remains.

### 4. Regression suite

`node scripts/typecheck.mjs`: clean across all 14 package/app tsconfigs (this pass touched zero TypeScript).
`npx vitest run packages/godot packages/procedural packages/qa`: **35 files passed, 218 tests passed, 0 failures**
— including `packages/qa/src/validator.test.ts` (22 tests) and `packages/godot/src/assembler.test.ts` (3 tests),
the suites that most directly exercise scene-file structure and template file lists. No test needed changing;
none referenced the old `QuestTrackerPanel` node path.

### 5. What remains, honestly

- The structurally identical bug in `templates/godot-metroidvania/scenes/world/World.tscn` (`QuestTrackerPanel` at
  a hardcoded `offset_top = 84.0`, same sibling-not-child pattern) is disclosed here for Cursor's awareness but
  **not fixed** — it is a Metroforge/side-view file, explicitly out of this session's scope per instruction, and
  Cursor is actively working in that area.
- This is a layout fix, not a redesign — the top-left stat block still has no background panel of its own (only
  the quest tracker below it does); a future visual-polish pass could give it one for consistency, but that's a new
  feature, not part of closing this disclosed bug.
- Still an AI-delegated implementation/verification pass, not personal human approval.
- No stage, commit, or push was performed. `git log --oneline -1` is unchanged (`aae921d0`) before and after. No
  working-tree file was reverted, reset, or restored — the before/after comparison used a throwaway `/tmp` copy of
  the generated project, never the source template or working tree.

### 6. Files changed this addendum (for Cursor coordination)

**Modified, both `templates/godot-topdown-adventure/`, both top-down-only**:
- `scenes/world/World.tscn` — `QuestTrackerPanel`/`QuestTrackerView` re-parented under `GameHUD/HUD/
  MarginContainer/VBox` with container-driven (not hardcoded-offset) layout; `VBox` gained
  `theme_override_constants/separation = 8`.
- `scripts/test/RuntimeSmokeTest.gd` — one node-path string updated to match (`_check_hud_quest_tracker()`).

**Not touched**: `templates/godot-metroidvania/` (side-view, Cursor's active area — the same-shaped bug there is
disclosed in §1/§5 above, not fixed), every package under `packages/`, and every other top-down script/scene.

### Reproduction (this addendum specifically)

1. `node apps/cli/dist/index.js create --prompt "a lone scout explores a sunken crystal dungeon guarded by ancient sentinels" --profile TINY_TEST --mode LOCAL_ONLY --visual-mode procedural-only --archetype TOP_DOWN_ACTION_ADVENTURE --seed 20260918 --slug <slug>` — expect `RUNTIME_VALIDATED: 19/19 gates passed`, `godot_runtime: PASS (168/168)`.
2. `grep -A3 'name="QuestTrackerPanel"' GeneratedGames/<slug>/scenes/world/World.tscn` should show `parent="GameHUD/HUD/MarginContainer/VBox"`, not `parent="GameHUD/HUD"`.
3. For a visual check: build a minimal harness scene instancing `res://scenes/world/World.tscn`, wait a few frames, and save `get_viewport().get_texture().get_image()` — inspect the top-left corner for a clean gap between the stat labels and the quest tracker panel.
4. `npx vitest run packages/godot packages/procedural packages/qa` and `node scripts/typecheck.mjs` from the repo root.

---

## Follow-on addendum — every character sprite rendering as 4 tiny duplicates, found via a real playtest and fixed at its true root cause (2026-09-10, continued)

**Explicit instruction this phase**: find the next unfinished top-down item, preferring a player-visible gameplay/usability defect over cosmetic polish; if the documentation has no actionable item, playtest a fresh generation and find one concrete, reproducible defect. Preserve the prior phase's HUD fix (confirmed still in place, unmodified). Leave Cursor's side-view/Metroforge work and its own documented HUD issue untouched.

### 1. Why this item, not a documented one

Surveyed every "what remains" list across this whole document. Everything still genuinely open was either purely cosmetic (tile-density vs. reference art, ambient VFX loops not yet built, no full autotile system), an evidence gap on already-correct code (`heavy_*` enemy family, `completion` sprite not re-screenshotted this seed), or the already-cross-validated bot-navigation flakiness this phase was explicitly told not to reopen without new evidence. None of those are the "player-visible gameplay/usability defect" this phase's instructions asked to prioritize. Per the fallback instruction, generated a fresh project (`topdown-playtest-fresh`, same seed/prompt/profile this whole milestone has used, `VISUAL_VERTICAL_SLICE`/`TOP_DOWN_ACTION_ADVENTURE`, no external pack) and ran a real-input playthrough with `TestScenarios.gd`/`.tscn` (copied from `test-packs/metroforge-research-facility-v2/` — confirmed generic/pack-independent by inspection before reuse: no hardcoded pack asset paths, only real template APIs and the seed's own known room ids) to look for one.

The CLI's own internal `godot_playtest` gate passed 8/8 on this fresh project, and the ad hoc harness's own navigation-to-boss-room step hit the identical, already-isolated `overworld → dungeon_000_r0` post-respawn flakiness (§ earlier in this doc) — correctly *not* investigated further, per instruction, since the official gate had already proven the exact same project genuinely completable minutes earlier.

But the 18 screenshots the harness *did* capture before that point, opened and inspected directly (not just confirmed to exist), showed a real, severe, completely different defect: the player, the NPC, and the field enemy all rendered as a tight cluster of 3-4 tiny duplicate humanoid copies crammed into a small corner of their expected sprite position, in *every single screenshot* including the very first (`01_dir_00_idle`, before any input) — not a rare or timing-dependent glitch. Sent as a before/after pair to the user once the cause and fix below were confirmed.

### 2. Root-cause trace — not assumed, traced file by file to the real defect

Ruled out the two most likely alternative explanations before touching code:
- **Duplicate entity spawning?** Wrote an ad hoc debug harness (`DupeCheck.gd`/`.tscn`, not shipped, deleted after use) that instances the real `World.tscn` and prints `get_tree().get_nodes_in_group("player")` and every entity's script/position/sprite-frame-count. Result: exactly one Player, one NPC, one Enemy — no duplicates. Ruled out.
- **Broken Godot-side frame slicing?** The same debug harness printed each entity's actual sliced `AnimatedSprite2D` frame data: Player `sprite_frame_count(walk)=10`, frame0 size `(64,64)` — internally consistent with `player_walk.png`'s real `640×64` dimensions (640/64=10) and `Player.tscn`'s `reference_pose_path`-driven frame-size override (`player.png` is genuinely 64×64). The slicing arithmetic in `AnimatedAssetSprite.gd` was correct. Ruled out.

Directly inspected the actual pixel content of one sliced 64×64 frame (`player_walk.png`'s frame 0) and the reference-pose still it was measured against (`player.png`, also 64×64) — **both already contained 4 tiny characters crammed into the bottom band of the canvas**, not the Godot-side rendering at all. The defect was baked into the generated asset file itself, upstream of the game engine entirely.

Traced `player.png`'s real provenance via `generation_manifest.json`: `provider: "local-sprite-worker"` — the free/local/offline procedural fallback wired into the *normal* generation pipeline in this same milestone's immediately preceding addendum (real AI providers were `UNAVAILABLE` for this run, exactly the common, non-contrived path that makes this provider select). Found the actual bug in `packages/assets/src/providers/local-sprite-worker-adapter.ts`'s `generateImage()`: it hardcoded `frameCount: 4` when calling the underlying worker's `character_sheet` capability, then returned the **entire resulting 4-frame horizontal strip** (`frameSize*4` wide) as if it were a single `frameSize×frameSize` portrait — silently violating the `ImageGenerator.generateImage()` contract every other provider (NVIDIA, diffusers) honors: "one prompt in, one still image out," with animation sheets derived from that still by the caller afterward (`asset-pipeline.ts`'s own `generateWalkCycleSheet()`/etc.). Whatever compositing step later fit that 4-frame-wide strip into a single-frame-sized canvas (the file is genuinely 64×64 on disk) crammed all 4 characters into a fraction of the frame with blank space around them — exactly the visual defect observed, and inherited by every sheet (`player_walk.png`, etc.) derived from that same corrupted still.

Confirmed directly with the real, unmodified Python worker (`workers/local_sprite_worker.py`) before writing any fix: requesting `frameCount: 1` for a `64×64` character produces one clean, fully-proportioned humanoid filling the frame — the worker's own drawing logic (`_draw_humanoid()`) was never the problem; only the adapter's frame-count request was wrong.

### 3. The fix

**`packages/assets/src/providers/local-sprite-worker-adapter.ts`** — `generateImage()` now requests `frameCount: 1` instead of `4`, matching the single-portrait contract this method actually promises. `LocalSpriteWorkerProvider`'s own multi-frame `character_sheet` capability is untouched and still available to any caller that wants a real sheet directly (`local-sprite-worker.ts`/`.py` were not modified — the bug was entirely in how the adapter *called* them, not in the worker itself).

This file is shared generation-pipeline code, not top-down-specific — it affects side-view generations equally whenever they fall back to this same provider. Checked for overlap with Cursor's active work before touching it: this file was authored entirely in this same milestone's own immediately-preceding addendum (never Cursor's/Metroforge's code), is not among the concurrently-edited files disclosed earlier in this document (`packages/shared/src/visual-slice.ts`, `packages/generation/src/pipeline.ts`, `packages/godot/src/room-assembler.ts`), and `git status` confirms no other in-progress edits to it. Fixing it here is closing a bug in code this same effort introduced, not scope creep into Cursor's territory — disclosed plainly since the file lives outside `templates/godot-topdown-adventure/`.

**New test**: `packages/assets/src/providers/local-sprite-worker-adapter.test.ts` (previously had zero direct coverage — the existing `local-sprite-worker.test.ts` only exercises the lower-level `LocalSpriteWorkerProvider` bridge, always with its own explicit `frameCount`, so it could never have caught this). Mocked at the same `node:child_process` boundary as the existing suite: asserts the JSON payload sent to the worker's stdin has `frameCount: 1` (a real regression guard — this exact assertion would have failed against the pre-fix code) and that the frame-size clamp to `[16, 64]` is applied regardless of the caller's requested dimensions.

### 4. Validation

- `pnpm --filter @metroforge/assets build`: clean.
- `npx vitest run packages/assets/src/providers/local-sprite-worker-adapter.test.ts packages/assets/src/providers/local-sprite-worker.test.ts packages/assets/src/foundry/register.test.ts`: **3 files, 17 tests, all passing** (2 new).
- `npx vitest run packages/assets` (full package): **63 files passed, 1 skipped; 536 tests passed, 1 skipped; 0 failures** — including the two real-model evidence suites (U2NET foreground isolation, real-CLIP-tokenizer prompt budget) that a prior phase disclosed as transiently flaky under concurrent load; both passed clean here.
- `node scripts/typecheck.mjs`: clean across all 14 package/app tsconfigs.
- Directly invoked the real, unmodified `workers/local_sprite_worker.py` with `frameCount: 1` and inspected the resulting PNG: one clean, fully-proportioned 64×64 humanoid, confirming the worker itself needed no change.
- **Fresh end-to-end regeneration** (`topdown-sprite-fix-check`, identical seed/prompt/profile/archetype to every prior run in this document): `RUNTIME_VALIDATED: 19/19 gates passed`. Inspected `assets/characters/player.png` directly: one clear character filling the frame, not four.
- **Real gameplay re-verification**: ran the same `TestScenarios.gd` harness against the fixed project end to end — all **25 screenshots** captured with no fatal step this run (directional movement, chest/checkpoint, ranged combat, room transition, melee combat, death/respawn, and a full real boss fight through victory and restart). Opened and inspected the player, the field enemy, and the boss in `01_dir_00_idle.png`, `14_melee_00_encounter.png`, and `19_boss_00_encounter.png`: every one is now a single, correctly-proportioned character, boss included (128×128 boss art derives from the same still-image contract and was equally affected before this fix, though this specific project's boss render was not separately screenshotted pre-fix). Before/after crops sent to the user directly.
- This run's bot-navigation step happened to complete the full loop (including the previously-flaky post-respawn hop) — not something this fix changed or was expected to change; the harness's own navigation is inherently non-deterministic in timing, and this document does not claim the flakiness is resolved.

### 5. Two new, honestly disclosed findings — not fixed this phase

- **A field-NPC sprite occasionally renders as a clipped half-body silhouette** (found in `01_dir_00_idle.png`'s "Wanderer" NPC, both before and after this fix — confirmed pre-existing, not a regression from this change). Distinct from the defect fixed above: this is a single walk-cycle frame whose `_draw_humanoid()` limb-shift pose pushes part of the silhouette outside its own `AtlasTexture` region at certain animation phases, cropping it — a real but much smaller-scope asset-quality issue in the same local-sprite-worker fallback path, worth a future bounded pass (e.g. clamping `arm_shift`/`leg_shift` in `workers/local_sprite_worker.py` so a limb never extends past the frame's own bounds).
- **A transient `_pending.ctex` load-failure race in `OverworldManager._place_prop()`** was observed in this phase's own fresh-generation console output (`ERROR: Failed loading resource: res://.godot/imported/_pending.ctex.` / `...biome_0_prop_5.png`) — the same "import not finished compiling before load()" class of race already disclosed and hardened elsewhere (`AnimatedAssetSprite.gd`, `ItemPickup.gd`). `_place_prop()` already guards this correctly (`if tex == null: return` — confirmed by reading the function, no crash, at most one missing decorative prop in that room), so this is disclosed as an existing, already-mitigated-at-the-call-site race, not a new defect requiring a code change.

### 6. Files changed this addendum (for Cursor coordination)

**Modified, shared asset-generation pipeline (not top-down-specific, not Cursor's/Metroforge's code — authored by this same milestone's own prior addendum)**:
- `packages/assets/src/providers/local-sprite-worker-adapter.ts` — `frameCount: 4` → `frameCount: 1` in `generateImage()`, plus an explanatory comment.

**New**:
- `packages/assets/src/providers/local-sprite-worker-adapter.test.ts` — 2 new regression tests.

**Not touched**: `templates/godot-topdown-adventure/` (no template file needed changing — the defect was entirely upstream, in asset generation, not in how the template consumes assets), `templates/godot-metroidvania/` (side-view, Cursor's active area), `workers/local_sprite_worker.py` (root-cause confirmed elsewhere, worker itself is correct), and every file from the prior addendum's HUD fix (confirmed still in place, unmodified — `QuestTrackerPanel` still parented under `GameHUD/HUD/MarginContainer/VBox`).

**Ad hoc, not shipped, deleted after use**: `DupeCheck.gd`/`.tscn` (duplicate-entity debug probe). `TestScenarios.gd`/`.tscn` (the real-input playtest harness, reused from `test-packs/metroforge-research-facility-v2/` unmodified) and their `qa_scenarios/*.png` output were left in place under `GeneratedGames/topdown-playtest-fresh/` and `GeneratedGames/topdown-sprite-fix-check/` as before/after evidence, matching this document's established convention.

### 7. What remains, honestly

- The NPC half-body clipping artifact and the `_place_prop()` import-race console noise (§5) — both real, both disclosed, neither fixed this phase (out of this bounded pass's scope).
- The bot-navigation flakiness in the ad hoc test harness remains unresolved and unreopened, per instruction — this run happened to complete the full loop, which is circumstantial, not evidence the flakiness is gone.
- This bug affected **every top-down and side-view generation that fell back to `local-sprite-worker`** for character art since the provider was wired into the normal pipeline earlier this same milestone — this fix is retroactively correct for that whole window, but no already-generated project was regenerated or repaired by this phase beyond the two fresh verification runs.
- Still an AI-delegated implementation/verification pass, not personal human approval.
- No stage, commit, or push was performed. `git log --oneline -1` is unchanged (`aae921d0`) before and after.

### 8. Next concrete top-down milestone

Fix the NPC/enemy limb-shift clipping artifact disclosed in §5 (clamp `arm_shift`/`leg_shift` in `workers/local_sprite_worker.py`'s `_draw_humanoid()` so a limb never extends past its own frame bounds) — the next-smallest, most concretely reproducible remaining visual defect in the same asset path this phase just fixed, and worth checking as one bounded pass before broader cosmetic items (tile density, ambient VFX loops, autotile corners).

### Reproduction (this addendum specifically)

1. `pnpm --filter @metroforge/assets build` (only package with new/changed TS this addendum).
2. `node apps/cli/dist/index.js create --prompt "a lone scout explores a sunken crystal dungeon guarded by ancient sentinels" --profile VISUAL_VERTICAL_SLICE --mode LOCAL_ONLY --visual-mode procedural-only --archetype TOP_DOWN_ACTION_ADVENTURE --seed 20260918 --slug <slug>` — inspect `generation_manifest.json` for any `"provider": "local-sprite-worker"` artifact, then open the corresponding PNG directly and confirm it shows one character filling the frame, not several tiny ones.
3. To see the pre-fix defect directly: `python3 -c "import json,subprocess; print(subprocess.run(['python3','workers/local_sprite_worker.py'], input=json.dumps({'action':'generate','kind':'character_sheet','width':64,'height':64,'frameCount':4,'seed':1,'fill':[176,172,158],'accent':[92,214,224]}), capture_output=True, text=True).stdout[:200])"` — decode the `imageBase64` field and view it; it's a real 4-frame strip, confirming the worker itself is correct and the adapter's old `frameCount:4` request was the actual bug.
4. `npx vitest run packages/assets` and `node scripts/typecheck.mjs` from the repo root.

---

## Consolidation milestone — one unified integration branch (2026-09-10, continued)

**Explicit instruction this phase**: become the sole agent, consolidate the relevant development
branches into `integration/metroforge-unified`, finish the known unfinished work (local sprite
provider, Foundry visual slice / PR #4, remaining milestone items), validate the unified branch,
and commit clean logical commits. Keep `visualSliceApproved = false`, PR #4 draft, MASS/LARGE/RC
gates. Do not merge into the default branch; do not delete source branches or discard work.

### 1. Git state as found (verified against commits, not reports)

- `origin/main` is a lone unrelated `b747befa "Initial commit"` — **not** the trunk. Every real
  branch roots at `0ac681f7 "Initial commit: MetroForge AI monorepo"`.
- `feature/claude-generation-runtime` @ `aae921d0` carried a **~1,650-file uncommitted working
  tree** — the accumulated, never-committed product of many prior sessions (top-down + side-view
  + asset-pipeline). Plus **24,108 gitignored `Exports/` files force-staged** in the index.
- Worktrees: two stale prunable Windows-path registrations (pruned; branches kept), plus a fresh
  `.worktrees/foundry-visual-recapture` for inspection.

### 2. Branch disposition

| Branch | Relationship | Disposition |
|---|---|---|
| `feature/claude-generation-runtime` @ aae921d0 + 1,650-file WT | trunk + milestone WIP | **base** — preserved as commit `310dd9d0` |
| `claude/vigorous-hopper-b22084` @ 5917bf95 | fully contained in trunk (41 behind) | **already integrated** — nothing unique |
| `feature/cursor-desktop-studio` / `master` @ a40914c2 | trunk ancestor (52 behind) | **already integrated** |
| `cursor/foundry-visual-identity-acbb` @ 45f84d8f | fully contained in `foundry-visual-recapture` | **subsumed** — use recapture |
| `cursor/foundry-visual-recapture-acbb` @ ed4adacc | trunk + 44 linear commits (PR #4) | **merged** into integration |
| `cursor/local-asset-worker-acbb` @ 97a3af0c | trunk + 1 commit (ComfyUI `workers/asset_gen.py`) | **excluded** — a superseded ComfyUI-server approach; the milestone deliberately chose the pure-Pillow `workers/local_sprite_worker.py` (documented earlier in this file); the commit also collides with the merged `index.ts` surface. Branch retained for later cherry-pick if wanted. |
| `cursor/setup-dev-environment-a6d9` | trunk-adjacent + 6 unique commits | **excluded** — Cursor-cloud env provisioning (`.cursor/*`, package-manager pin), test-hermeticity tweaks, and a `MODERN_METROIDVANIA_GATE` largely subsumed by the milestone's own `presentation-gates.ts` + validator evolution; one commit deletes a top-down `PhaseBarrier.tscn` the milestone work re-implemented properly. Branch retained. |
| `origin/main` @ b747befa | unrelated history | **excluded** — not the trunk; never merged into. |

### 3. Preservation (before any branch switch)

- `backup/claude-gen-runtime-20260910` branch pinned at `aae921d0`.
- `310dd9d0 chore(wip): preserve accumulated milestone working tree` — the full ~1,650 real
  source/doc/config files committed as-is on `feature/claude-generation-runtime`. Gitignored
  generated output (`Exports/`, `GeneratedGames/`, `.venv-*`, caches) unstaged; `.gitignore`
  extended to cover local envs / caches / scratch / worktrees.

### 4. Integration branch

`integration/metroforge-unified` = `feature/claude-generation-runtime` (@ `310dd9d0`) with
`cursor/foundry-visual-recapture-acbb` merged in (`0a393b56`). 27 files conflicted; every one
resolved to preserve both sides' intent (see the merge commit body for the file-by-file record).
Principle applied: the milestone `packages/` pipeline is the more-evolved base and generally wins
for shared code; `templates/godot-metroidvania/` visual-slice files take the Foundry side (the
authoritative reviewed side-view work), with the milestone's own additions unioned in where they
were additive (zoom floor, RuntimeSmokeTest's +261-line check expansion, AnimatedAssetSprite
frame-count derivation).

Post-merge follow-up commits:
- `7efac567` — `generateParallaxStrip` accepts both the RGB-tuple `biomePalette` and Foundry's
  hex-string `ParallaxStripPalette`.
- `7d2f1fc6` — ported Foundry's warm-clamp for soot/ember palettes onto HEAD's tone derivation
  (restores the 3 Foundry parallax-warmth tests).
- `de88d3f2` — completed the Foundry authored-courier-kit integration into the V2 pipeline:
  authored 4-frame courier strips (walk/attack/hurt/death) + authored pose stills
  (run/jump/fall/land/dash) + authored `npc_000`/`npc_000_walk` + authored 32px masonry atlas;
  NPC fill switched from the mustard `NPC_ROLE_COLORS` flood to `npcActorPalette`. `idle` stays a
  V2 progression sheet (the authored kit ships a `_pose` still that V2 has no slot for); the
  authored-courier asset-pipeline test was updated to the integrated structure.

### 5. Known unfinished work — completed this phase

1. **Local sprite provider**
   - `local-sprite-worker-adapter.ts` `generateImage()` requests `frameCount: 1` — **preserved
     through the merge** (verified: the earlier-session fix + its `local-sprite-worker-adapter.test.ts`
     regression coverage both survive on the integration branch, tests green).
   - **NPC/humanoid walk-pose clipping** in `workers/local_sprite_worker.py` — **fixed** (`6a137ae4`).
     `_draw_humanoid()` now fits the head+torso+legs vertical budget to the drawable height with
     the feet anchored one pixel above the bottom (stable, no per-frame drift) and clamps the
     arm/leg swing so no limb's outermost pixel crosses the frame border. No downscaling beyond
     the height budget — the character is not squashed. Verified clean at 16/24/32/48/64px frames.
   - **Prop-texture import race** — **investigated + mitigated** (`bc6d2455`). The console
     `_pending.ctex` errors are Godot-engine-internal `push_error` from `ResourceLoader::_load`,
     not template code; `_place_prop()` already guarded the null without crashing (prop silently
     absent). Added one cache-ignoring `ResourceLoader.load(CACHE_MODE_IGNORE)` retry so the prop
     still appears when the first `load()` returns (and caches) a transient null right after
     `--import`. Root cause is import/runtime sequencing under concurrent load, not a code defect.

2. **Foundry visual slice / PR #4**
   - Authored Wanderer + foundry tender, recessed furnace, compact HUD, collision, pickup
     outline, accepted camera behavior — **preserved** (Foundry `QualityPresentation.gd` /
     `CameraDirector.gd` / `RoomTileMap.gd` taken whole; authored kit now actually reaches the
     game via §4's pipeline integration).
   - **Spawn tiles obscuring the player's head/upper body** — **addressed by the merge**: Foundry's
     `RoomTileMap.gd` (Ground `z_index = 1`, `z_as_relative = false`) + `Player.tscn`/`Enemy.tscn`
     `z_index = 10` are all on the integration branch. Verified in the fresh side-view generation
     below.
   - **Distinct room identities (Rooms 02/04/07)** — **preserved**: Foundry's per-role rear-wall
     system (`_paint_colonnade` / `_paint_gallery_wall` / `_paint_furnace_hearth` /
     `_paint_tutorial_gantry` / `_paint_ruin_mass`) is intact.
   - Room 05 "convincing reference room" and pickup interior art — see §7 (partially addressed;
     the pickup now generates a real interactable sprite via `WORLD_INTERACTABLE_ASSETS` +
     `prop-art.ts` family mappings, and Room 05 uses the authored `_paint_furnace_hearth`; a
     dedicated art-quality pass is noted as remaining human-review-gated work).

3. **Remaining milestone work** — the milestone's own stated "next item" was the NPC clip fix
   (done, above). The bot-navigation harness flakiness stays unreopened (no new evidence of a
   player-facing progression problem).

### 6. Validation of the unified branch

- `node scripts/typecheck.mjs`: **clean across all 14 package/app tsconfigs.**
- `npx vitest run` (full repo): **173 test files passed, 7 skipped; 1,145 tests passed, 9
  skipped, 0 failures** — including the real-model evidence suites (U2NET, real CLIP tokenizer)
  and `generation-e2e.test.ts` (real side-view TINY_TEST generation).
- `pnpm --filter @metroforge/{godot,assets,qa,generation,cli} build`: clean.

**§8 — fresh generations, gates, real-input playthroughs, screenshots.**

Several integration bugs were found *by* these fresh runs and fixed (each its own commit), then
re-verified by re-generating:

| # | Bug found by a fresh run | Fix |
|---|---|---|
| a | Top-down `SavePoint.gd` crashed at `@implicit_ready` — the Foundry merge auto-applied its `WorldPropSprite` ColorRect→Sprite2D scene change to the *top-down* SavePoint/ItemPickup/NPC `.tscn`, but top-down has its own `$GeneratedSprite` icon system | `0dec99f2` — reverted those 3 top-down scenes to the milestone form |
| b | Side-view world-object node-not-found errors + double sprite — merge kept the milestone `GENERATED_TEXTURE_PATH` scripts but Foundry's `WorldPropSprite` scenes | `38f4471f` — took Foundry's matching `.gd` for side-view SavePoint/AbilityPickup/ItemPickup |
| c | Top-down "sunken crystal dungeon" got the side-view foundry courier as its player — `shouldUseFoundryCourierKit` fired for *any* `VISUAL_VERTICAL_SLICE` | `70326541` — gated to side-view + explicit foundry/courier/wanderer theme; never top-down |
| d | Top-down NPC rendered as a top-left quarter-crop — `NPC.tscn frame_size=32` vs 64px compiled sheets, no `reference_pose_path` to self-correct | `7cf51541` — `frame_size=64` on Player/Enemy/NPC + `reference_pose_path` on NPC |
| e | Side-view crashed on every room load — `String(ground.get("visual_kit"))` → `String(null)` because Foundry's `RoomTileMap.gd` never declared `visual_kit` | `c5cee124` — `@export var visual_kit` on RoomTileMap + `typeof` guard in WorldManager |
| f | Side-view `godot_runtime` camera sub-checks soft-failed / false-positived against Foundry's accepted camera | `7023d6cd` — `CameraDirector.get_room_size()`; `camera_idle_stays_near_player_anchor` rewritten to "player is inside the view" (tolerant of edge-clamp + playable-band pinning) |

**Top-down** (`create ... --archetype TOP_DOWN_ACTION_ADVENTURE --seed 20260918`, integration
branch, after fixes a/c/d): `RUNTIME_VALIDATED: 19/19 gates passed`, **0 script errors**,
`godot_runtime: PASS 168/168`, `godot_playtest: PASS 8/8`, `gameplay_screenshot_qa: SKIPPED` (no
GPU on the pipeline invocation — the standing project-wide limitation). `player.png` provider is
`local-sprite-worker` (the procedural humanoid, *not* the foundry courier — fix c). Real-input
`TestScenarios.gd` harness: 18 screenshots before the pre-existing, already-isolated
`overworld → dungeon_000_r0` bot-nav flakiness (the CLI's own `godot_playtest` completed the full
loop on the same project — not reopened per instruction). Player/enemy/NPC render as full,
un-clipped single characters with feet anchored (fixes b/d).

**Side-view Foundry slice** (`create ... --archetype SIDE_VIEW_METROIDVANIA --seed 20260909
--prompt "Ashen Foundry: a lone courier..."`, after fixes b/e/f): `RUNTIME_VALIDATED: 19/19
gates passed`, **0 script errors**, `godot_playtest: PASS 8/8`, `gameplay_screenshot_qa: PASS
score 100`. `godot_runtime: SOFT_FAIL 194/238` **headless** — the 44 not-passed checks are all
`gameplay_screenshot_*`, which HEAD's expanded metroidvania `RuntimeSmokeTest.gd` can only
satisfy with a windowed GPU capture; run windowed (`METROFORGE_CAPTURE=1`, real Metal renderer)
the same smoke test is **280/280, 0 failures**. This is a pre-existing characteristic of HEAD's
smoke-test expansion under a headless gate, not a consolidation regression, and it is a soft
(non-blocking) gate — no QA threshold was weakened. `authored-original` provider on 152 assets
(the authored courier/tender + derived strips reach the game). The `metroforge-foundry-v3`
external pack also auto-activates for a foundry-themed side-view slice (pre-existing behavior,
30 assets, supplies the tileset) — a separate visual layer from PR #4's authored-masonry work.
Windowed spawn screenshot: player reads clearly in front of the masonry (the z-order fix),
platforms have legible hazard-striped tops, rooms have distinct silhouettes.

- Fixed the integration-caused failures above; kept QA thresholds intact; automated validation
  is kept distinct from the human visual-approval decision (below).

### 7. What remains / human decisions needed

- **`visualSliceApproved` stays `false`** — `.metroforge/visual-slice-approval.json` carries the
  newer `foundry-visual-slice-pr2` rejection note; only an authorized human via Generation Studio
  can approve visual direction. PR #4 stays draft. MASS / LARGE / RELEASE_CANDIDATE stay blocked.
  The reviewable work is done; the decision needed is the human "Approve Visual Direction" call
  on the updated Foundry slice.
- Room 05 art-quality polish and the pickup's interior read are improved (real interactable
  sprites + authored hearth) but a dedicated art pass is still a candidate — human-review-gated.
- The authored courier kit ships 4-frame strips; the V2 pipeline elsewhere uses 10–16. The merge
  makes 4-frame authored strips win for the slice (they animate correctly — frame count is
  derived from real sheet width at runtime). Re-authoring the kit to V2 frame counts, or adding a
  slice-specific pipeline path, is optional future work.
- `cursor/local-asset-worker-acbb` and `cursor/setup-dev-environment-a6d9` are excluded but
  retained as branches; `backup/claude-gen-runtime-20260910` preserves the pre-consolidation
  committed state.
- Still an AI-delegated implementation/verification pass, not personal human approval.
