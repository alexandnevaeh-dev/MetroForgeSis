# Genre Architecture Audit + Phase 1

Date: 2026-09-26  
Root: `E:\Metroforge\MetroForge-Publish`  
Refs: `E:\MetroForgeData\VisualRefs\genre-architecture-20260926\`

## Current state (pre–Phase 1)

- Two-value enum: `SIDE_VIEW_METROIDVANIA` | `TOP_DOWN_ACTION_ADVENTURE`
- Thin `GameArchetypePlugin` in `packages/shared/src/archetypes.ts`
- Real forks: dual Godot templates, dual world generators, ability vs dungeon-tool namespaces
- ~28 production files still branch on archetype strings / `isTopDownArchetype`
- Plugin fields like `navigation_agent` were aspirational (top-down uses walkability grid)

## Key design rule

**Perspective ≠ progression.** Side-view vs top-down are locomotion/camera/room grammars. Ability-gated Metroidvania progression can apply to either (top-down today uses item/tool gates by default).

## Phase 1 landed

| Piece | Location |
|---|---|
| Zod capability / dimension schemas | `packages/schemas/src/genre.ts` |
| Runtime `GenreDefinition` registry + `genreSupports` / `genreCapability` | `packages/shared/src/archetypes.ts` |
| Legacy `GameArchetypePlugin` derived from definitions | same file (compat) |
| Honest top-down nav model | `WALKABILITY_GRID` (not fake `navigation_agent`) |
| First capability consumers | authored kit, VisualDNA projection, QualityDirector gate |

## Phase 2 status

Production call sites migrated off `isTopDownArchetype` / raw archetype string forks onto
`genreSupports` / `genreUsesDungeonTools` / `getGenreDefinition` in:

- pipeline, assembler, project-completion, remap-project-abilities
- asset-pipeline, authored-kit, content, bibles, visual/dna, validator
- game-dna, genre-design-brief, visual-slice, scaffold-manual-project
- desktop GenerationStudio + DungeonEditor preview branches

`GenreDefinition.referenceTags` now feed ArtBible prompt prefixes and VisualDNA anchors.
`isTopDownArchetype` remains as a thin perspective helper for tests/compat.

## Still open

4. Top-down quality pass profile labeled `top_down_action_adventure` (QualityDirector still side-view-only; gate remains `supportsSideViewQualityPass`)  
5. Fixture gens Unity→Godot→Unreal with HK / ALTTP+HLD art locks — awaiting human approve/deny (animation still bob/slide on this hardware)  
6. Optional: fully discriminate GameDNA movement/abilities at the schema level

## Visual locks (user refs)

- Side-view: Hollow Knight language (layered, cool palette, high-contrast player)  
- Top-down: ALTTP dungeon grammar + Hyper Light atmosphere — **separate art set**  
- Broader matrix: Ori, SotN, Blasphemous, Lost Crown, Death’s Door, CrossCode, Tunic, Unsighted, …
