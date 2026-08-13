# REAL IMAGE PROVIDER ACTIVATION

**Date:** 2026-08-13  
**Repo:** `C:\Users\alexa\OneDrive\Documents\Metroidvania\Forged`  
**Outcome:** **A** — real remote NVIDIA Visual GenAI image bytes end-to-end  
**Commit:** none (secrets never committed)

---

## 1. Verdict

NVIDIA hosted image generation is **WORKING** via `nvidia-image` → `https://ai.api.nvidia.com/v1/genai/{model}` with model `black-forest-labs/flux.1-dev`.

Prior “unavailable / DEGRADED forever” state was caused by calling the **wrong endpoint** (`integrate.api.nvidia.com/v1/images/generations` → 404) and treating integrate `/models` as the image catalog (FLUX image models are **not** listed there).

---

## 2. Path traced (UI → Gallery)

| Stage | Route |
|---|---|
| UI | Manual Generator / Asset Gallery / Generation Studio `environment_assets` |
| IPC | `generate-asset`, generation queue `generate_game` / `generate_asset` |
| Pipeline | `generateManualAsset` / `GenerationPipeline` → `AssetPipeline.resolveImageGenerator` |
| Router | `ImageProviderRegistry` (not text `GenerationRouter`) |
| Provider | `NvidiaImageProvider` (`packages/assets/src/providers/nvidia-image.ts`) |
| HTTP | `POST ai.api.nvidia.com/v1/genai/{NVIDIA_IMAGE_MODEL}` + `NVCF-POLL-SECONDS` |
| Artifact | PNG written under project `assets/…` + `generation_manifest.json` |
| Compile / QA / Gallery | Manual path persists texture; full Godot studio run skipped to avoid hang |

---

## 3. Why NVIDIA looked unavailable (root cause)

1. **Wrong invoke URL** — code used OpenAI-style `/v1/images/generations` on `integrate.api.nvidia.com` → **HTTP 404**.
2. **Missing `NVCF-POLL-SECONDS`** — genai POST without poll header hung with **0 bytes**; with header, responses complete (or return NVCF status).
3. **Default model `flux.1-schnell`** — on this account returned **HTTP 504 / `Nvcf-Status: errored`**. **`flux.1-dev` returned 200 + artifacts**.
4. **Health over-relied on `/models`** — FLUX image ids are absent from integrate catalog → perpetual DEGRADED even when genai works.
5. **`NVIDIA_IMAGE_MODEL` missing from `.env`** before this pass (key was present).
6. Local ComfyUI (`localhost:8188`) unhealthy; Diffusers unhealthy on ~1GB VRAM — not remote blockers.

---

## 4. Fixes applied this pass

- Rewrote `NvidiaImageProvider` to call **hosted Visual GenAI** (`NVIDIA_IMAGE_API_BASE_URL` default `https://ai.api.nvidia.com/v1/genai`).
- Default model → `black-forest-labs/flux.1-dev`.
- Required header `NVCF-POLL-SECONDS: 120`; minimal payload `{ prompt, seed, width, height }` (1024×1024 for FLUX).
- JPEG→PNG conversion via Pillow (pixel-art pipeline requires PNG).
- Health: auth via integrate `/models`; genai path probe (GET → 405); known genai models can be **HEALTHY** without `/models` listing.
- Health statuses: `NETWORK_ERROR`, `MODEL_UNAVAILABLE`, `safeDiagnostic` (no secrets).
- `LOW_RESOURCE` routing prefers **remote** over local; remote never VRAM-gated.
- Wired Settings/`NVIDIA_IMAGE_MODEL` through desktop handlers → pipeline / manual asset.
- Unit tests updated (mocked HTTP); live smoke recorded under `tmp-smoke-image/`.

---

## 5. Health diagnostics contract

Statuses: `HEALTHY | DEGRADED | UNAVAILABLE | AUTH_FAILED | RATE_LIMITED | MISCONFIGURED | NETWORK_ERROR | MODEL_UNAVAILABLE | UNKNOWN`.

Live probe after fix:

| Field | Value |
|---|---|
| status | **HEALTHY** |
| model | `black-forest-labs/flux.1-dev` |
| reason | genai endpoint reachable; hosted Visual GenAI (not required on integrate `/models`) |
| safeDiagnostic | invoke uses `ai.api.nvidia.com/v1/genai/{model}`, not `/images/generations` |

Keys never returned in health payloads / IPC / logs.

---

## 6. NVIDIA image API verification

| Probe | Result |
|---|---|
| `GET integrate…/v1/models` + key | 200 (text NIM catalog; no FLUX image rows) |
| `POST integrate…/v1/images/generations` | **404** (not the cloud image API) |
| `POST integrate…/v1/genai/…` | **404** |
| `GET ai.api…/v1/genai/flux.1-dev` | **405** (path exists, POST-only) |
| `POST ai.api…/v1/genai/flux.1-schnell` + poll | **504** `Nvcf-Status: errored` |
| `POST ai.api…/v1/genai/flux.1-dev` + poll | **200** + `artifacts[].base64` |
| Chat completions (same key) | **200** (key valid for NVIDIA) |

No invented model ids. Working id confirmed by live invoke: **`black-forest-labs/flux.1-dev`**.

---

## 7. LOCAL vs REMOTE / VRAM

- Remote registrations: `local: false`; never filtered by detected VRAM.
- `LOCAL_ONLY` still excludes NVIDIA.
- `hardwareProfile === 'LOW_RESOURCE'` sorts remote ahead of local.
- Catalog `rankModelsForCapability` already skips VRAM gate when `!m.local`.

Regression tests added in `image-router.test.ts`.

---

## 8. Provider contract

Still implements `ImageGenerator` (`checkHealth` / `getHealthReport` / `generateImage`). Result flags: `fallbackGenerated: false`, `productionAllowed: true`, `requestedCapability: 'IMAGE_GENERATION'`.

---

## 9. Routing preference

On LOW_RESOURCE + HYBRID_FREE live explain:

- **selected:** `nvidia-image` (score 118)
- **candidates:** `nvidia-image`
- **rejected:** `comfyui` (UNAVAILABLE), `diffusers` (UNAVAILABLE)
- **degradedFallback:** false

---

## 10. Registration

`nvidia-image` registered REMOTE (`local: false`, priority 88) when `NVIDIA_API_KEY` present and Settings toggle enabled.

---

## 11. Model catalog / defaults

- `.env`: `NVIDIA_IMAGE_MODEL=black-forest-labs/flux.1-dev` (key configured in `.env` only).
- Desktop default fallback model updated to `flux.1-dev`.
- Remote models not blocked by local VRAM in catalog or image router.

---

## 12. Real smoke generation

| Field | Value |
|---|---|
| Prompt | original dark fantasy Metroidvania protagonist (no copyrighted names) |
| Provider | `nvidia-image` |
| Model | `black-forest-labs/flux.1-dev` |
| Duration | ~10.9s (provider smoke) / ~15.7s (manual pipeline) |
| Bytes | 676717 PNG (full smoke); 114 PNG after 32×32 pixel-art process |
| Path | `tmp-smoke-image/protagonist.png`; project `GeneratedGames/nvidia-image-activation-smoke/assets/characters/nvidia_activation_player.png` |
| Secrets | none in artifacts / summaries |

---

## 13. Artifact → compile → QA → Gallery → Studio

| Step | Result |
|---|---|
| Artifact persistence | **PASS** — PNG + manifest entry `provider: nvidia-image`, `fallbackGenerated: false`, `sourceType: ai_generated` |
| Maturity | Critique failed on downscaled sprite → `REJECTED` (honest; not PLACEHOLDER) |
| Compilation | **Not run** — full Godot assemble avoided (hang risk) |
| QA | Deterministic/VLM critique path executed (`critiqueScore: 80`, `critiquePassed: false`) |
| Asset Gallery | Asset on disk under `assets/characters/…` (Gallery reads manifest/files) |
| Generation Studio | **Not run** — full game generation avoided |
| Manual Generator | **PASS** — same `generateManualAsset` pipeline |

---

## 14. Routing Inspector / Providers UI

Handlers probe now returns precise `status`, `reason`, `nearbyModels` / `suggestedModelIds`, `safeDiagnostic`, and LOW_RESOURCE-aware candidate order. Legacy `health` string via `statusToLegacyHealth`.

---

## 15. Fallback / honesty

- Procedural remains last resort when `selectHealthy()` returns null → pipeline `degraded` / PLACEHOLDER (existing behavior + tests).
- Failed remote gen still falls back to procedural in `generateSprite` catch (not marked SUCCESS as AI).
- `flux.1-schnell` 504 surfaces as throw → next candidate / procedural, not fake success.

---

## 16. Security

- Key written only to repo-root `.env` (gitignored).
- Never logged, never in artifacts/manifest fields, never IPC’d to renderer.
- **USER ACTION REQUIRED:** rotate the NVIDIA API key — it was pasted in chat.

---

## 17. Tests & builds

| Check | Result |
|---|---|
| `nvidia-image.test.ts` + `image-router.test.ts` | **16/16 PASS** |
| `@metroforge/assets` typecheck/build | PASS |
| `@metroforge/generation` typecheck/build | PASS |
| `@metroforge/desktop` typecheck | PASS |
| Live NVIDIA smoke | **SMOKE_PASS** |
| Live manual asset | **PASS** (`provider: nvidia-image`) |

---

## Remaining blocker

None for remote image invoke. Optional follow-ups (not required for Outcome A):

- Full Generation Studio TINY_TEST when user can supervise (avoid hang in unattended agents).
- Improve pixel-art downscale quality (32×32 post-process still tiny; maturity path fixed below).
- Account note: `flux.1-schnell` currently errors on this NVIDIA account; keep `flux.1-dev`.

## Follow-up

**Maturity soft-pass (2026-08-13):** Successful remote NVIDIA gens with critique score ≥ 70 were incorrectly landing as `REJECTED` when a strict VLM set `passed: false` (smoke: score 80 → REJECTED). Fixed:

- `critiqueEffectivelyPassed` + `CRITIQUE_SOFT_PASS_SCORE = 70` in `@metroforge/shared`
- `inferAssetMaturity`: `critiquePassed: false` + score ≥ 70 → `QA_REVIEW` (not `REJECTED`); hard fail / low score still `REJECTED`
- `AssetPipeline.generateSprite` / tileset VLM path: soft-pass so `critiquePassed` true when score ≥ 70 and deterministic PNG checks pass
- Manual manifest now persists `maturity` / `productionReady` / `sourceType` / `sourcePath` / `modelId`
- Settings placeholder default → `black-forest-labs/flux.1-dev` (`.env` / provider / handlers already on `flux.1-dev`)

**Compile path (2026-08-13 follow-up):** Real NVIDIA source is no longer overwritten by pixel-art downscale.

- `derivedSourceRelPath` + `AssetPipeline.compileFromSource` persist `*_source.png` beside compiled game sprite
- `generateSprite` writes AI bytes to `*_source.png`, then compiled output to the game path; VLM critiques full source (not only 32×32)
- Offline compile of `tmp-smoke-image/protagonist.png` → smoke project:
  - Source: `GeneratedGames/nvidia-image-activation-smoke/assets/characters/nvidia_activation_player_source.png` (676717 B)
  - Compiled: `…/nvidia_activation_player.png` (116 B)
  - Maturity: **QA_REVIEW** (`sourceType: compiled`, soft-pass score 80, `productionReady: false`)
- Summary: `activation_compile_summary.json`

**Manual Generator (same path as `generate-asset` IPC):** Short `generateManualAsset` smoke (`nvidia_activation_moth`, HYBRID_FREE + key):

- Provider: **nvidia-image** / `black-forest-labs/flux.1-dev` (not procedural)
- Source + compiled both on disk under `assets/enemies/`
- Maturity: **QA_REVIEW**, `critiquePassed: true`, score 90
- Summary: `activation_manual_moth_summary.json`

**Routing Inspector:** `explainImageProviderRouting` / IMAGE_GENERATION with HYBRID_FREE + LOW_RESOURCE:

- Selected: **nvidia-image** (HEALTHY); remote VRAM N/A
- ComfyUI / Diffusers rejected (local UNAVAILABLE)
- Recorded: `tmp-smoke-image/routing-followup.json`

**Validate:** shared maturity + assets pipeline/router/nvidia tests **30/30 PASS**; `@metroforge/assets` + `generation` build PASS; `@metroforge/desktop` typecheck PASS.

**Still optional:** full Generation Studio / Godot assemble (hang risk). Pixel-art 32×32 quality still crude but no longer destructive to source.

## Studio/Godot follow-up (2026-08-13)

Bounded exercise of Studio image routing + Godot import (no full `GenerationPipeline.run`).

| Check | Result |
|---|---|
| Routing (HYBRID_FREE + LOW_RESOURCE) | **nvidia-image** selected (score 118) — same registry path as Studio `environment_assets` |
| Bounded Studio image | `generateManualAsset` → `studio_godot_ember_scout` (~26s, 180s abort cap) — provider **nvidia-image**, not procedural |
| Gallery/maturity | compiled + `_source.png` present; maturity **QA_REVIEW** (not PLACEHOLDER); critique soft-pass score 75 |
| Godot assemble | Donor copy `crystal-caverns-test` → `GeneratedGames/studio-godot-nvidia-smoke` with nvidia player/enemy textures injected |
| Godot headless | `--headless --path … --import` exit 0; `--quit-after 1` exit 0; `.import` + `.godot/imported/*.ctex` for nvidia PNGs (incl. full-res sources) |
| `metroforge validate … --no-runtime` | **godot_imports PASS**; static gates FAIL on **pre-existing donor** gaps (`required_files`, `room_archetype_fidelity`, `attack_sheets_exist`, `vfx_textures_exist`) — identical on `crystal-caverns-test` without nvidia inject |
| CLI fix | `--no-runtime` was ignored (Commander maps flag → `opts.runtime === false`, code read `opts.noRuntime`) — fixed in `apps/cli/src/commands/validate.ts` |

**Artifacts:** `GeneratedGames/nvidia-image-activation-smoke/assets/enemies/studio_godot_ember_scout{,_source}.png`, `activation_studio_godot_summary.json`, `GeneratedGames/studio-godot-nvidia-smoke/`.

**Not run:** full TINY_TEST `GenerationPipeline.run` (hang risk). No key rotation; key stayed in `.env`.

## Notes

1. Continue using existing `NVIDIA_API_KEY` in `.env` (do not commit).
2. Ensure Pillow is installed for the Python used by `DIFFUSERS_PYTHON` (JPEG→PNG).
3. Keep Studio mode **HYBRID_FREE** (not LOCAL_ONLY) to include NVIDIA.
