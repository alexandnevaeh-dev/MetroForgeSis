# MetroForge — Live RunPod Deployment & First Qwen Reference Probe

## 1. Executive Summary

This milestone extended MetroForge's remote-worker execution architecture (built in the prior "Remote GPU Visual Worker" milestone) toward actual live deployability on RunPod, and implemented the real Qwen-Image-Edit-2509 inference hook in the deployable worker. **No live RunPod deployment, model installation, or inference occurred in this environment**, because `RUNPOD_API_KEY` and `RUNPOD_ENDPOINT_ID` are both absent. All deployment tooling, protocol code, and offline-verifiable tests were completed and validated. Per the milestone's explicit instruction, the verdict remains **PARTIAL** — never faked as PASS.

## 2. Milestone Scope Confirmation

- Did **not** rebuild the remote-worker architecture (`ExecutionTarget`, `RemoteVisualWorkerClient`, `HttpRemoteVisualWorkerClient`, `RunPodExecutionBackend`, worker `Dockerfile`/`server.py`) — all prior contracts were additively extended.
- Did **not** start the full player animation family — only the single standing→running reference invocation path was extended for eventual live use.
- Did **not** hard-code RunPod into `AssetPipeline` — RunPod remains one pluggable `ExecutionTarget` behind the provider-neutral `RemoteVisualWorkerClient` interface.

## 3. RunPod Credential State

```
RUNPOD_API_KEY_SET=False
RUNPOD_ENDPOINT_ID_SET=False
RUNPOD_ENDPOINT_URL_SET=False
```

No RunPod credentials, endpoint, worker image, network volume, or model profile are configured in this environment. This was verified directly from process environment variables before any work began, and confirmed again via `pnpm providers:runpod:doctor`, which reports:

```
readiness: NOT_CONFIGURED
setupInstructions:
  - Set RUNPOD_API_KEY (RunPod account API key — never commit it).
  - Set RUNPOD_ENDPOINT_ID (or RUNPOD_ENDPOINT_URL to target a specific deployed endpoint).
  - Optionally set RUNPOD_GPU_PROFILE to record the selected GPU class.
  - Optionally set RUNPOD_WORKER_IMAGE to record the deployed container image/tag.
  - Optionally set RUNPOD_NETWORK_VOLUME_ID to use persistent model storage.
  - Optionally set RUNPOD_MODEL_PROFILE to select the installed reference model profile.
  - Optionally set RUNPOD_DEPLOYMENT_MODE=RUNPOD_POD or RUNPOD_SERVERLESS.
```

**Result: RUNPOD_CONFIGURATION_REQUIRED.**

## 4. What Was Built This Milestone

### 4.1 Remote-worker contract extensions (`packages/assets/src/execution/remote-worker.ts`)
- `RemoteModelState` — 7-state model lifecycle: `MODEL_NOT_INSTALLED`, `MODEL_DOWNLOADING`, `MODEL_VERIFYING`, `MODEL_READY`, `MODEL_LOADING`, `MODEL_LOADED`, `MODEL_ERROR`.
- `RemoteWorkerTimeouts` / `DEFAULT_REMOTE_WORKER_TIMEOUTS` — separated timeout budgets: connection (10s), cold start (120s), model load (300s), generation (180s), artifact transfer (60s).
- `GpuOomDetail` / `ProviderGpuOomError` — structured GPU out-of-memory classification (`PROVIDER_GPU_OOM`) carrying gpu/vramMb/model/runtimeProfile/precision/width/height.

### 4.2 HTTP transport extensions (`packages/assets/src/execution/http-worker-client.ts`)
- Constructor now accepts `Partial<RemoteWorkerTimeouts>`, merged with the defaults.
- `health()`/`capabilities()` use the connection timeout; `generate()` uses the combined cold-start + model-load + generation timeout.
- GPU OOM detection from either a structured `payload.oom` field or an error string containing `PROVIDER_GPU_OOM`, raised as `ProviderGpuOomError`.
- Distinguishes `TimeoutError` (→ `REMOTE_TIMEOUT`) from other fetch failures (→ `REMOTE_CONNECTION_FAILED`); existing 401/403 → `REMOTE_AUTH_FAILED`, non-2xx → `REMOTE_HTTP_ERROR`.
- Artifact validation unchanged and still enforced: PNG-only MIME, 25 MiB max, sha256 hash verification against the declared value.

### 4.3 RunPod backend extensions (`packages/assets/src/execution/runpod.ts`)
- `RunPodDeploymentMode = 'RUNPOD_POD' | 'RUNPOD_SERVERLESS'`, defaulting to `RUNPOD_POD` (preferred for inspectability during first-time bring-up).
- `RunPodConfig` extended with `workerImage`, `networkVolumeId`, `modelProfile`, `deploymentMode`.
- `RunPodDoctorReport` extended with the same fields plus a non-secret `setupInstructions: string[]` array, always populated when the target is not fully ready.
- `doctor()` messaging distinguishes `RUNPOD_CONFIGURATION_REQUIRED` (nothing configured) from `RUNPOD_AUTH_REQUIRED` (endpoint present, key missing) — never conflating the two.

### 4.4 Real Qwen-Image-Edit-2509 inference hook (`workers/remote-visual/server.py`)
Replaced the previous `REFERENCE_RUNTIME_HOOK_NOT_CONFIGURED` placeholder with real inference code:
- `get_qwen_pipeline()` — lazily loads `diffusers.QwenImageEditPipeline.from_pretrained(MODEL_ID, revision=MODEL_REVISION, ...)` at the pinned model ID `Qwen/Qwen-Image-Edit-2509` (env-overridable), raising `CUDA_UNAVAILABLE` if no CUDA device is present. Honors a `RUNPOD_MODEL_PROFILE` env var (`FULL_BF16`, `CPU_OFFLOAD`, `LAYER_OFFLOAD`) to select `bfloat16`/`float16` dtype and CPU/sequential offload strategies for constrained VRAM.
- `run_qwen_reference()` — decodes the source image, builds a seeded `torch.Generator`, invokes the pipeline with `image`/`prompt`/`negative_prompt`, and re-encodes the output as PNG bytes.
- `reference()` — verifies the canonical source hash (unchanged behavior), then calls the real inference path; on `torch.cuda.OutOfMemoryError` (or any exception whose message contains "out of memory") returns a structured `{"errors": ["PROVIDER_GPU_OOM"], "oom": {...}}` response instead of raising past the protocol boundary. On success, returns the base64 PNG artifact, its sha256, and provenance including `referenceMechanism: QWEN_IMAGE_EDIT`, `modelProfile`, and `durationMs`.
- `health()` now introspects `torch.cuda` when available (device count, VRAM, device name) and reports `diffusersVersion` plus a `modelState` field so callers can see `MODEL_NOT_INSTALLED` → `MODEL_LOADING` → `MODEL_LOADED` transitions.
- Logging never includes tokens, keys, or auth headers — only request/stage/model/GPU/duration fields.
- Pinned dependency versions added to `requirements.txt` (`torch`, `diffusers`, `transformers`, `accelerate`, `safetensors`, `Pillow`, `huggingface_hub`); removed the unused `fastapi`/`uvicorn` entries since the server uses only the Python standard library.

### 4.5 CLI additions (`apps/cli/src/commands/reference-provider.ts`, root `package.json`)
- `providers:runpod:doctor` / `providers:remote:doctor` now pass `workerImage`, `networkVolumeId`, `modelProfile`, `deploymentMode` from the environment and print `setupInstructions` to stderr when not ready.
- New commands, all of which honestly report configuration-required states given the absence of credentials (no live RunPod API calls are ever made without a configured endpoint):
  - `remote:worker:build` — reports whether the Dockerfile/requirements/server files exist and prints the (unexecuted) `docker build` command.
  - `remote:worker:deploy --target runpod` — reports deployment readiness/setup instructions; refuses to proceed past `RUNPOD_CONFIGURATION_REQUIRED`.
  - `remote:model:install --target runpod --profile qwen-image-edit` — reports the install plan (model ID, revision, approval-required) without triggering any download.
  - `remote:model:doctor --target runpod` — reports model readiness state from the worker's health payload.
- Non-secret `.env.example` entries added for all RunPod and custom remote-worker variables (all left empty).

### 4.6 Offline test coverage (`packages/assets/src/execution/remote-worker.test.ts`)
Added 11 new offline tests (mocked `fetch`, zero live network calls) covering:
- `RUNPOD_CONFIGURATION_REQUIRED` setup instructions when fully unconfigured.
- Deployment mode / model profile echoed in the doctor report.
- Worker health reporting `MODEL_NOT_INSTALLED` and `MODEL_LOADED` states.
- `ProviderGpuOomError` raised from a structured `PROVIDER_GPU_OOM` response.
- `REMOTE_TIMEOUT` classification from a `TimeoutError`.
- `REMOTE_CONNECTION_FAILED` classification from a generic network failure.
- `REMOTE_ARTIFACT_HASH_MISMATCH` and `REMOTE_ARTIFACT_MIME_INVALID` rejections.
- `REMOTE_AUTH_FAILED` classification from an HTTP 401.

## 5. What Was NOT Done (and why)

- **No RunPod Pod/Serverless endpoint was deployed.** Requires `RUNPOD_API_KEY` + a funded RunPod account; neither is available here.
- **No container image was built or pushed.** `remote:worker:build` only verifies local file presence and prints the build command for a human/CI operator with Docker + registry credentials.
- **No model files were downloaded.** `Qwen/Qwen-Image-Edit-2509` (~tens of GB across the Qwen-Image transformer + text encoder + VAE) is only fetched inside the deployed worker container at first load, gated by `METROFORGE_REMOTE_MODEL_READY`/`METROFORGE_REMOTE_REFERENCE_READY` env flags that remain `false` by default.
- **No live inference occurred.** The canonical player reference image was **not** uploaded to any remote service. `sourceImageFromPath()` still enforces the hash check locally before any network call would be attempted.
- **No `REFERENCE_INVOCATION_VALIDATED` verdict was reached** — this state requires a real GPU worker to respond successfully, which requires live RunPod credentials.

## 6. Canonical Reference Integrity

```
SHA-256: 1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B
Path: GeneratedGames/metroforge-smoke-metroidvania/assets/characters/player_production_reference.png
```
Verified unchanged before and after this milestone's work.

## 7. Regression Verification

- `pnpm typecheck` — all 14 package/app tsconfigs pass, zero errors.
- `pnpm test` — **120 test files / 646 tests passed** (up from 635 prior to this milestone; +11 new offline execution tests, zero regressions).
- `pnpm build` — succeeds cleanly across all packages and both desktop bundles.
- `pnpm smoke:godot` — `RUNTIME_VALIDATED` (17/18 gates passed, same known `gameplay_screenshot_qa` gap as prior milestones, unrelated to this work).
- `pnpm validate` (typecheck + test + build) — passes end to end.

## 8. Exact Setup Instructions to Unblock This Milestone

To progress from `RUNPOD_CONFIGURATION_REQUIRED` to a live probe, an operator must:
1. Create a RunPod account and API key; set `RUNPOD_API_KEY`.
2. Deploy a Pod (recommended first) or Serverless endpoint with a CUDA GPU (≥24 GB VRAM recommended for `FULL_BF16`); set `RUNPOD_ENDPOINT_ID` or `RUNPOD_ENDPOINT_URL`.
3. Build and push the worker image from `workers/remote-visual/` (`pnpm remote:worker:build` prints the exact `docker build` command); set `RUNPOD_WORKER_IMAGE`.
4. Optionally attach a RunPod Network Volume for persistent model caching; set `RUNPOD_NETWORK_VOLUME_ID`.
5. Choose a `RUNPOD_MODEL_PROFILE` (`FULL_BF16`, `CPU_OFFLOAD`, or `LAYER_OFFLOAD` depending on available VRAM) and set `RUNPOD_DEPLOYMENT_MODE`.
6. On the deployed worker, set `METROFORGE_REMOTE_MODEL_READY=true` and `METROFORGE_REMOTE_REFERENCE_READY=true` once the Qwen model has downloaded and a smoke health check succeeds.
7. Run `pnpm providers:runpod:doctor`, then `pnpm remote:model:doctor --target runpod`, then invoke the single standing→running reference probe.

## 9. Verdict

**LIVE RUNPOD QWEN REFERENCE PARTIAL**
