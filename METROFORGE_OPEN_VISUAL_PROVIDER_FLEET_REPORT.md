# MetroForge Open Visual Provider Fleet Report

Date: 2026-08-19
Canonical repository: `E:\Projects\MetroForge\Forged`

## 1. Executive Summary

MetroForge now has a provider-neutral local visual fleet layer behind the existing `ImageProviderRegistry`, `AssetFoundry`, `AssetPipeline`, provider-health architecture, model catalog, and normalized image request. The fleet definitions cover Qwen-Image-Edit-2509, DreamO v1.1, the existing Diffusers/IP-Adapter stack, ControlNet pose conditioning, ComfyUI local/remote service execution, and optional PuLID.

The fleet is integrated and hardware-aware but not live-reference validated. This Windows machine is CPU-only with Intel UHD graphics; Qwen and DreamO are remote-worker recommended, Diffusers is not practically usable locally, ComfyUI has no configured reachable service, and no provider worker/model stack is ready for a real probe. No large model download was started because installation alone would not create a practical or production-eligible local route.

## 2. Hardware

PyTorch reports `2.13.0+cpu`, `torch.version.cuda = null`, `torch.cuda.is_available() = false`, and zero CUDA devices. Windows reports Intel(R) UHD Graphics with approximately 1 GB reported adapter memory. The hardware class is `CPU_ONLY`; no NVIDIA GPU or `nvidia-smi` was found.

## 3. Storage

The MetroForge model root is `models`. Approximately 120 GB was available during the fleet diagnostics. Model installation requires capacity checks plus temporary download overhead. Existing SDXL files were detected as a partial cache, not a complete installed model, because required model structure was missing.

## 4. Python Runtimes

Python `3.11.9` is available. The existing Diffusers runtime remains the controlled target under `.metroforge/python` or `DIFFUSERS_PYTHON`. Qwen, DreamO, and PuLID adapters use explicit worker paths and do not mutate global Python state. No new runtime environment was silently created.

## 5. Model Manager

The catalog-driven reference installation command remains available through `models:install-reference`. The fleet adds `models:doctor`, which distinguishes `INSTALLABLE`, `INSTALLED`, `HARDWARE_INSUFFICIENT`, local practicality, remote-only recommendation, execution targets, and license eligibility. Existing approval semantics remain in force.

## 6. Qwen-Image-Edit

Added `QwenImageEditProvider` behind the existing provider interface. It requires an explicitly configured worker and model path, advertises reference/image-editing capabilities only through the registered route metadata, and reports unavailable until the worker and model are present. The catalog record is `qwen-image-edit-2509`, recommended for CUDA or remote-worker execution.

## 7. DreamO

Added `DreamOProvider` behind the existing provider interface. It supports the same normalized image request boundary and explicit worker/model configuration. Its catalog state is remote-worker recommended because this machine lacks CUDA and DreamO is not locally practical here.

## 8. IP-Adapter

The existing Diffusers/IP-Adapter implementation was preserved and absorbed into the fleet. The existing source-hash gate, identity-pack prompt injection, reference provenance, reference-strength profile, worker wiring, and `providers:reference:probe` remain the single Diffusers route.

## 9. ControlNet

Added the catalog record `controlnet-openpose-sdxl` and a versioned IP-Adapter-plus-ControlNet workflow contract. ControlNet is represented as pose/control conditioning, not as an independent identity generator.

## 10. ComfyUI

The existing `ComfyUIProvider` remains configurable through a service URL and supports local or remote execution targets. The fleet does not require ComfyUI to run on this Intel-UHD machine. Versioned workflow contracts describe required models, adapters, custom nodes, input mappings, output mappings, and license requirements.

## 11. PuLID

Added `PulidProvider` as an optional disabled-by-default adapter. It is experimental, model/checkpoint licensing remains unknown, and it cannot become commercially eligible without an explicit license review and successful reference probe.

## 12. Installed Models

No fleet model is production-installed. The existing SDXL directory is partial and is now correctly reported as `INSTALLABLE`, not installed. Qwen, DreamO, ControlNet, IP-Adapter, and PuLID model paths are not complete/validated.

## 13. Download Sizes

Catalog estimates currently include approximately 20 GB for Qwen-Image-Edit-2509, 18 GB for DreamO v1.1, 6.7 GB for SDXL base, 500 MB for IP-Adapter, 2.5 GB for the reference encoder, 1.5 GB for ControlNet, and 4 GB for optional PuLID. These are estimates only and are not download authorization by themselves.

## 14. Licenses

Every fleet record carries separate model/provider/license metadata. Qwen and DreamO terms require model-card review. SDXL is recorded as restricted OpenRAIL++-M. IP-Adapter is recorded as Apache-2.0 pending repository-term verification. ControlNet and PuLID remain model-dependent/unknown.

## 15. Commercial Eligibility

No fleet route is commercially eligible. Unknown licensing remains unknown, and restricted SDXL remains restricted. An Apache-licensed adapter or provider implementation does not make the complete generation stack commercially safe.

## 16. Reference Capabilities

Qwen, DreamO, Diffusers/IP-Adapter, ComfyUI workflow contracts, and PuLID metadata are now represented through the existing provider registration and capability surfaces. Availability remains governed by health, worker, model, hardware, and license state.

## 17. Probe Results

No live reference invocation was run. The canonical source exists and remains hash-protected, but no local or remote fleet provider is currently eligible for invocation. No output image or identity score was fabricated.

## 18. Qwen Probe

Not run. The Qwen worker is not configured and Qwen model weights are not installed. The intended probe is the approved player reference with the same outfit, weapon, palette, proportions, side-view presentation, and running-pose request.

## 19. DreamO Probe

Not run. The DreamO worker is not configured and DreamO v1.1 is not installed. The same canonical request will be used when a remote or CUDA-backed worker is configured.

## 20. IP-Adapter Probe

Not run. The existing Diffusers doctor reports the runtime package missing. The existing probe remains source-hash guarded and will use the approved image as the actual `ip_adapter_image` input when the route becomes ready.

## 21. ComfyUI Probe

Not run. The configured ComfyUI endpoint is not reachable. The workflow contract is present and can target a local or remote ComfyUI service without changing the MetroForge request contract.

## 22. Identity QA

Not run because no new reference-conditioned output exists. The existing identity-pack and source hash remain available for future QA.

## 23. Pose QA

Not run. Deterministic pose fixtures are defined as controls only and are not final artwork.

## 24. Native-Scale QA

Not run. No provider output was generated and no Godot asset was replaced.

## 25. Performance

No live provider latency or failure-rate measurements are available. The benchmark command records the shared canonical request and refuses to invent scores for unavailable providers.

## 26. VRAM

No CUDA VRAM is available on this machine. Qwen, DreamO, and PuLID are marked remote-only recommended; Diffusers and ControlNet are also not locally practical despite being technically CPU-addressable in metadata.

## 27. Benchmark Results

Added `benchmark:reference-providers`. It records provider-specific model identity, execution target, endpoint, health, source availability, license eligibility, and a mandatory weighted scoring rubric. Current providers are `NOT_ELIGIBLE` or `NOT_RUN_UNTIL_EXPLICIT_PROBE`; no generic aesthetic score is substituted.

## 28. Router Rankings

The existing router remains authoritative. NVIDIA may continue ordinary image generation. Reference tasks must select only a provider that is healthy, reference-capable, source-conditioned, technically valid, identity-validated, and license-eligible. NVIDIA hosted FLUX.1-dev is not used for arbitrary reference conditioning.

## 29. Fallback Order

The intended reference fallback order is validated local/remote provider, then the next validated provider, then configured ComfyUI workflow, then `REFERENCE_GENERATION_UNAVAILABLE`. Ordinary text-to-image and procedural output are never promoted as identity-preserving fallback.

## 30. Provenance

The existing Diffusers conditioning payload records source asset ID, source hash, and reference mechanism. The fleet provider boundary preserves provider, model, runtime, execution target, conditioning data, and normalized output metadata for future worker implementations.

## 31. Tests

The existing offline suite remains download-free. Added workflow-contract tests cover missing model/adapter requirements and complete available contracts. The final completed regression suite passed 119 test files and 632 tests.

## 32. Build Results

The fleet schema, catalog, provider adapters, registration, workflow contracts, CLI commands, and exports typecheck and build through the existing monorepo commands. Full build and desktop build passed.

## 33. Runtime Regression

The existing Godot runtime path remains protected by `smoke:godot` and `validate`; both completed with exit code 0. No animation family assets were generated or replaced as part of fleet integration.

## 34. Files Changed

Primary fleet changes include:

- `packages/schemas/src/models.ts`
- `config/models.catalog.json`
- `packages/assets/src/providers/local-visual-fleet.ts`
- `packages/assets/src/providers/comfyui-workflow-contract.ts`
- `packages/assets/src/providers/comfyui-workflow-contract.test.ts`
- `packages/assets/src/foundry/register.ts`
- `packages/assets/src/image-router.ts`
- `packages/assets/src/index.ts`
- `apps/cli/src/commands/reference-provider.ts`
- `package.json`
- `config/workflows/player-reference/`
- `config/pose-fixtures/player-reference-poses.json`

The previously completed Diffusers/reference files and canonical integrity record were preserved.

## 35. Commands Run

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm desktop:build
pnpm providers:hardware:doctor
pnpm providers:image:doctor
pnpm providers:reference:doctor
pnpm smoke:godot
pnpm validate
pnpm models:doctor
pnpm benchmark:reference-providers
```

The reference doctor and benchmark use blocked/not-eligible states for unavailable providers rather than producing fake outputs.

The aggregate live-provider chain was stopped after a provider health call stalled on network timeout. The separate local smoke and validation pass completed successfully.

## 36. Remaining P0

- Configure a remote GPU worker or reachable ComfyUI service for actual inference.
- Install and verify the controlled Diffusers runtime before probing IP-Adapter.
- Implement and validate concrete Qwen and DreamO worker protocols for their installed upstream runtimes.
- Complete model revision/hash verification and resumable atomic downloads.
- Review the full license stack for at least one candidate provider.
- Run one real canonical-player reference probe and complete technical, identity, pose, and native-scale QA.

## 37. Remaining P1

- Add worker-specific Qwen/DreamO health and generation implementations.
- Add ControlNet pose-map generation and fixture validation.
- Add ComfyUI queue cancellation and workflow preflight against live node/model inventory.
- Add benchmark persistence and capability-router ranking from validated scores.
- Add explicit remote-worker authentication and health metadata.

The approved canonical player reference hash remained `1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B`.

## 38. Recommended Next Milestone

Configure one approved remote GPU execution target, preferably a managed ComfyUI or Diffusers worker, then validate the existing canonical IP-Adapter probe. Use the same request to benchmark Qwen and DreamO only after their workers and licenses are verified. Stop after the first `REFERENCE_INVOCATION_VALIDATED` result; do not begin full player animation production.

OPEN VISUAL PROVIDER FLEET PARTIAL
