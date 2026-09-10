# MetroForge Asset Foundry & Visual Coherence Report

Date: 2026-08-19
Canonical repository: `E:\Projects\MetroForge\Forged`

## 1. Executive Summary

This milestone formalizes MetroForge’s existing visual systems into a project-level asset-foundry and visual-certification path without weakening runtime validation. The generation pipeline now writes:

- `visual_constitution.json`
- `asset-foundry-report.json`
- `visual-qa-report.json`

The constitution is versioned and derived from existing VisualDNA. Every foundry asset record carries the constitution version, quality tier, maturity, placeholder status, provider/model, and defects. Visual certification is separate from runtime certification.

The deterministic smoke project demonstrates the intended behavior:

- Runtime certification: `RUNTIME_VALIDATED`
- Screenshot capture validity: `PASS`
- Visual certification: `VISUAL_DEGRADED`
- Assets: `111`
- Placeholder ratio: `98.2%`
- Production-ready ratio: `0%`
- Visual consistency score: `96`

The gate is **PARTIAL**. The architecture and hard placeholder policy are in place, but the current generated output is still overwhelmingly procedural/blockout art. This milestone makes that failure explicit and machine-readable; it does not claim production art that does not exist.

## 2. Previous Visual Bottleneck

The runtime closure proved that MetroForge can generate, import, launch, inspect, capture, and certify a Godot project. The remaining product failure was visual: the smoke output contained 109/111 procedural placeholder/blockout assets and received degraded aesthetic screenshot scoring.

The previous system already had useful pieces, but they were distributed across VisualDNA, style contracts, foundry manifests, asset maturity, provenance, image routing, sprite/tile processors, VLM critics, visual scoring, repair, and desktop visual review. There was no single project-level constitution/report that made visual eligibility and placeholder ratio authoritative.

## 3. Asset Foundry Architecture

The current architecture is modular:

```text
GameDNA / VisualDNA
    -> visual_constitution.json
AssetRequest
    -> ImageProviderRegistry / AssetFoundry routing
    -> raw provider/retrieved/procedural output
    -> compiler / pixel processor / tile compiler
    -> deterministic technical QA
    -> VLM/scene/animation critique where available
    -> provenance + maturity + lineage
    -> asset-foundry-report.json
    -> visual-qa-report.json
    -> visual certification
    -> Godot assembly
```

Existing reusable modules include `packages/assets/src/foundry/*`, `packages/assets/src/asset-pipeline.ts`, `packages/generation/src/artifact-lineage.ts`, `packages/generation/src/asset-history.ts`, `packages/qa/src/visual-quality.ts`, and `apps/desktop/src/studio/VisualReviewScreen.tsx`.

## 4. Visual Constitution

Added `packages/schemas/src/visual-constitution.ts` with a versioned `VisualConstitutionSchema`. It records:

- art direction and rendering style
- perspective, target resolution, sprite scale, and tile size
- global, shadow, highlight, accent, UI, and biome palettes
- lighting direction, contrast, ambient and emissive language
- character, environment, enemy, boss, prop, UI, and VFX language
- silhouette, material, animation, forbidden-trait, and consistency rules
- provenance and seed

The generation pipeline derives a constitution from existing VisualDNA and writes it to `visual_constitution.json`. `visualConstitutionIsStale()` provides the version comparison primitive needed for future non-destructive stale-asset invalidation.

## 5. Asset Manifest

The existing `FoundryManifest` remains the canonical foundry manifest and was not duplicated. It already tracks expected IDs, assets, provider/model, QA state, source type, placeholder status, validation, missing/failed IDs, and Godot destinations.

The new project-level report aggregates the richer `assetMetadata` already produced by `AssetPipeline`, including maturity, fallback depth/reason, selected provider/model, style fingerprint, source/derived license, parent lineage, compiler, Godot resource path, repair count, and transformation.

## 6. Asset Taxonomy

The existing `AssetRequestSchema` supports the requested broad taxonomy: player, NPC, enemy, boss, weapon, armor, item, pickup, tileset, terrain, platform, prop, door, portal, background, parallax, UI, HUD, icon, portrait, VFX, texture, material, animation, concept, promotional, 3D model, audio, music, and voice.

Animation manifests and asset-pipeline categories cover idle, walk/run, jump/fall/land, dash, attack, hurt, death, ability, and boss-related output. The remaining limitation is depth of per-category production content, not lack of category identifiers.

## 7. Provider Routing

Image routing remains provider-neutral through `ImageProviderRegistry`, `AssetFoundry`, registration/bootstrap, health gates, provider scoring, routing modes, retrieval, caching, retry budgets, and fallback depth. Existing providers include ComfyUI, Diffusers, NVIDIA image/vision, Automatic1111, Hugging Face, Stability, DeepAI, Replicate, Kenney, and OpenGameArt.

`AssetFoundry` requests normalized `AssetRequest` data and converts provider results through compilation, QA, provenance, licensing, and Godot adaptation. It does not make the project-level report depend on one provider.

## 8. NVIDIA Multimodal Integration Status

NVIDIA text/NIM, image, and vision adapters exist and are covered by provider tests. NVIDIA image/vision remains optional and catalog/configuration-driven. This milestone did not expand NVIDIA model families or make NVIDIA the visual backbone.

The foundry remains provider-neutral. Model IDs continue to come from catalog/configuration and routing health rather than hardcoded production assumptions. NVIDIA is not required for unit tests, deterministic smoke generation, or the visual certification policy.

## 9. Raw Asset Preservation

Existing foundry cache and provenance preserve provider/model/seed/prompt hashes and source information. `AssetPipeline` retains source paths for compiled derivatives, parent artifact IDs, transformations, and licenses. Raw provider output is not silently treated as approved production art.

The current storage layout is still project-convention-driven rather than a fully enforced `source/generated/normalized/approved/rejected` directory tree. That remains a production follow-up.

## 10. Normalization Pipeline

Existing normalization includes `PixelArtProcessor`, sprite dimension classes, frame compilers, atlas/tile compilers, parallax processing, VFX background knockout, UI foundry helpers, animation manifests, and Godot destination/import hints.

This milestone adds the fast deterministic `validateTechnicalPng()` gate in `packages/assets/src/asset-normalizer.ts`. It checks:

- PNG decode validity
- expected dimensions
- alpha presence when required
- visible-pixel count
- blank/fully transparent images

It runs before expensive visual analysis in the new unit surface. Full image-family normalization remains incomplete.

## 11. Sprite Processing

Existing sprite processing supports transparent-bound extraction, frame fitting, size classes, pixel-art processing, pose/sheet generation, animation manifests, animation identity critique, and Godot-ready compiled outputs. Sprite metadata includes maturity, source type, style fingerprint, anchors/transform lineage where available, and production readiness.

Remaining gap: a universal non-destructive pivot/feet-anchor contract across every animation provider and a first-class approval workflow for each frame family.

## 12. Animation Processing

Existing animation generation and QA cover walk/hurt/attack/death sheets, pose stills, identity-preserving provider adapters, fake-animation detection, animation manifests, frame critique, and contact-sheet assembly.

The new visual constitution contributes explicit animation rules and version context, but does not pretend derived procedural poses are production-ready. `AssetMaturity` continues to keep fallback/placeholder animation below production readiness.

## 13. Tileset Processing

Existing tile support includes tile source generation, terrain variants, tile roles, atlas compilation, TileMap/Godot adapter metadata, tile repetition suppression, seam-softening, and tile compiler tests. `runFoundryQA()` validates tile divisibility against the requested tile size.

Missing production depth includes broad seam preview grids, corner-transition fixture coverage, and visual approval of repeated 3x3/biome compositions. Those are P1 follow-ups.

## 14. Background/Parallax Processing

Existing parallax strips explicitly represent far/mid/near layers, provide prompts and size contracts, punch transparency, and expose fingerprints for visual scoring. VisualDNA also records background language and scroll motion.

The foundry report preserves these assets and the constitution’s background constraints. A fully enforced four-layer `far/mid/near/foreground` storage contract remains future work.

## 15. UI/VFX Processing

UI foundry helpers generate panel/icon assets and VFX utilities generate/clean effect textures. Technical alpha and dimensions are now covered by the deterministic image validator. Runtime and visual QA remain distinct: UI/VFX can be technically valid while still receiving visual defects.

A complete nine-slice, text-safe-zone, blend-mode, and native-scale approval pipeline is not yet implemented.

## 16. Technical Image Validation

Added deterministic validation before expensive visual inspection:

- malformed PNG detection
- decode errors
- expected width/height
- alpha requirement
- visible-pixel count
- blank/fully transparent rejection

Tests cover valid, malformed, blank, and dimension-mismatch cases. Existing foundry QA remains responsible for request-specific animation/tile constraints and deterministic asset checks.

## 17. Visual Analysis

Existing provider-neutral visual interfaces include `VisionCritic`, `VLMCritic`, NVIDIA vision, scene critique, animation critique, and deterministic fallback checks. The visual-quality scorer evaluates gameplay screenshots for occupancy, luma, wallpapering, palette/readability, presentation, parallax, UI, tile repetition, and composition.

The new report does not fabricate VLM scores when VLM services are unavailable. It records visual certification from deterministic asset metadata and existing score inputs.

## 18. Consistency Analysis

Existing consistency signals include VisualDNA/style fingerprints, character identity packs, biome VisualDNA, reference asset IDs, identity-preserving providers, lineage, palette/style contracts, and scene/animation critics.

The project report records constitution version and per-asset style fingerprints. Assets with missing or mismatched fingerprints do not silently become production-ready. Embedding-based image consistency is not yet wired as a required gate.

## 19. Defect Taxonomy

Existing `VisualDefect` values cover player scale/contrast, tile repetition, flat backgrounds, parallax similarity, prop density, lighting, UI contrast, enemy silhouette, palette, style mismatch, wallpaper capture, material language, raw geometry/platform presentation, debug HUD, generic boss rooms, and architectural treatment.

The technical validator adds deterministic malformed/blank/dimension issues. The report preserves per-asset defect lists and hard visual certification failures without conflating them with runtime failures.

## 20. Repair System

Existing repair mechanisms include `visual-repair.ts`, Godot tile repetition suppression, lighting adjustment, room visual retile operations, bounded visual repair budgets, and `QualityDirector` integration. The foundry itself already has retry budgets, provider health/circuit handling, cache, and fallback depth.

The current milestone formalizes the certification output but does not add destructive regeneration. Repairs remain bounded and provenance-aware where existing modules support them.

## 21. Regeneration System

Existing AssetFoundry retry/fallback behavior records attempt depth, provider failure, cache hits, selected provider/model, and fallback reason. Asset history and lineage support future partial regeneration and stale-descendant invalidation.

A complete user-facing `approve/reject/regenerate/selectVariant/restoreVersion` API is not yet unified across all asset types. The desktop Visual Review screen currently supports visual-direction approve/reject, not full asset-variant lifecycle management.

## 22. Provenance

Provenance is retained through `AssetProvenance`, artifact metadata, cache keys, lineage, parent IDs, prompt hashes, seed, provider/model, compiler/transformation, source path, and Godot resource path. The constitution adds a versioned visual-context provenance record.

The smoke-generated foundry report exposes these fields per asset where available. Secrets are not included.

## 23. License Handling

Existing foundry license classification, commercial-use checks, provider metadata, source/derived license inheritance, retrieval license filters, and export-license audit remain active. Unknown/restricted status is not silently converted to commercial safety.

The visual certification report does not override license decisions. A visually approved asset with an incompatible license cannot become production-ready through this report alone.

## 24. Placeholder Handling

The existing maturity ladder and new quality-tier classification enforce:

- `BLOCKOUT`
- `PROCEDURAL_PLACEHOLDER`
- `DRAFT_GENERATED`
- `NORMALIZED`
- `VISUALLY_VALIDATED`
- `APPROVED`
- `PRODUCTION_READY`

Procedural/fallback assets remain explicitly non-production. The default visual policy is configurable and currently requires placeholder ratio at most 20%, production-ready ratio at least 80%, and consistency score at least 80 for `VISUAL_PRODUCTION_READY`.

The smoke project is correctly classified `VISUAL_DEGRADED`: 98.2% placeholders and 0% production-ready assets.

## 25. Quality Certification

Added project-level certification through `certifyVisualAssets()`:

- `VISUAL_UNVALIDATED`
- `VISUAL_DEGRADED`
- `VISUAL_VALIDATED`
- `VISUAL_PRODUCTION_READY`

Runtime certification remains independent. The smoke project demonstrates the distinction:

```text
Runtime: RUNTIME_VALIDATED
Capture: PASS
Visual: VISUAL_DEGRADED
```

The report does not treat a high consistency score alone as production readiness when coverage and placeholder policy fail.

## 26. Visual Inspection UI

The existing `VisualReviewScreen.tsx` displays VisualDNA, automated visual scores/verdicts, defects, representative captures, and approve/reject visual-direction controls. Existing asset gallery and preview surfaces remain available.

This milestone provides richer machine-readable foundry/visual report data but does not redesign the desktop. A first-class per-asset detail/variant/history inspector remains a P1 follow-up.

## 27. Performance

Technical validation is deterministic and cheap relative to VLM/provider calls. The existing foundry cache, provider health gates, bounded retries, and virtualized desktop asset lists remain in place. The new report aggregates already-produced metadata and does not decode the entire asset library again.

Large-library lazy previewing, worker-based image analysis, and bounded visual report concurrency remain future production work.

## 28. Tests

New tests:

- `packages/schemas/src/visual-constitution.test.ts`: constitution parsing and stale-version detection
- `packages/assets/src/asset-normalizer.test.ts`: valid, malformed, blank, and dimension-invalid PNGs
- `packages/qa/src/asset-foundry-quality.test.ts`: placeholder policy, visual degradation, and production-ready certification

Final focused result: 3 files, 7 tests passed. The pre-existing full suite remained green at 112 files and 614 tests during the baseline and final validation cycle.

## 29. Godot Validation

The runtime path was preserved and remains authoritative. Normalized/compiled asset paths continue to flow through the existing Godot assembler and resource-reference checks. The generated smoke project still produces valid Godot project files and runtime evidence.

This milestone does not certify aesthetic quality through Godot runtime success. It records visual certification separately from import/runtime certification.

## 30. Runtime Regression

The required runtime commands were preserved:

- `pnpm smoke:godot` remains successful with `RUNTIME_VALIDATED`
- screenshot capture remains valid through `windowed_gpu` fallback
- runtime and visual certification remain separate
- placeholder degradation is reported without changing runtime status

The full TypeScript/build/test baseline remains passing. No runtime gate was weakened to make visual reports pass.

## 31. Remaining P0

No runtime-integrity P0 was introduced. The remaining product-level blocker is visual production readiness itself: the deterministic smoke output remains placeholder-heavy and therefore cannot be visually certified.

## 32. Remaining P1

- Replace procedural/blockout smoke assets with coherent provider-backed or authored asset families.
- Add per-asset variant approval/history/regeneration APIs and desktop detail inspection.
- Add actual pairwise/VLM/embedding consistency scoring where services are available.
- Add repeated tileset seam preview grids and frame-anchor visual fixtures.
- Enforce constitution staleness and dependency-aware partial regeneration across the full asset graph.
- Run the CI workflow and validate the visual reports in a clean hosted environment.

## 33. Files Changed

Visual-coherence changes made in this milestone:

- `packages/schemas/src/visual-constitution.ts`
- `packages/schemas/src/visual-constitution.test.ts`
- `packages/schemas/src/index.ts`
- `packages/assets/src/asset-normalizer.ts`
- `packages/assets/src/asset-normalizer.test.ts`
- `packages/assets/src/index.ts`
- `packages/qa/src/asset-foundry-quality.ts`
- `packages/qa/src/asset-foundry-quality.test.ts`
- `packages/qa/src/index.ts`
- `packages/generation/src/pipeline.ts`
- `METROFORGE_ASSET_FOUNDRY_VISUAL_COHERENCE_REPORT.md`

All prior runtime/reliability changes and unrelated user/generated files were preserved.

## 34. Commands Run

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

Focused visual tests:

```powershell
pnpm exec vitest run packages/assets/src/asset-normalizer.test.ts packages/schemas/src/visual-constitution.test.ts packages/qa/src/asset-foundry-quality.test.ts
```

Observed generated report values:

- `asset-foundry-report.json`: `VISUAL_DEGRADED`
- placeholder ratio: `0.981981981981982`
- production-ready ratio: `0`
- asset count: `111`
- runtime report: `RUNTIME_VALIDATED`
- capture validity: `PASS`

## 35. Recommended Next Milestone

**Production Asset Family Replacement**: use the new constitution, manifest, normalization, and certification contracts to replace the deterministic placeholder-heavy player/enemy/boss/tileset/background families with small coherent approved families. Add reference-conditioned variants, native-scale review, and asset-level approval before broadening generation volume.

# ASSET FOUNDRY & VISUAL COHERENCE GATE PARTIAL
