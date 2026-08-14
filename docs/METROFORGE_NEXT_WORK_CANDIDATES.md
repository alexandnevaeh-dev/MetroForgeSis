# MetroForge — Next Work Candidates

Companion to [`METROFORGE_COMPLETE_BUILD_STATE.md`](./METROFORGE_COMPLETE_BUILD_STATE.md) (full evidence and citations live there — this document is the actionable backlog derived from it, ranked). Audit date: 2026-08-14.

Each candidate lists what it solves, why it's ranked where it is, dependencies, affected files, acceptance criteria, complexity, and risk. Recommended order follows the numbering.

---

## 1. Fix the `apps/desktop` renderer build

**Problem solved:** the entire Electron desktop app currently cannot be built or shipped.
**Why now:** smallest, most fully-diagnosed fix available; blocks everything else about the desktop product.
**Dependencies:** none.
**Files affected:** `packages/shared/package.json` (subpath export added, uncommitted), `apps/desktop/src/studio/SettingsScreen.tsx` (import needs updating to the new subpath).
**Acceptance criteria:** `pnpm --filter @metroforge/desktop build` exits 0; `SettingsScreen.tsx` still functions identically (manual smoke test of the Settings screen).
**Estimated complexity:** SMALL.
**Risk:** near-zero — additive export, no behavior change for the 47 other Node-context consumers of `@metroforge/shared`.

---

## 2. Close top-down's `RuntimeSmokeTest.gd` coverage gap

**Problem solved:** top-down's "verified working" claim currently rests on ~15 checks vs side-view's 100+, even though quests/dialogue/shops/inventory/save-migration are equally real systems for top-down (confirmed this audit). This is a real risk of shipping an unverified regression in any of those systems.
**Why now:** this is the single largest *credibility gap* found in the audit — the underlying game is real, the safety net around it isn't.
**Dependencies:** none (all target systems already exist and are wired).
**Files affected:** `templates/godot-topdown-adventure/scripts/test/RuntimeSmokeTest.gd`.
**Acceptance criteria:** top-down smoke test asserts, at minimum: quest accept/complete/reward, dialogue branching + choice actions, shop purchase, inventory equip, minimap/save-migration v1→v2, death/respawn — mirroring side-view's check categories, run against the real Godot binary until passing.
**Estimated complexity:** LARGE (mirrors ~1500 lines of side-view test logic against different top-down APIs).
**Risk:** low to the product itself (test-only file), but expect to surface 1-3 real bugs in the process — same pattern as this session's playtest debugging (every deep test-coverage pass this session found real bugs, not just gaps).

---

## 3. Fix player/enemy animation source mismatch

**Problem solved:** currently, even when a real AI-generated character still exists, the walk/attack/hurt animation sheets are built from a *procedural placeholder shape*, not the real art — a visible, confusing quality regression a user would notice immediately (character portrait looks real, in-game sprite looks like a colored block).
**Why now:** highest-visibility "looks implemented but isn't" gap found this audit; directly affects perceived asset quality, which is the audit's lowest-scoring area (45%).
**Dependencies:** none.
**Files affected:** `packages/assets/src/asset-pipeline.ts:517-528,570-581` (player/enemy sheet generation) — needs to match the pattern already used correctly at `:632-728` (NPC/boss sheet generation, which does pass the real AI sprite buffer as source).
**Acceptance criteria:** a generated project's player/enemy walk-attack-hurt sheets are visibly derived from the same character art as their still image, verified by diffing/inspecting output PNGs from a real generation run.
**Estimated complexity:** MEDIUM.
**Risk:** low — narrowing an existing code path to match a pattern already proven correct elsewhere in the same file.

---

## 4. Decide and enforce real `PRODUCTION_READY` semantics

**Problem solved:** the asset-maturity ladder defines a `PRODUCTION_READY` state that literally nothing in the codebase ever assigns, and the actual production-readiness gate is a blocklist that lets un-critiqued `GENERATED_SOURCE`/`COMPILED` assets pass. This is a real gap between what the system's own naming promises and what it enforces.
**Why now:** affects the honesty of every `productionReady: true` project the pipeline reports — worth resolving before this claim reaches more users.
**Dependencies:** requires a product decision first (see below), not just code.
**Files affected:** `packages/shared/src/asset-maturity.ts`, `packages/generation/src/project-completion.ts:131-166`, `packages/assets/src/asset-pipeline.ts` (wherever critique results currently stop short of promotion).
**Product decision needed:** should the gate become a real allowlist (only `QA_REVIEW`/`PRODUCTION_READY` pass — likely fails more current real projects, more honest) or should `PRODUCTION_READY` be retired/renamed to match what's actually reachable (`QA_REVIEW` becomes the real ceiling, less rework, less honest naming)? Recommend the former if a real critique pipeline can realistically promote assets that pass it; the latter if not.
**Estimated complexity:** MEDIUM (mostly the decision; the code change itself is contained).
**Risk:** medium — changing gate strictness could flip previously-"production ready" projects to failing; needs a before/after regression check against a few real generations.

---

## 5. Remove or wire in `RoomTileMap.gd`

**Problem solved:** a complete, working tile-painting implementation sits unreferenced anywhere in the codebase — dead weight that misleads anyone reading `templates/godot-metroidvania/scripts/world/`.
**Why now:** trivial cleanup, but worth doing before it's mistaken for live code by a future contributor.
**Dependencies:** none.
**Files affected:** `templates/godot-metroidvania/scripts/world/RoomTileMap.gd`.
**Acceptance criteria:** either deleted (if truly superseded by the current room-scene generation path) or wired into a real `.tscn` with a `class_name` and a purpose, confirmed via a real generation + Godot smoke test.
**Estimated complexity:** SMALL.
**Risk:** near-zero either way — it's currently inert.

---

## 6. Cover `wall_jump`/`wall_slide`/`grapple` in the movement-feasibility validator

**Problem solved:** 3 of the 8 traversal abilities are explicitly excluded from the real physics reach-check in `movement-feasibility.ts` — a generated room could require a wall-jump gap the player genuinely cannot make, and the QA gate would not catch it.
**Why now:** a real, if narrow, correctness gap in a QA gate that's otherwise fully trustworthy (matters more as room generation gets more ambitious).
**Dependencies:** none.
**Files affected:** `packages/procedural/src/movement-feasibility.ts:88-102,149`.
**Acceptance criteria:** real reach formulas for wall_jump (using `wall_jump_horizontal`/`wall_jump_vertical`) and grapple (using `grapple_speed`) are added and cross-checked against `PlayerMovementConfig.gd`'s actual constants, with a test asserting a deliberately-infeasible gap is rejected.
**Estimated complexity:** MEDIUM (needs real physics derivation, not just wiring).
**Risk:** low — additive validation, could only make the gate stricter (never looser).

---

## 7. Remove or wire in top-down's `AbilityPickup.gd`

**Problem solved:** vestigial script still emits `ability_acquired` and is referenced by a test/scene, but `TopDownPlayerController.gd` never consumes abilities at all — dead code masquerading as a feature.
**Why now:** small, but directly relevant to keeping top-down's design model (item-gated, not ability-gated) honest and unambiguous for future contributors.
**Files affected:** `templates/godot-topdown-adventure/scripts/world/AbilityPickup.gd`, its `.tscn`, and its one reference in `test/PlaytestAgent.gd`.
**Acceptance criteria:** removed cleanly with no dangling scene/script references (verify via a real generation + `required_files`/`asset_references_valid` QA gates).
**Estimated complexity:** SMALL.
**Risk:** near-zero.

---

## 8. Real particle/shader VFX (replace the fixed 8-effect procedural library)

**Problem solved:** every generated project currently has visually identical VFX (same 8 gradient-sprite effects, same colors/sizes) regardless of theme or seed — a noticeable "every game looks the same" tell.
**Why now:** meaningful visible-quality improvement, but genuinely optional relative to the P1 items above.
**Dependencies:** none for a procedural-variety approach; a real-particle approach would need Godot `GPUParticles2D`/`.gdshader` authoring added to the template, which is new template surface area, not just pipeline work.
**Files affected:** `packages/assets/src/asset-pipeline.ts:170-227`, `packages/assets/src/png.ts:128-165`, and (if going the real-particle route) new `.gdshader`/`GPUParticles2D` scenes in both templates plus `VFXManager.gd`.
**Acceptance criteria:** at minimum, per-project VFX color/style variety driven by the design bible's palette; ideally, real particle-based effects for at least the most visible ones (hit_spark, death_puff).
**Estimated complexity:** MEDIUM (palette variety) to LARGE (real particles/shaders).
**Risk:** low for palette variety; medium for real particles (new Godot-side surface area needs its own runtime QA coverage).

---

## 9. Real autotile/terrain-set tileset generation

**Problem solved:** tilesets currently have no edge/corner/autotile logic — every room's terrain is visually flat/blocky regardless of biome sophistication.
**Why now:** meaningful visible-quality improvement, genuinely optional and large.
**Dependencies:** none, but is a substantial standalone effort.
**Files affected:** `packages/assets/src/pixel-art-processor.ts` (slicing logic), `packages/godot/src/room-assembler.ts` (TileMapLayer/TileSet consumption), likely a new Godot `TileSet` terrain-authoring step.
**Estimated complexity:** LARGE.
**Risk:** medium — touches the room-rendering path directly; needs careful regression testing against existing `required_scenes_exist`/screenshot QA gates.

---

## 10. ~~Real (or honestly renamed) Furnace audio export~~ — DONE (renamed)

**Resolved 2026-08-14:** renamed rather than building a real `.fur` binary writer (Furnace's format is an undocumented, versioned, zlib-compressed binary structure — a LARGE, low-value reverse-engineering effort for a niche tracker). `FurnaceModule`/`exportFurnaceModule` → `TrackerInterchangeModule`/`exportTrackerInterchange` in `packages/procedural/src/music.ts`, output file renamed `<id>.fur.json` → `<id>.tracker-interchange.json` (`packages/generation/src/pipeline.ts`), and the generation-phase report string no longer says "Furnace". The JSON content and its `recreationHint` (formerly `openmptHint`) field are unchanged — it was already an honest manual-reconstruction aid, just mislabeled.

---

## 11. Procedurally-generated top-down dungeons (replace the fixed 4-room template)

**Problem solved:** every top-down dungeon currently has the same 4-room layout regardless of seed/profile — limits real replayability for the newer archetype.
**Why now:** meaningful depth improvement, clearly optional/future relative to shipping-blockers.
**Files affected:** `packages/procedural/src/topdown/world.ts:347-409` (`buildDungeonRooms`).
**Estimated complexity:** LARGE.
**Risk:** medium — dungeon layout changes ripple into item-gating logic, reachability validation, and the playtest route planner; needs the same kind of exhaustive live-Godot verification this session did for combat.

---

## 12. Mini-boss concept for top-down dungeons

**Problem solved:** `getDungeonGraph.miniBossId` is always undefined — no mid-dungeon boss beat exists for top-down.
**Why now:** genuinely optional/future, flagged in prior session docs and reconfirmed still absent.
**Dependencies:** benefits from #11 (procedural dungeons) but not strictly blocked by it.
**Estimated complexity:** MEDIUM.
**Risk:** low.

---

## Recommended order

1 → 2 → 3 → 4 → 5 → 6 → 7, then 8/9/10 in whatever order best matches product priorities (visual polish vs audio correctness), then 11 → 12 last (both genuinely optional/future work, not gaps in what's promised today).

Items 1, 5, and 7 are quick wins worth batching together in a single small pass. Item 2 is the one item on this list that materially changes *confidence* in the existing product (it doesn't add anything new — it proves what's already claimed). Items 3 and 4 are the two changes most likely to be visible to an actual end user looking at generated output today.
