# MetroForge Local Diffusers Reference Route Report

Date: 2026-08-19
Canonical repository: `E:\Projects\MetroForge\Forged`

## 1. Executive Summary

The existing Diffusers worker was extended into a catalog-driven SDXL/IP-Adapter reference route without downloading packages or weights. The route now has an explicit hardware doctor, Diffusers doctor, model-stack installation plan, controlled reference profile, source-hash gate, identity-pack prompt injection, and real IP-Adapter request wiring.

The route is not yet invocation-validated because the approved local runtime is not installed and the catalog model stack is not installed. No player animation family was generated, no active animation assets were replaced, and the canonical player reference was preserved.

## 2. Previous Blocker

The previous route audit found that NVIDIA hosted FLUX.1-dev could generate ordinary text-to-image assets but could not consume an arbitrary custom player reference. ComfyUI was unavailable, and the local Diffusers worker lacked installed Diffusers/IP-Adapter runtime prerequisites.

## 3. Canonical Player Reference

The approved source remains `GeneratedGames/metroforge-smoke-metroidvania/assets/characters/player_production_reference.png`.

The identity pack remains available under `assets/characters/player_production_reference/identity/`. A new integrity record preserves the approved source hash and approval state.

## 4. CUDA Detection Discrepancy

The discrepancy is resolved using PyTorch rather than `nvidia-smi`: `torch 2.13.0+cpu`, `torch.version.cuda = null`, `torch.cuda.is_available() = false`, and `torch.cuda.device_count() = 0`. `nvidia-smi` is absent, and Windows reports Intel UHD Graphics.

## 5. GPU Device

Windows native query: Intel(R) UHD Graphics, reported adapter memory 1,073,741,824 bytes, driver `31.0.101.2115`. No CUDA-capable NVIDIA device was found.

## 6. VRAM

CUDA VRAM is unavailable because PyTorch reports zero CUDA devices. The Windows adapter-memory value is not treated as CUDA VRAM and is not used to approve a diffusion model.

## 7. Python Environment

Python `3.11.9` is available. The repository now declares the intended controlled runtime location as `.metroforge/python` when `DIFFUSERS_PYTHON` is not explicitly configured. The current doctor execution still uses the configured/default `python` executable and does not mutate it.

## 8. Torch/CUDA

Torch is installed but CPU-only: `2.13.0+cpu`. No Torch replacement was attempted. The explicit hardware verdict is `CUDA_RUNTIME_PRESENT_NO_USABLE_DEVICE`.

## 9. Diffusers Installation

Diffusers is not installed in the current Python runtime. `providers:diffusers:doctor` reports `UNAVAILABLE` with `No module named 'diffusers'`.

## 10. Accelerate Installation

Accelerate is not installed in the current Python runtime. It remains a pinned requirement for the controlled route.

## 11. Base Model Selection

The selected base architecture is Stable Diffusion XL. The catalog profile selects `sdxl-base-1.0`, repository `stabilityai/stable-diffusion-xl-base-1.0`, with a recommended 1024x1024 operating size.

## 12. Adapter Selection

The single initial reference architecture is Diffusers IP-Adapter for SDXL. The selected adapter record is `ip-adapter-sdxl` from `h94/IP-Adapter`.

## 13. Model Catalog Entries

Added catalog metadata for:

- `sdxl-base-1.0`
- `ip-adapter-sdxl`
- `clip-vit-h-14-reference-encoder`

Each record tracks architecture, revision, local path, VRAM profile, dimensions, base/adapter license fields, provider terms, commercial status, and derived-asset policy.

## 14. Disk Requirements

The configured model directory is `models`. The drive has approximately 120.4 GB available during validation. The planned stack is approximately 9,700 MB, with approximately 1,940 MB temporary download overhead. No model directory was populated by this milestone.

## 15. Download Authorization

The installation command is catalog-driven:

```powershell
pnpm models:install-reference --profile player-ip-adapter
```

It prints the exact stack and exits with `REFERENCE_MODEL_DOWNLOAD_APPROVAL_REQUIRED`. `--approve-downloads` currently preserves the same stop because package/model installation still requires explicit environment and license confirmation. No silent download occurred.

## 16. Installation Results

Not installed. Diffusers, Accelerate, the SDXL base model, IP-Adapter weights, and the reference encoder remain absent.

## 17. License Metadata

The base model is recorded as `OpenRAIL++-M` with commercial use restricted. The adapter is recorded as Apache-2.0 pending repository-term verification. The reference encoder is model-card dependent and unknown. The complete stack is therefore not commercially eligible.

## 18. Diffusers Provider Changes

The existing `DiffusersProvider` now accepts controlled base-model and adapter paths, passes the existing conditioning payload to the worker, exposes `getHealthReport()`, and reports staged runtime/model readiness. No parallel provider router was added.

## 19. Reference Capability

The registered Diffusers provider now advertises reference conditioning, image editing, pose control, and character consistency metadata because the existing worker has an IP-Adapter implementation. Runtime readiness remains unavailable until the runtime and model files are actually present.

## 20. Router Behavior

NVIDIA remains available for ordinary `IMAGE_GENERATION`. Diffusers is the intended route for reference conditioning once its readiness is validated. The reference doctor does not select Diffusers while its runtime is unavailable.

## 21. Reference Request Contract

The guarded probe uses the existing normalized image request with:

- `profile: CHARACTER`
- approved source image as `conditioning.image`
- `conditioning.mode: ip_adapter`
- `conditioning.strength: 0.55`
- seed `424242`
- 1024x1024 output
- running-pose prompt and negative constraints

## 22. Source Hash Verification

The approved source SHA-256 is:

`1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B`

The reference probe recomputed this hash and matched the stored approved hash. A mismatch produces `CANONICAL_REFERENCE_MISMATCH` and stops before provider invocation.

## 23. IP-Adapter Input Provenance

The conditioning contract now carries `sourceAssetId`, `sourceHash`, and `referenceMechanism`. The probe records `referenceMechanism: IP_ADAPTER` and supplies the actual canonical image bytes to `ip_adapter_image` in the Python worker.

## 24. Reference Probe

The existing command remains:

```powershell
pnpm providers:reference:probe --project GeneratedGames/metroforge-smoke-metroidvania
```

The current result is `REFERENCE_CAPABILITY_UNAVAILABLE` because no provider is both reachable and ready. The source exists, the hash matches, and the identity pack is available.

## 25. Conditioning Calibration

The profile records no more than three bounded values: `0.35`, `0.55`, and `0.75`. No calibration was run because the runtime and weights are not installed.

## 26. Technical QA

The probe implementation validates decoded output dimensions, visibility, and technical PNG validity before accepting an invocation. No output image exists yet, so no technical QA result is claimed.

## 27. Identity QA

The existing identity pack is injected into the pose prompt. Identity QA was not run because no reference-conditioned output exists. No identity score was fabricated.

## 28. VLM QA

VLM comparison was not run. The route remains at setup/readiness gating and has not produced a candidate for visual comparison.

## 29. Native-Scale QA

Not run. No probe output exists and no active Godot assets were replaced.

## 30. Probe Evidence

The evidence directory is reserved as `qa/reference-provider/`. No probe-low, probe-medium, probe-high, comparison, or probe JSON output was promoted because the route was not eligible.

## 31. Selected Conditioning Defaults

The profile defaults are SDXL, IP-Adapter, 1024x1024, seed-controlled invocation, reference strengths 0.35/0.55/0.75, float16 when CUDA exists, and model offload when needed. These are profile data, not global constants.

## 32. Memory Strategy

The existing worker caches loaded pipelines for the worker lifetime and supports CPU offload when CUDA is unavailable. The current machine has no validated CUDA device, so no GPU-specific execution plan was approved.

## 33. OOM Handling

No local inference was run, so no OOM occurred. OOM classification and bounded recovery remain a follow-up before production use; the route must not hide a CPU-only fallback behind a GPU-ready claim.

## 34. Performance

No reference-generation timing is available. Package/model installation and live inference were intentionally not started.

## 35. Windows Validation

Windows validation passed for the TypeScript/CLI path. Native GPU information was collected with PowerShell CIM. `nvidia-smi` absence is recorded but is not treated as the sole CUDA signal.

## 36. Tests

The final test run passed 118 test files and 630 tests. Existing offline tests remain download-free.

## 37. Build Results

`pnpm typecheck`, `pnpm build`, and `pnpm desktop:build` passed. The CLI and assets projects were also rebuilt with the root TypeScript compiler after the provider changes.

## 38. Runtime Regression

`pnpm smoke:godot` passed with `RUNTIME_VALIDATED`. Godot validation, runtime validation, gameplay readiness, screenshot capture, and shutdown passed. Existing visual-degradation warnings remain separate from this provider milestone.

## 39. Files Changed

Primary implementation files:

- `packages/assets/src/providers/diffusers.ts`
- `workers/diffusers_image_worker.py`
- `workers/requirements-diffusers.txt`
- `packages/assets/src/types/image-gen.ts`
- `packages/assets/src/image-conditioning.ts`
- `packages/assets/src/foundry/register.ts`
- `packages/schemas/src/models.ts`
- `config/models.catalog.json`
- `config/reference-profiles.json`
- `apps/cli/src/commands/reference-provider.ts`
- `apps/cli/src/commands/image-production.ts`
- `package.json`
- `GeneratedGames/metroforge-smoke-metroidvania/assets/characters/player_production_reference/identity/reference-integrity.json`

## 40. Commands Run

Key commands included:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm desktop:build
pnpm providers:hardware:doctor
pnpm providers:diffusers:doctor
pnpm providers:image:doctor
pnpm providers:reference:doctor
pnpm smoke:godot
pnpm validate
pnpm models:install-reference --profile player-ip-adapter
pnpm providers:reference:probe --project GeneratedGames/metroforge-smoke-metroidvania
```

The reference doctor and probe use exit code 2 for their intentional blocked/not-ready state; this is recorded as an expected readiness result, not a test failure.

## 41. Remaining P0

- Obtain explicit approval for the exact package/model stack.
- Review and approve the base-model, adapter, encoder, and provider terms together.
- Create or reuse the controlled `.metroforge/python` runtime.
- Install the pinned Diffusers dependencies without replacing Torch automatically.
- Install and verify the catalog-selected model files and revisions.
- Re-run the Diffusers doctor until runtime and model readiness are truthful.
- Run one real IP-Adapter probe, technical QA, deterministic identity QA, and any available VLM QA.

## 42. Remaining P1

- Add file-hash/revision verification for installed model files.
- Add explicit GPU OOM classification and bounded offload recovery.
- Add provider tests for source-mismatch, missing identity pack, runtime missing, adapter missing, and successful provenance.
- Add persisted selected calibration defaults only after a successful probe.
- Add cancellation/progress reporting around the worker lifecycle.

## 43. Recommended Next Milestone

Approve and install the controlled local Diffusers/IP-Adapter stack, validate the runtime and model files, then run exactly one reference-conditioned running-pose probe. Do not begin idle/run/attack/hurt/death family production until that probe passes technical and identity QA.

LOCAL DIFFUSERS REFERENCE ROUTE PARTIAL
