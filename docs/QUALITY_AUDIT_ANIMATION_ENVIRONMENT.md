# Quality Audit: Animation, VFX, Environment

Date: 2026-09-26  
Root: `E:\Metroforge\MetroForge-Publish` (note: `E:\Projects\MetroForge\Forged` does not exist)  
Scope: character/combat animation, VFX attachment, room semantics, biome consistency, large spaces

## 1. Current animation architecture

| Layer | Location | Role |
|---|---|---|
| Clip specs | `packages/assets/src/player-animation-spec.ts` | Frame counts, FPS, loop, `AttackSyncMetadata` (hitbox/vfx/sfx frames) |
| Pose transforms | `packages/assets/src/png.ts` `POSE_TRANSFORMS` / `generatePoseStill` / `generateProgressionSheet` | Shear/crop/tint warps of a single still |
| Walk/run/attack sheets | `png.ts` `generateWalkCycleSheet`, `generateRunCycleSheet`, `generateAttackSheet` | Multi-frame strips |
| Sidecar | `player_animations.json` via `buildAnimationMetadataSidecar` | **Only** `{frameCount,fps,loop}` — combat sync is dropped |
| Runtime playback | `templates/godot-metroidvania/scripts/core/AnimatedAssetSprite.gd` | Loads sheets + FPS from sidecar |
| Combat | `PlayerController.gd` `_perform_attack` | Activates hitbox **immediately**, fixed 0.15s timer — ignores clip sync |
| Unity cadence | `docs/ANIMATION_TIMING_VALIDATION.md` | Gait phase / speed-scale checks only |

## 2. Why movement looks unnatural

- Default path is **procedural pose warps** (crop/shear/scale/tint), not articulated body mechanics.
- Walk vs run are separate generators but still silhouette morphs, not weight transfer / stride / lean.
- Idle/jump/fall/land are **progression-ramp/oscillate** of the same still — reads as floaty/robotic.
- When AI poses fail (VRAM / missing Python / critic down), pipeline warns and keeps bob/slide sheets.
- No anticipation → strike → follow-through body phases in generated pixels beyond attack-arc sheet heuristics.

## 3. Current combat / VFX timing

- Spec has `combatSync.{hitboxOnFrame,hitboxOffFrame,vfxFrame,sfxFrame,comboCancelOpenFrame}` for attack / attack_2 / attack_3.
- Runtime **does not consume it**. Hitbox on at attack start; `AttackTimer` 0.15s off.
- `packages/engines/src/gameplay-pack.ts` hardcodes `hitboxSeconds: 0.15`.
- VFX: `VFXManager.gd` pools GPUParticles at a **global_position**; landing dust is the main player call site. No weapon socket, no slash trail tied to frames.

## 4. Why effects are misplaced

- No character socket system (`weapon_tip`, `hand_right`, etc.).
- No AttackDefinition linking animation ↔ hitbox ↔ VFX ↔ facing.
- Effects spawned at actor root / feet, not collision contact or weapon arc.
- VFX textures are style-generic particle sheets; ArtDirection inheritance is prompt-level only.

## 5. Current room-generation architecture

Order today (approx): world graph → gameplay archetypes (`combat`/`traversal`/…) → tile layout → props/storytelling → compose-visuals.

Key files:
- `packages/procedural/src/room-archetypes.ts` — **gameplay** tags only
- `packages/procedural/src/world.ts` — one node per room; label `Room N`
- `packages/godot/src/tile-layout.ts` + `room-assembler.ts` — geometry
- `packages/godot/src/composition/room-blueprint.ts` — composition contract (still gameplay-axis)
- `packages/procedural/src/visual/biome-dna.ts` — motif packs (shared materials language)
- `packages/procedural/src/visual/environment-kit.ts` — prop/architecture **lists**, not geometry programs
- `packages/procedural/src/visual/storytelling.ts` — prop beat overlays

## 6. Room == screen?

**Mostly yes.** Each world-graph room → one Godot room scene with width/height usually one camera frame. No `MajorRoom` / `SubArea` / multi-screen span. Composition zones exist inside a room but are not hierarchical multi-screen spaces.

## 7. Existing biome constraints

`BiomeVisualDNA` + motif library (`drowned_masonry`, `ashen_foundry`, …) written to `visual/biomes.json`. Kits rotation can still drift room-to-room; no hard reject for biome-breaking materials in tile paint.

## 8. Existing environment archetypes

**Missing as architectural types.** No `castle_hall` / `library` / `crypt` driving **geometry**. “Flooded library” exists only as a storytelling beat (props). RoomSchema.archetype enum is gameplay-only.

## 9. Visual consistency mechanisms

- Genre `referenceTags` → ArtBible prefixes / VisualDNA anchors (recent)
- StyleBible / VisualDNA / BiomeVisualDNA
- `auditRoomArchetypeFidelity` (gameplay tag preservation)
- Animation critic + unique-frame ratio gates
- Modern Metroidvania quality gate (advisory)

## 10. Reusable systems

- `PLAYER_ANIMATION_SPEC` + combatSync fields (extend, don’t replace)
- AnimatedAssetSprite sidecar loader (extend schema)
- BiomeVisualDNA / EnvironmentKit / RoomBlueprint / compose-visuals
- Genre capability registry
- QA validator hooks

## 11. Required architectural changes (priority)

1. **AttackTiming** full phase model + persist in sidecar + Godot/Unity consume  
2. Animation events (`footstep_*`, `hitbox_enable`, `weapon_swing`)  
3. VFX sockets + AttackDefinition (slash follows facing; impact at contact)  
4. Frame consistency critic (reject drift before compile)  
5. **EnvironmentArchetype** registry affecting geometry + props + lighting  
6. Room purpose → archetype → traversal plan → geometry (enforce order)  
7. MajorRoom / SubArea / multi-screen dimensions  
8. Stronger BiomeIdentity enforcement in tile/prop selection  
9. Spatial continuity (elevation / door facing)  
10. RoomQualityScore + regenerate/repair loop  

## Implementation status (this pass)

- [x] Audit documented (`docs/QUALITY_AUDIT_ANIMATION_ENVIRONMENT.md`)
- [x] `AttackTiming` + events persisted in `player_animations.json` sidecar
- [x] Godot `PlayerController` consumes combat sync (hitbox/VFX timed to frames)
- [x] `EnvironmentArchetype` registry + world-graph metadata assignment
- [x] Architecture placement reacts to library/hall/tower/crypt identities
- [x] Major-room target tile sizes flow into room assembly
- [ ] Full socket nodes + impact-at-collision VFX
- [ ] Reject/repair loop for sprite frame drift
- [ ] Gothic-castle fixture regen + human approve/deny
- [ ] Unity/Unreal consumer of AttackTiming (Godot wired first)
