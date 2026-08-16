# MetroForge Asset Foundry

The Asset Foundry is the unified path for **finding, generating, compiling, validating, and recording** game assets. It lives in `packages/assets/src/foundry/` and **reuses** the existing MetroForge stack instead of replacing it.

```
Generation Request
        ↓
AssetRequest (packages/schemas/src/foundry.ts)
        ↓
Capability / Image router (mode filters + scored fallback)
        ↓
Provider (NVIDIA, local, HF, libraries, optional paid)
        ↓
Deterministic compilers (pixel-art / tileset / icon / …)
        ↓
QA (deterministic + optional VLM)
        ↓
Repair / retry (bounded)
        ↓
Canonical asset → Godot adapter
```

Gameplay and Godot export continue to consume **engine-ready files** produced by `AssetPipeline`. Direct “always use model X” calls are not the routing source of truth.

## What already existed (reused)

- Text: `ProviderRegistry`, `CapabilityRouter`, `FallbackManager`, `LicenseRouter`, `GenerationRouter`
- Image: `ImageProviderRegistry`, `AssetPipeline`, `PixelArtProcessor`, NVIDIA / ComfyUI / Diffusers adapters
- QA: `vlm-critic`, animation/scene critics, `AssetProductionGate` / `allowPlaceholders`
- Provenance + commercial export: `provider-license-metadata`, export license audit
- Style bible: `StyleBibleSchema` (`style_bible.json`)

The Foundry **wraps** these. It does not spawn a second NVIDIA client or a second pixel compiler.

## Routing modes

Mapped from `GenerationMode` plus per-request `routingMode`:

| Foundry mode | GenerationMode | Behavior |
|---|---|---|
| free-only | FREE_ONLY | `free` + `local` only — never paid/credit |
| local-only | LOCAL_ONLY | local runtimes only |
| offline | OFFLINE | local, no network |
| nvidia-first | NVIDIA_ONLY | nvidia family only |
| fastest / highest-quality / lowest-cost | FASTEST / HIGHEST_QUALITY / LOWEST_COST | scoring weights |
| balanced / custom | HYBRID_FREE, BALANCED, CUSTOM, … | existing hybrid ranking |

**FREE_ONLY never silently spends money.** NVIDIA image is `credit` (dev-tier hosted). Use `HYBRID_FREE` or `NVIDIA_ONLY` when you want NVIDIA Flux.

Scoring (capability, quality, consistency, speed, reliability, license, locality, −cost, −latency, health) lives in `foundry/scoring.ts`. Unhealthy providers are skipped; a circuit breaker cools failing ones.

## Providers

| Id | Class | Notes |
|---|---|---|
| nvidia-image | existing `NvidiaImageProvider` | Catalog in `foundry/nvidia-catalog.ts` is data, not a hardcoded forever-model |
| comfyui | existing | Health-check `/system_stats` |
| diffusers | existing | Local Python worker |
| automatic1111 | new | Default `http://127.0.0.1:7860` only if `AUTOMATIC1111_BASE_URL` is set; requires webui `--api` |
| huggingface-image | new | Model-card + inference check; license per card |
| kenney | new | **CC0 retrieval catalog**, not AI |
| opengameart | new | Per-asset license; unknown never auto-passes commercial |
| stability / deepai / replicate | new | Paid/metered; excluded from free-only |

Add a provider: adapter (`ImageGenerator`) + `registerFoundryImageProviders` entry + toggle id + tests. Do not thread it through gameplay.

## Existing-asset-first

Generic props/UI/icons may retrieve Kenney/OpenGameArt **before** generation. Hero, NPC, enemy, boss, portrait, and signature weapons skip retrieval unless `preferRetrieved: true`.

OpenGameArt is **not** treated as CC0. `unknown` licenses fail when `commercialUseRequired`.

## Compilers & QA

AI bytes are never shipping-ready by default. `compileForRequest` runs crop → nearest-neighbor → palette → alpha cleanup (or tileset slice). QA checks PNG magic, dimensions, blank frames, required alpha, tile multiples, spritesheet frame counts.

Production completion: `assertProductionComplete` — required count must equal validated count, with **zero placeholders**. Prototype mode (`allowPlaceholders` / `completionMode: 'prototype'`) may keep placeholders. Existing `AssetProductionGate` still enforces this on full projects.

## Cache, provenance, credentials

Content-addressed cache keys include prompt, style, provider, model, seed, compiler version. Provenance records provider/model/license/transformations/QA.

Keys stay in `.env` (`NVIDIA_API_KEY`, `HUGGINGFACE_API_KEY` / `HF_TOKEN`, `STABILITY_API_KEY`, `DEEPAI_API_KEY`, `REPLICATE_API_TOKEN`). Never logged. Settings UI shows **presence only**.

## Godot / future engines

Foundry output is a canonical PNG + metadata. `godotDestinationFor` maps into the existing `assets/` layout the Godot exporter already uses. Unity/Unreal adapters can be added later without changing providers. Dimensions `2d | hd-2d | 2.5d | 3d` are on the request/style now.

Pixel import (nearest-neighbor, no mipmaps) remains the existing Godot `.import` path.

## Prompts / originality

Prompts are built in `foundry/prompts.ts` from Style Bible + CharacterIdentity. Production presets do not copy named commercial game styles (`Hollow Knight style`, etc.); those phrases are rewritten to descriptive originals.

## Tests

- Router: free-only, local-only, NVIDIA-only, lowest-cost, health fallback
- License: CC0 / unknown / NC / BY-attribution
- Compiler + QA
- Integration: mock provider → compile → QA → manifest → production gate

```bash
pnpm --filter @metroforge/assets test
pnpm --filter @metroforge/ai test
pnpm --filter @metroforge/assets typecheck
```
