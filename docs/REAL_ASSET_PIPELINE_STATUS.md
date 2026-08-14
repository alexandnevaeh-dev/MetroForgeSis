# Real Asset Pipeline Status

**Date:** 2026-08-14. **Author:** Claude Code, continuing `feature/claude-generation-runtime`.
**Scope:** this pass's real-image-generation proof + the pipeline-correctness bug it uncovered.
Companion to `docs/NEXT_PASS_BASELINE.md` (what was already true before this pass) and
`docs/METROFORGE_COMPLETE_BUILD_STATE.md` (the full-repo audit from earlier the same day).

## Headline finding: a real PNG-decoder bug was silently destroying AI-generated art

Before touching any provider/routing code, this pass ran a real manual asset generation
(`generateManualAsset()`, the exact production path the desktop Manual Generator uses) against a
real project with NVIDIA configured. It succeeded — `provider: nvidia-image`, real network call,
real bytes — but the resulting 16×16 icon decoded to **3 opaque pixels out of 256**. That result
was not accepted at face value; it was traced to ground truth.

**Root cause, confirmed by independent verification (Python/Pillow decoding the identical file):**
Pillow read the real FLUX source image as 1024×1024, **100% opaque**, 29,385 real colors — a
genuine, detailed generation. The codebase's own `decodePngRgba()` (`packages/assets/src/png.ts`)
read the same file as **99.996% transparent**. The decoder never implemented PNG's per-scanline
unfiltering (spec §9.2–9.3) — it only skipped the filter-type byte and read the remaining bytes as
if they were already absolute pixel values. `encodePng()`'s own procedural output always writes
filter type 0 (None), so every asset the codebase generated for itself happened to round-trip
correctly; every *externally*-encoded PNG (Pillow's JPEG→PNG conversion in `nvidia-image.ts`'s
`ensurePngBuffer`, or any other real provider) did not. A constant alpha=255 channel under Up
filtering reconstructs to a raw byte of `0` on every row after the first — reading back as fully
transparent. This is why "real" AI art has looked broken/empty whenever it passed through the
pixel-art compiler, likely for as long as image providers have existed in this codebase.

There was also a **second, byte-identical copy of the same bug**: `pixel-art-processor.ts` had its
own private `decodePngSimple()`, a duplicate of `decodePngRgba()` with the identical defect — and
that duplicate, not the one in `png.ts`, was the one actually used by `pixelArt.process()`, the hot
path for every real generated sprite/tileset in the whole system.

**Fix:** `decodePngRgba()` was rewritten with a real PNG unfilter implementation (Sub/Up/Average/
Paeth reconstruction per scanline, plus IHDR bitDepth/colorType validation for 8-bit RGB/RGBA
rather than blindly assuming RGBA8). `pixel-art-processor.ts`'s duplicate decoder was deleted and
both of its call sites now import the one fixed implementation. Verified before/after on the same
real FLUX source: pre-fix, 46/1,048,576 opaque pixels; post-fix, 1,048,576/1,048,576, matching
Pillow's independent read exactly. All 387→388 existing tests still pass (no procedural round-trip
regressed, as expected since `encodePng`'s filter-0 output was never affected by the bug).

## Acceptance checklist

| # | Criterion | Result |
|---|---|---|
| 1 | At least one real image provider works end-to-end | **PASS** — NVIDIA hosted FLUX (`nvidia-image`, model `black-forest-labs/flux.1-dev`) |
| 2 | IMAGE routing distinguishes local vs remote hardware correctly | **PASS** (pre-existing, reconfirmed) — remote catalog entries carry no `minVramMb`, so local-hardware VRAM never rejects them; `LOCAL_ONLY` mode correctly excludes NVIDIA by design (confirmed live: a `--mode LOCAL_ONLY` run correctly skipped it, a `--mode HYBRID_FREE` run correctly used it) |
| 3 | Routing Inspector shows valid/rejected candidates with real reasons | **PASS** (pre-existing) — `explainModelRouting()` already returns real per-model accept/reject traces; not modified this pass |
| 4 | Procedural fallback is visibly DEGRADED / placeholder when appropriate | **PASS** — confirmed live: a run where NVIDIA hit a real network timeout correctly fell back to procedural placeholders project-wide, `environment_assets: DEGRADED`, gate still `RUNTIME_VALIDATED` |
| 5 | Asset maturity exists | **PASS** (pre-existing, extended this pass) — added `PROCESSED` to the ladder; see below |
| 6 | Production export can reject placeholder mandatory assets | **PASS** (pre-existing) — `evaluateAssetProductionGate()` already blocks `PLACEHOLDER`/`BLOCKOUT`/`REJECTED` unless `allowPlaceholders` is set; unchanged, already matched spec |
| 7 | Real asset provenance records provider/model/workflow/license/QA | **PASS** (pre-existing) — `generation_manifest.json` artifacts already carry `provider`/`modelId`/`maturity`/`critiquePassed`/`critiqueScore`; confirmed live in both fresh generations below |
| 8 | Manual asset generation uses the same canonical routing pipeline | **PASS** (pre-existing, reconfirmed by direct read) — `generateManualAsset()` calls the identical `AssetPipeline` the autonomous pipeline uses |
| 9 | Real generated artwork appears in Asset Gallery | **PARTIAL** — the manifest write path the gallery reads from is confirmed real and correct; the desktop UI itself was not launched to visually confirm rendering this pass (would require the Electron app running, out of scope for a CLI-only verification pass) |
| 10 | At least one project-generated player/enemy/boss visual uses real AI source | **PASS** — see the two fresh generations below (player, 2 enemies, boss, NPC, tileset — 6 real assets per project) |
| 11 | Character reference consistency foundation exists | **NOT DONE** — `CharacterVisualDNA` (spec Phase 10) explicitly deferred, see `docs/NEXT_PASS_BASELINE.md` |
| 12 | Sprite processing pipeline is structured and QA'd | **PARTIAL** (pre-existing) — resize/quantize/critique steps are real; background removal, pose generation, atlas packing remain absent (see prior audit, Part 18-24) |
| 13 | Tileset/room rendering uses real room layout data more deeply | **NOT DONE** — deferred, no autotile/terrain-set logic added this pass |
| 14 | Vision QA is provider-abstracted | **PASS** (pre-existing) — `createVisionCritic()` already abstracts Ollama/NVIDIA; not modified |
| 15 | Dependency-aware regeneration is expanded | **NOT DONE** — deferred |
| 16 | Map system | **PASS** — verified already fully implemented and wired for both archetypes (not a gap; the spec's premise that the Map button is "disabled" was stale relative to current source — the two real bugs blocking it were fixed earlier the same day and confirmed via clean regenerations) |
| 17 | Godot runtime validation still passes | **PASS** — 18/18 gates, both archetypes, both with real NVIDIA assets integrated (see below) |
| 18 | All existing tests remain green | **PASS** — 388/388 |

## Real end-to-end evidence

Two genuinely fresh TINY_TEST projects (not `--resume`d — resuming reuses the existing manifest
and skips asset generation entirely, which the first attempt at this verification ran into and
which is itself worth knowing: `--resume` is not a way to retry failed/placeholder assets under a
different mode).

**Side-view** (`a-moonlit-lighthouse-besieged-by-tide-born-horrors`, `--mode HYBRID_FREE`):

| Asset | Provider | Model | Maturity | productionReady |
|---|---|---|---|---|
| `assets/characters/player.png` | nvidia-image | flux.1-dev | PRODUCTION_READY | true |
| `assets/enemies/enemy_000.png` | nvidia-image | flux.1-dev | QA_REVIEW | false |
| `assets/enemies/enemy_001.png` | nvidia-image | flux.1-dev | QA_REVIEW | false |
| `assets/npcs/npc_000.png` | nvidia-image | flux.1-dev | QA_REVIEW | false |
| `assets/bosses/boss_final.png` | nvidia-image | flux.1-dev | PRODUCTION_READY | true |
| `assets/tilesets/biome_0/source.png` | nvidia-image | flux.1-dev | QA_REVIEW | false |

`final_qa: PASSED (RUNTIME_VALIDATED: 18/18 gates passed)` with these real assets integrated.
`player.png` decodes to a real 4-color, 100%-opaque 32×32 sprite — genuine pixel art, not a
degenerate result. `boss_final.png` decoded correctly (100% opaque) but the real 1024×1024 FLUX
source for that specific prompt/seed was itself a near-solid color — a real model-output-quality
outcome, not a pipeline defect (confirmed by checking the source sidecar, not just the compiled
icon); FLUX doesn't always produce highly detailed results for every prompt, and this pass does not
claim otherwise.

**Top-down** (`a-rust-eaten-scrapyard-maze-ruled-by-a-cannibal-machine`, `--mode HYBRID_FREE`):

| Asset | Provider | Maturity | productionReady |
|---|---|---|---|
| `assets/characters/player.png` | nvidia-image | QA_REVIEW | false |
| `assets/enemies/enemy_000.png` | nvidia-image | QA_REVIEW | false |
| `assets/enemies/enemy_001.png` | nvidia-image | QA_REVIEW | false |
| `assets/npcs/npc_000.png` | nvidia-image | PRODUCTION_READY | true |
| `assets/bosses/boss_final.png` | nvidia-image | PRODUCTION_READY | true |
| `assets/tilesets/biome_0/source.png` | nvidia-image | PRODUCTION_READY | true |

`final_qa: PASSED (RUNTIME_VALIDATED: 18/18 gates passed)` with these real assets integrated —
confirming the fix and the maturity promotion work identically for the top-down archetype, not just
side-view. A separate attempt on this same archetype hit a real NVIDIA network timeout
(`NETWORK_ERROR`) and correctly fell back to procedural placeholders project-wide, still reaching
`RUNTIME_VALIDATED` — the graceful-degradation path (acceptance criterion #4) is confirmed real,
not just theoretical.

Only 6 of 91 assets per project came from a real provider (the rest fell back to `comfyui`/
`diffusers` being genuinely unavailable on this machine's hardware). This matches expectations set
in `docs/NEXT_PASS_BASELINE.md` and is not a regression — NVIDIA only covers a subset of the asset
types requested in a full TINY_TEST profile at the priority/routing rules currently in place.

## Asset maturity ladder changes this pass

- Added `PROCESSED` to `ASSET_MATURITY_LEVELS`, reserved for a future finer-grained sprite workflow
  (background removal / frame normalization / atlas packing as distinct tracked steps, per spec
  Phase 12 — deliberately not built this pass). Nothing assigns it yet; its presence in the enum is
  not evidence that step exists.
- `PRODUCTION_READY` was previously **structurally unreachable** — every branch of
  `inferAssetMaturity()` returned `productionReady: false` unconditionally, regardless of critique
  result. Fixed: a critique-passed asset with `critiqueScore >= 85` (a stricter bar than the
  existing 70-point soft-pass threshold for `QA_REVIEW`) now promotes to `PRODUCTION_READY`.
  Confirmed live in both fresh generations above — 2 of 6 real assets reached it in the side-view
  run, 3 of 6 in the top-down run, driven by real critique scores, not hardcoded.
- The production export gate (`evaluateAssetProductionGate()`) was **not** changed — its existing
  blocklist semantics (reject only `PLACEHOLDER`/`BLOCKOUT`/`REJECTED`, opt-in `allowPlaceholders`
  bypass) already matched what the spec's Phase 7 literally asked for. No `PRODUCTION`-tier
  `GenerationProfile` value was added — the schema's `TINY_TEST | SMALL | MEDIUM | LARGE` enum is
  about content scale, not asset quality tiers, and the existing `allowPlaceholders` project-meta
  flag already is the opt-in mechanism the spec described; inventing a parallel concept would have
  been architecture-for-architecture's-sake.

## ProviderHealthMonitor changes this pass

`nvidia-image.ts`'s own health probe already computed a rich status
(`HEALTHY | DEGRADED | MISCONFIGURED | AUTH_FAILED | RATE_LIMITED | NETWORK_ERROR |
MODEL_UNAVAILABLE`) — 7 of the 9 requested states. That detail was being collapsed to a boolean the
instant it reached `ProviderHealthMonitor`, then re-derived into just `'healthy' | 'unavailable'`.
Fixed: `ProviderHealthSnapshot` now carries a normalized `status: UnifiedProviderStatus` (the full
9-value vocabulary — added `OFFLINE`/`UNKNOWN` as real fallback buckets) and an optional `message`,
and `ImageProviderHealthInput` accepts the already-computed `status`/`reason` instead of discarding
them. The real call site in `apps/desktop/electron/handlers.ts` was already passing this data
through — it just had nowhere to go before this fix. `packages/ai/src/types.ts`'s narrower 3-state
`ProviderHealth` (used pervasively for text providers) was deliberately left unchanged — widening it
would have been a much larger blast-radius change for a benefit no failing test or live gap
demonstrated.

## What was proven vs what remains

**Proven, with real evidence, not claimed on the strength of code existing:** NVIDIA image
generation produces real bytes, those bytes now decode correctly, they compile through the
pixel-art pipeline into valid game-ready sprites, they carry real provenance into the manifest,
they can reach genuine `PRODUCTION_READY` status via real critique scores, and a fully assembled
Godot project containing them still passes all 18 runtime/playtest gates — for both archetypes.

**Not done, honestly deferred (see `docs/NEXT_PASS_BASELINE.md` for the reasoning):** the unified
`GenerationOrchestrator`/`WorkflowResolver` architecture, the fine-grained per-task capability
taxonomy, `CharacterVisualDNA` character consistency, the full sprite-workflow rebuild (background
removal, pose generation, atlas packing), real autotile tileset generation, and dependency-graph-
driven selective regeneration. These are real, large, multi-day-scale efforts each; attempting all
of them in the same pass as the decoder-bug fix and its verification would have meant shipping none
of them with real evidence behind them.
