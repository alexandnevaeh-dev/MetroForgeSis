# MetroForge Remote GPU Visual Worker Report

Date: 2026-08-19
Canonical repository: `E:\Projects\MetroForge\Forged`

## 1. Executive Summary

MetroForge now has a provider-neutral remote visual worker contract and a first RunPod execution backend beneath the existing provider selection layer. The implementation supports normalized health, capability, model, reference, artifact, hash, authentication, and execution-target metadata. A deployable CUDA worker skeleton and non-secret remote-worker manifest are included.

The milestone remains partial. No RunPod credentials, endpoint, remote GPU, or configured remote worker were available in this environment, so no live remote model was installed or invoked. The approved canonical player reference was not regenerated or replaced, and no animation family production started.

## 2. Previous Fleet State

The Open Visual Provider Fleet milestone had catalog and provider definitions for Qwen-Image-Edit, DreamO, Diffusers/IP-Adapter, ControlNet, ComfyUI, and optional PuLID, but this Windows machine had only CPU PyTorch and no practical local diffusion execution path.

## 3. Local Hardware Constraint

Current local state remains Windows, Intel UHD Graphics, no `nvidia-smi`, PyTorch `2.13.0+cpu`, no CUDA runtime, and zero CUDA devices. The local machine remains the orchestrator rather than the inference host.

## 4. Execution Router

Added an execution layer below provider selection through `ExecutionTarget`, `RemoteVisualWorkerClient`, and `HttpRemoteVisualWorkerClient`. The existing `ImageProviderRegistry` remains authoritative for provider/model selection; remote execution is a target/backend concern.

## 5. Remote Worker Protocol

The normalized HTTP contract provides `/health`, `/capabilities`, `/models`, `/reference`, `/edit`, `/generate`, `/control`, `/jobs/:id`, and cancellation-compatible paths. Requests carry model-independent fields, source image metadata, hashes, conditioning, pose/control inputs, seed, dimensions, and optional Visual Constitution metadata.

## 6. Authentication

The HTTP client supports bearer authentication without logging or returning tokens. RunPod uses `RUNPOD_API_KEY`; custom workers use `METROFORGE_REMOTE_WORKER_TOKEN`. No credentials were written to the repository or reports.

## 7. Worker Container

Added `workers/remote-visual/server.py`, `requirements.txt`, and a CUDA-capable `Dockerfile`. The worker is standards-based and not coupled to Electron or RunPod-specific inference code.

## 8. RunPod Backend

Added `RunPodExecutionBackend`, supporting `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`, optional endpoint URL override, GPU profile metadata, health/capability queries, and normalized generation requests.

## 9. Secondary Backend Interfaces

The generic `ExecutionTargetType` contract includes `REMOTE_METROFORGE_WORKER`, `REMOTE_COMFYUI`, `RUNPOD_SERVERLESS`, `RUNPOD_POD`, `VAST_INSTANCE`, `MODAL_FUNCTION`, `HF_INFERENCE_ENDPOINT`, and `HOSTED_PROVIDER_API`. Only the RunPod adapter and generic HTTP worker client are implemented in this milestone.

## 10. GPU Selection

No remote GPU was selected. The deployment manifest recommends a 24GB+ CUDA profile for the first reference-capable stack, subject to model-specific validation and cost review.

## 11. Remote Hardware

Remote hardware is unknown because no endpoint was configured. The worker health contract reserves vendor, model, VRAM, CUDA, Torch, system, disk, loaded model, and queue fields.

## 12. Model Selected

The preferred first model remains Qwen-Image-Edit-2509, with DreamO and Diffusers/IP-Adapter as fallback candidates. No model was downloaded remotely.

## 13. Model Revision

The remote worker defaults to Qwen-Image-Edit revision `2509` through environment configuration. Immutable revision metadata is part of the normalized response contract.

## 14. Model Installation

Not performed. The worker reports `MODEL_NOT_INSTALLED` unless the selected remote profile explicitly sets model readiness. No RunPod endpoint existed on which installation could safely occur.

## 15. Model License

No remote stack was approved for production. Qwen/DreamO terms require model-card review; the existing SDXL/IP-Adapter stack remains restricted/unknown as recorded by the prior milestone.

## 16. Model Health

No model health response was obtained from a live worker. The worker skeleton distinguishes model-not-installed from worker health.

## 17. Worker Health

The local RunPod doctor returned `NOT_CONFIGURED`. The generic remote doctor returned a safe non-secret report. The deployable worker exposes a health response with safe runtime and queue fields.

## 18. Reference Capability

No live worker advertised `REFERENCE_IMAGE`. The worker protocol supports capability advertisement, and the skeleton only advertises reference capabilities when both model readiness and explicit reference readiness are enabled.

## 19. Canonical Reference Hash

The approved canonical reference remains SHA-256:

`1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B`

The existing MetroForge integrity record and source-hash gate remain authoritative.

## 20. Reference Transfer

The HTTP client transfers controlled base64 image fields inside the normalized worker request, after source hash verification. The worker verifies the received hash before any reference processing. The payload is bounded to avoid oversized artifacts.

## 21. Reference Request

The intended first request is exactly one 1024x1024 running-pose transformation using the approved player reference, seed `424242`, same costume, weapon, palette, proportions, silhouette language, and side-view presentation.

## 22. Remote Generation

Not run. No remote endpoint was configured, and no fake generation result was created.

## 23. Artifact Transfer

The client validates PNG MIME, a 25 MiB maximum, decoded base64 bytes, and returned artifact SHA-256. Remote filenames are not trusted; the client produces an in-memory normalized result for MetroForge-owned destinations.

## 24. Technical QA

Not run because no remote artifact exists. The existing MetroForge PNG/technical QA path remains the required post-transfer gate.

## 25. Identity QA

Not run. Supplying a reference alone will not qualify a provider; identity, outfit, weapon, palette, proportions, silhouette, style, and pose checks remain mandatory.

## 26. VLM QA

`VLM_IDENTITY_QA = NOT_RUN`. No remote output existed for comparison.

## 27. Pose QA

Not run. The first request remains standing-to-running only; no animation sheets or pose family assets were started.

## 28. Native-Scale QA

Not run because no remote output exists and no Godot asset was changed.

## 29. Provenance

The normalized remote result carries request ID, provider, model, revision, execution target, seed, duration, output hash, warnings, errors, license metadata, source asset IDs, source hashes, and reference-input usage.

## 30. Execution Metadata

Execution targets record type, local/remote location, endpoint, hardware profile, GPU profile, installed models, capabilities, health, authentication type, latency, availability, billing provider, and GPU class.

## 31. Benchmark

No live benchmark was run. The existing `benchmark:reference-providers` command remains the shared benchmark surface and will use the same canonical input and pose once a remote worker is eligible.

## 32. Router Ranking

No benchmark winner exists. The existing provider registry remains authoritative, and a future execution resolver can select a validated remote target without making RunPod part of provider selection.

## 33. Fallback Behavior

Remote reference failure must fall through to another validated reference-capable target or `REFERENCE_GENERATION_UNAVAILABLE`. It must never fall back to ordinary text-to-image or procedural output while claiming identity preservation.

## 34. Timeouts

The HTTP worker client currently uses a bounded 30-second protocol request timeout. Separate cold-start, model-load, generation, artifact-transfer, and cancellation-specific budgets remain a P1 refinement before production deployment.

## 35. OOM Handling

No remote OOM occurred. The protocol is ready to carry worker errors, but explicit `PROVIDER_GPU_OOM` classification and bounded lower-memory profile retry remain a P1 task.

## 36. Security

Secrets remain environment-only. HTTPS is expected for production remote endpoints; trusted LAN exceptions are not enabled by default. Source hashes are verified on both sides, artifact MIME/size/hash are checked, and no authorization headers are logged.

## 37. Tests

Added offline tests for canonical hash mismatch, normalized remote artifact handling, output hashing, and RunPod authentication state. The baseline suite remained 119 test files and 632 tests before the new remote tests; the focused remote protocol tests passed 3/3 after the implementation fix.

## 38. Build Results

Root typecheck and full build passed after the remote backend fix. The initial post-edit build caught and fixed one import/export defect in `runpod.ts`.

## 39. Runtime Regression

The baseline remained `RUNTIME_VALIDATED` in the preceding fleet milestone. No remote worker change modifies Godot runtime assets or animation files. The required final local smoke/validation should be rerun after the complete remote slice.

## 40. Files Changed

Primary files:

- `packages/assets/src/execution/remote-worker.ts`
- `packages/assets/src/execution/http-worker-client.ts`
- `packages/assets/src/execution/runpod.ts`
- `packages/assets/src/execution/remote-worker.test.ts`
- `packages/assets/src/index.ts`
- `apps/cli/src/commands/reference-provider.ts`
- `package.json`
- `workers/remote-visual/server.py`
- `workers/remote-visual/requirements.txt`
- `workers/remote-visual/Dockerfile`
- `config/remote-workers.json`

The canonical player, identity pack, fleet catalog, Diffusers implementation, and workflow definitions were preserved.

## 41. Commands Run

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm desktop:build
pnpm providers:hardware:doctor
pnpm models:doctor
pnpm providers:image:doctor
pnpm providers:reference:doctor
pnpm smoke:godot
pnpm validate
pnpm providers:runpod:doctor
pnpm providers:remote:doctor
python -m py_compile workers/remote-visual/server.py
pnpm exec vitest run packages/assets/src/execution/remote-worker.test.ts
```

The baseline completed typecheck and reached the existing full test/build sequence; the remote backend focused tests passed 3/3. RunPod doctor correctly returned `NOT_CONFIGURED` with exit code 2 because credentials and endpoint are absent.

## 42. Remaining P0

- Configure an approved RunPod endpoint and API key outside the repository.
- Build and deploy the remote worker container to a GPU-capable target.
- Install one approved reference-capable model and verify revision/files/license.
- Implement the selected model-specific inference hook rather than the current protocol-only `REFERENCE_RUNTIME_HOOK_NOT_CONFIGURED` response.
- Run one real canonical reference upload and running-pose generation.
- Complete technical, identity, pose, native-scale, and license QA.
- Reach `REFERENCE_INVOCATION_VALIDATED` before any animation family production.

## 43. Remaining P1

- Add separate timeout budgets for cold start, model load, generation, and artifact transfer.
- Add remote job polling/cancellation integration with the existing database job lifecycle.
- Add explicit GPU OOM classification and bounded fallback profiles.
- Add RunPod serverless/pod mode selection and secure endpoint TLS policy.
- Add execution-target persistence to generation manifests and desktop state.
- Add live worker model revision/hash verification and benchmark persistence.

## 44. Recommended Next Milestone

Configure one approved RunPod GPU endpoint, deploy the reference-core worker, install Qwen-Image-Edit-2509 or the approved fallback model, and run exactly one canonical standing-to-running probe. Stop after the first successful `REFERENCE_INVOCATION_VALIDATED` result. Do not begin player animation family generation automatically.

REMOTE GPU VISUAL WORKER PARTIAL
