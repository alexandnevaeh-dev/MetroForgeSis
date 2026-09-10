# MetroForge Production Asset Family Replacement Report

Date: 2026-08-19
Canonical repository: `E:\Projects\MetroForge\Forged`

## 1. Executive Summary

This milestone adds a data-driven production asset family contract and evaluates the deterministic fixture through five intended production families: player, enemy, boss, biome/tileset, and background/parallax. The family layer uses the existing Visual Constitution, Asset Foundry metadata, maturity, provenance, lineage, provider/model fields, technical QA, visual QA, and history systems.

The production pipeline now writes:

- `production-asset-family-report.json`
- existing `visual_constitution.json`
- existing `asset-foundry-report.json`
- existing `visual-qa-report.json`

The controlled fixture remains `metroforge-smoke-metroidvania`, seed `424242`. Its observed result is truthful:

- Runtime: `RUNTIME_VALIDATED`
- Capture: `PASS`
- Whole project: `VISUAL_DEGRADED`
- Production slice: `REVIEW_REQUIRED`
- Player family: `FAMILY_REVIEW_REQUIRED`
- Enemy family: `FAMILY_REVIEW_REQUIRED`
- Boss family: `FAMILY_REVIEW_REQUIRED`
- Biome family: `FAMILY_REVIEW_REQUIRED`
- Tileset family: `FAMILY_REVIEW_REQUIRED`
- Background family: `FAMILY_REVIEW_REQUIRED`

The gate is **PARTIAL**. The family workflow and certification now exist, but provider-backed production replacement could not be completed in this environment: configured image providers were unavailable, so the pipeline correctly retained procedural placeholders rather than misclassifying them as production art.

## 2. Baseline

Before changes, the required baseline was executed:

- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 112 files and 614 tests
- `pnpm smoke:godot`: PASS with `RUNTIME_VALIDATED`

The runtime gate was not weakened. The deterministic fixture, seed, import path, runtime path, screenshot capture, and certification semantics were preserved.

## 3. Production Slice Definition

The scoped production slice contains:

- player family
- one standard enemy family
- one final boss family
- biome/environment family
- biome tileset family
- biome background/parallax family

The implementation uses six typed family records because biome environment and tileset have distinct mandatory asset contracts, while they share the same biome identity. This is the concrete implementation of the requested five-family production scope.

The family requirements are defined in `packages/schemas/src/asset-family.ts` and include mandatory player animation members, enemy/boss action members, biome/prop members, tile source, and far/mid/near background layers.

## 4. Visual Constitution Used

The existing generated VisualDNA is converted into the versioned `VisualConstitution` already introduced in the preceding milestone. Each family record stores:

- constitution ID
- constitution version
- canonical reference IDs
- identity rules
- provider strategy
- provenance seed

The fixture uses the same constitution for every family. No unrelated style was generated independently.

## 5. Asset Family Architecture

Added `packages/schemas/src/asset-family.ts` with:

- `AssetFamilyType`
- `AssetFamilyStatus`
- `AssetFamilyMember`
- `AssetFamily`
- `PRODUCTION_FAMILY_REQUIREMENTS`

Added `packages/qa/src/production-family.ts` with:

- family construction from existing asset metadata
- required member calculation
- placeholder blocking
- technical/visual/consistency score aggregation
- family status calculation
- production slice certification

Family states are:

- `FAMILY_DRAFT`
- `FAMILY_NORMALIZED`
- `FAMILY_CONSISTENT`
- `FAMILY_APPROVED`
- `FAMILY_PRODUCTION_READY`
- `FAMILY_REVIEW_REQUIRED`

No duplicate lineage or provenance system was created.

## 6. Player Family

Required members:

- canonical/player reference
- player base sprite
- walk/run sheet
- attack sheet
- hurt sheet
- death sheet

The generated fixture contains these paths, but the members are procedural fallback assets and therefore remain `FAMILY_REVIEW_REQUIRED`. The existing identity pack infrastructure remains available at `packages/assets/src/identity/pack.ts`, including silhouette, palette, reference image, identity JSON, style fingerprint, and pose paths.

Reference-conditioned player generation remains available through `identity/provider.ts`, but no configured provider with custom-reference support was reachable during this run. The pipeline correctly retained fallback classification instead of promoting derived procedural poses.

## 7. Enemy Family

The scoped family requires idle/base, attack, hurt, and death members for `enemy_000`. The fixture has the generated paths, but the assets are procedural/blockout and do not meet production-ready requirements.

The family contract records biome association, provider/model, technical state, visual state, placeholder status, and defects. Enemy silhouette/readability and family-vs-player comparison remain visual QA follow-ups.

## 8. Boss Family

The scoped family requires base/idle, attack, hurt, and death members for `boss_final`. The fixture contains the expected generated members but they are fallback/procedural. The family remains review-required.

Existing boss phase, arena, VFX, and screenshot QA systems remain active. A production boss family still needs a provider-backed or authored identity reference, attack variants, telegraph review, and native-scale approval.

## 9. Biome Family

The biome family is represented by biome 0 and tracks the environment/prop vocabulary needed to connect terrain, materials, architectural treatment, lighting, and prop language. The current fixture has constitution/VisualDNA/biome kit inputs, but required production environment members remain fallback-heavy.

The family contract records shared constitution and provider strategy so future environment members can be regenerated coherently rather than independently.

## 10. Tileset Family

The tileset family requires `assets/tilesets/biome_0/source.png` plus existing role/terrain metadata. Existing tile compiler, tile roles, terrain metadata, repetition suppression, and Godot TileMap integration remain the implementation path.

The fixture’s procedural tileset is technically assembled but cannot become production-ready because the family has placeholder members and lacks an approved seam/repetition review. Existing `evaluateTerrainProject()` remains available for Godot/role checks.

## 11. Background/Parallax Family

The background family requires far, mid, and near layers. Existing parallax strip generation, layer prompts, alpha processing, fingerprints, and visual scoring are reused.

The fixture does not have a provider-backed approved parallax family in this run. The family remains review-required, and gameplay readability remains a separate screenshot visual-quality concern.

## 12. Providers Used

The production pipeline routed through the existing provider-neutral AssetPipeline/Foundry path. In the controlled run:

- ComfyUI: unavailable
- Diffusers: unavailable
- NVIDIA image path: not selected/available for this local fixture run
- procedural fallback: used

The provider failure and fallback reason were recorded in generation warnings and asset metadata. No provider API was called directly from the family contract.

## 13. NVIDIA Usage

No NVIDIA multimodal expansion was made. Existing NVIDIA image/vision adapters remain optional and catalog/routing controlled. The family workflow accepts any routed provider and does not force NVIDIA. With no eligible reachable provider, fallback remained explicit.

## 14. Reference Conditioning

Existing character identity packs and identity-preserving provider interfaces are used as the intended route:

```text
canonical reference -> identity variation -> animation members -> normalized sheets
```

The current environment did not have an available custom-reference image provider for the fixture. The family report therefore records the intended provider strategy but does not claim reference-conditioned production output.

## 15. Raw Asset Preservation

Existing AssetFoundry cache, asset pipeline source paths, artifact lineage, generation manifest, and asset history remain authoritative. The family report references existing asset paths and metadata; it does not overwrite raw provider output or create a competing history system.

## 16. Normalization

Existing normalization remains in force:

- pixel processing
- transparent-bound fitting
- sprite dimensions
- animation sheets/manifests
- tile compilation
- parallax processing
- deterministic technical PNG validation
- Godot destination metadata

The family gate requires technical validity as a member property, but it does not promote an asset merely because dimensions are valid.

## 17. Animation Alignment

Existing animation manifests, frame critics, identity packs, pose generation, and derived lineage remain the path for player/enemy/boss animation. Required family members are explicit, and missing/placeholder/failed members block family certification.

A universal feet/pivot and frame-anchor approval workflow remains incomplete, so no family was falsely promoted.

## 18. Tile Seam Validation

Existing tile compiler, terrain role, repetition suppression, and visual-gate modules remain integrated. The family contract identifies seam-free repetition as a required identity rule for the tileset family.

The current fixture has not passed a dedicated production seam/corner preview approval, so tileset certification remains review-required.

## 19. Native-Scale Review

Existing gameplay screenshot capture and VisualReviewScreen provide native gameplay evidence. The family contract does not treat enlarged previews as approval. Player/enemy/boss native-scale readability and background separation remain required human/visual QA work for production readiness.

## 20. Visual QA

Existing deterministic scene, animation, VLM, and visual-quality systems remain active. Family members carry `critiquePassed`, defects, provider/model, and placeholder state. The project still receives `VISUAL_DEGRADED` because placeholder coverage fails the configured threshold.

The family gate is stricter than individual PNG validity: a family cannot pass with missing mandatory members or placeholders.

## 21. Family Consistency QA

The family report records shared constitution/version, identity rules, provider strategy, and technical/visual/consistency scores. Current consistency is not enough to overcome placeholder/production coverage failures.

Pairwise VLM/embedding consistency remains unavailable in the local deterministic run and is not fabricated. Future checks should compare player animation members, enemy/boss family members, tile/prop/background relationships, and biome layers.

## 22. Repair/Regeneration

Existing repair/retry infrastructure remains available:

- AssetFoundry provider retries
- health/circuit state
- fallback depth/reason
- visual repair budgets
- deterministic tile/lighting repair
- asset history/lineage

This milestone does not randomly regenerate when providers are unavailable. A missing provider-backed family remains review-required and reports the blocker.

## 23. Variant Selection

Existing manual asset generation supports bounded variants and preview/history. Full family-level variant selection is not yet unified. The new family contract leaves room for variants through member IDs and existing lineage/history, but no destructive replacement was introduced.

## 24. Approval APIs

Existing visual-direction approval and asset history/restore APIs remain available. Full unified `approveAsset`, `rejectAsset`, `regenerateAsset`, `repairAsset`, `selectVariant`, and `restoreVersion` operations for all family members remain a P1 follow-up.

No family is marked approved without the required members passing the family policy.

## 25. Desktop Inspection

The existing asset gallery, manual asset generator, visual review screen, preview surfaces, and history/restore controls remain available. This milestone adds the machine-readable family report but does not redesign the desktop.

A focused per-family inspector with mandatory-member rows, native-scale previews, variant comparison, and family approval remains future work.

## 26. Provenance

Each family member preserves the existing provider/model, seed, prompt/provenance, source path, maturity, fallback reason, parent lineage, compiler, transformation, and Godot resource metadata where present. Constitution ID/version is now also attached at family level.

## 27. Licensing

Existing license classification, retrieval filters, derived-license inheritance, and export audits remain authoritative. A family member cannot become production-ready solely through visual score if license status is unknown/restricted.

The current procedural fixture is not being claimed as commercial production art merely because it is deterministic.

## 28. Placeholder Reduction

This milestone intentionally did not attempt to replace all 111 assets. It did establish the target-family ratio and blockers.

Observed production slice state:

- all scoped family records: `FAMILY_REVIEW_REQUIRED`
- production slice: `REVIEW_REQUIRED`
- whole project: `VISUAL_DEGRADED`
- current project placeholder ratio: approximately `98.2%`
- production-ready ratio: `0%`

The provider outage is the direct blocker for completing actual family replacement in this environment. Procedural fallback remains last-resort and explicitly non-production.

## 29. Slice Certification

The slice-level report is `GeneratedGames/metroforge-smoke-metroidvania/production-asset-family-report.json`.

Observed:

```text
productionSlice: REVIEW_REQUIRED
player: FAMILY_REVIEW_REQUIRED
enemy: FAMILY_REVIEW_REQUIRED
boss: FAMILY_REVIEW_REQUIRED
biome: FAMILY_REVIEW_REQUIRED
tileset: FAMILY_REVIEW_REQUIRED
background: FAMILY_REVIEW_REQUIRED
```

The slice is not production-ready.

## 30. Whole-Project Certification

Whole-project visual status remains `VISUAL_DEGRADED`. Runtime status remains `RUNTIME_VALIDATED`. The family layer does not incorrectly promote the whole game because a subset of members exists.

## 31. Before/After Evidence

The generated family report and existing runtime/visual evidence provide the current baseline, but no genuine provider-backed before/after production comparison could be produced because the configured image providers were unavailable. The report therefore does not claim a visual improvement that did not occur.

The next production run should retain:

- before blockout gameplay screenshot
- after production-family gameplay screenshot
- player before/after and animation sheet
- enemy/boss before/after
- tileset repeated preview
- composed parallax layers

## 32. Godot Integration

The existing Godot assembler and import/resource validation remain unchanged. Family paths use the same generated asset destinations and metadata consumed by Godot scenes. No collision or world topology changes were introduced by the family contract.

## 33. Runtime Regression

The runtime gate was preserved:

- `pnpm smoke:godot`: PASS
- runtime certification: `RUNTIME_VALIDATED`
- capture validity: `PASS`

Visual degradation does not change runtime certification. No runtime gate was weakened to make family reporting pass.

## 34. Test Results

Baseline and final regression retained the existing suite:

- 112 test files passed
- 614 existing tests passed

New focused tests include:

- `packages/qa/src/production-family.test.ts`: family creation, required members, placeholder blocking, production readiness
- existing constitution/normalization/foundry tests remained green

The new family contract and pipeline integration passed typecheck/build validation.

## 35. Build Results

- `pnpm install --frozen-lockfile`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS
- `pnpm build`: PASS
- `pnpm desktop:build`: PASS
- `pnpm smoke:generate`: PASS
- `pnpm smoke:godot`: PASS
- `pnpm validate`: PASS

## 36. Performance

The family report aggregates already-generated metadata and does not regenerate or decode the entire library. Existing cache, bounded provider retries, and asset history remain in use.

Large provider-backed family generation, VLM pairwise analysis, native-scale preview batches, and high-resolution source retention were not run in this offline/provider-unavailable fixture pass.

## 37. Remaining P0

- Make at least one coherent provider-backed or properly authored candidate path available for the controlled fixture.
- Complete the five scoped family members without allowing procedural fallback to pass production certification.

## 38. Remaining P1

- Add provider-backed player identity/reference generation and animation family replacement.
- Add coherent enemy and boss family production assets with attack/hurt/death readability.
- Add biome tileset seam/corner preview and background/parallax family generation.
- Implement family-level variant selection and approval APIs using existing history/lineage.
- Add focused desktop family inspector with native-scale and side-by-side variant views.
- Add before/after visual evidence and run the production-family workflow with reachable providers.
- Add pairwise family consistency scoring using VLM/embedding services when available.

## 39. Files Changed

Production family changes:

- `packages/schemas/src/asset-family.ts`
- `packages/schemas/src/index.ts`
- `packages/qa/src/production-family.ts`
- `packages/qa/src/production-family.test.ts`
- `packages/generation/src/pipeline.ts`
- `METROFORGE_PRODUCTION_ASSET_FAMILY_REPLACEMENT_REPORT.md`

Previous milestone files and unrelated user/generated worktree changes were preserved. The sibling `Forged-cursor-desktop` tree was not modified.

## 40. Commands Run

From `E:\Projects\MetroForge\Forged`:

```powershell
pnpm typecheck
pnpm test
pnpm smoke:godot
pnpm install --frozen-lockfile
pnpm build
pnpm desktop:build
pnpm smoke:generate
pnpm validate
```

Focused family validation:

```powershell
pnpm exec vitest run packages/qa/src/production-family.test.ts packages/assets/src/asset-normalizer.test.ts packages/schemas/src/visual-constitution.test.ts
```

Generated evidence:

```text
GeneratedGames/metroforge-smoke-metroidvania/production-asset-family-report.json
```

## 41. Recommended Next Milestone

**Provider-Backed Player Family**: make one reachable provider or authored licensed fixture available, complete the player canonical reference plus required animation members, normalize and approve it at native scale, integrate it into Godot, and use that proven identity-preserving workflow as the template for enemy, boss, biome, tileset, and background families.

# PRODUCTION ASSET FAMILY REPLACEMENT PARTIAL
