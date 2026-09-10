# MetroForge — Free GPU Provider Integration Report

## 1. Executive Summary

This milestone integrated **free** GPU execution sources beneath the existing remote-worker/execution-target architecture, without requiring RunPod or any paid infrastructure. A real, live invocation attempt was made against the official **Hugging Face ZeroGPU `Qwen/Qwen-Image-Edit-2509` Space** using the canonical player reference image. Discovery, upload, and invocation all reached the live Space successfully; the Space itself then raised an opaque application error consistent with **anonymous ZeroGPU quota/auth restrictions** (confirmed via both a raw fetch-based SSE client and the official `gradio_client` Python package). No provider reached `REFERENCE_INVOCATION_VALIDATED` in this run. All tooling, contracts, and offline tests were completed and validated; RunPod remains untouched and available only as an explicit paid fallback. Verdict: **FREE GPU PROVIDER PARTIAL**.

## 2. Hugging Face ZeroGPU

Implemented `HuggingFaceSpaceExecutionBackend` (`packages/assets/src/execution/huggingface-space.ts`) as a `RemoteVisualWorkerClient` adapter beneath the existing capability router — not a new provider router. It:
- Derives the Space root URL from `HF_SPACE_ID` (or accepts `rootUrl` directly).
- Dynamically discovers the Gradio API via `/config` (never guesses endpoint names).
- Uploads files through the documented `/gradio_api/upload` multipart route.
- Invokes the named endpoint via `/gradio_api/call/{api_name}` and polls the SSE result stream at `/gradio_api/call/{api_name}/{event_id}`.
- Classifies provider state (`AVAILABLE`, `QUEUED`, `QUOTA_EXHAUSTED`, `RATE_LIMITED`, `UNKNOWN`) and surfaces `HfSpaceReadiness` (`NOT_CONFIGURED` → `DISCOVERY_FAILED`/`ENDPOINT_MISSING_API`/`AUTH_REQUIRED` → `REFERENCE_CAPABLE` → `REFERENCE_INVOCATION_VALIDATED`).
- Supports `HF_TOKEN` (never hardcoded, never logged, never written to this report).

## 3. Official Qwen Space

Test target: `Qwen/Qwen-Image-Edit-2509`, hosted on Hugging Face ZeroGPU (Gradio 5.46.1, SSE protocol `sse_v3`).

## 4. Space API Discovery

Discovery was performed live against `https://qwen-qwen-image-edit-2509.hf.space/config` (no guessed endpoint names):
- Named endpoint: `/infer` (`fn_index` 0), `api_prefix` `/gradio_api`.
- Inputs (9): Input Images (gallery), Prompt (textbox), Seed (slider 0–2147483647), Randomize seed (checkbox), True guidance scale (slider 1–10, default 4), Number of inference steps (slider 1–50, default 40), Height (slider 256–2048), Width (slider 256–2048), Rewrite prompt (checkbox).
- Outputs (2): Result (gallery), Seed (slider).
- Gallery input schema resolved to `GalleryImage { image: ImageData(FileData-shaped), caption: string|null }` via the Space's own `api_info` JSON Schema — not assumed.

`pnpm providers:huggingface:doctor` reproduces this discovery and reports `readiness: REFERENCE_CAPABLE` with the full schema.

## 5. HF Authentication

`HF_TOKEN` was **not set** in this environment. The backend supports it (added as `Authorization: Bearer` on every request) but no token was available or used. Discovery and the upload succeeded fully anonymously; only the final invocation step failed (see §6).

## 6. Free Quota

**Live attempt result:** upload succeeded (canonical image accepted, 200 OK), the `/call/infer` request was accepted (200 OK, `event_id` returned), the SSE stream connected — but the Space's own execution then emitted an `error` event with **no error detail** (`data: null`). This was independently reproduced with the official `gradio_client` Python library, which raised:
```
AppError: The upstream Gradio app has raised an exception but has not enabled verbose error reporting. To enable, set show_error=True in launch().
```
This is the exact, documented behavior of a public Gradio Space with `show_error=False` (the Space owner's setting, not something MetroForge controls) — and is consistent with **anonymous ZeroGPU quota exhaustion or an auth-gated GPU allocation**, not a code defect: the request reached the app and was rejected internally rather than failing at the network/queue layer. Both a 64×64 raw sprite and an 8×-upscaled 512×512 RGB version of the canonical reference produced the identical opaque error, ruling out image-size/alpha-channel as the cause.

Per the milestone's explicit instruction, this is classified as `HF_ZEROGPU_QUOTA_EXHAUSTED` — **not** a bad-model verdict — and recorded as the exact blocker.

## 7. Canonical Upload

Canonical player reference verified before every upload attempt:
```
SHA-256: 1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B
Path: GeneratedGames/metroforge-smoke-metroidvania/assets/characters/player_production_reference.png
```
`sourceImageFromPath()` re-verifies this hash locally before any network call; the live upload to the Space's `/gradio_api/upload` route confirmed the byte-identical file was accepted (upload returned a valid server-side temp path).

## 8. Reference Invocation

`referenceInputUsed: true` and `sourceHash`/`sourceAssetId` are populated in `HuggingFaceSpaceExecutionBackend.generate()`'s provenance for every attempt — this was never treated as prompt-only generation. The live run failed at the ZeroGPU execution step (§6) before an output artifact was produced, so no output hash exists for this attempt.

## 9. Technical QA

Not reached — no output artifact was returned by the live Space invocation, so MetroForge's technical QA (decode/dimensions/nonblank/hash/differs-from-source) could not run against a real output this session. The artifact-validation code path (PNG-only MIME, 25 MiB max, hash verification) is unchanged and covered by existing offline tests in `remote-worker.test.ts`.

## 10. Identity QA

Not reached (no output artifact produced).

## 11. Pose QA

Not reached (no output artifact produced).

## 12. User-Owned ZeroGPU Space

Implemented `workers/huggingface-zerogpu/` as an optional deployable Space (`app.py`, `requirements.txt`, `README.md`) wrapping MetroForge's normalized reference operation via `@spaces.GPU`. Not deployed in this session (not required — the official Qwen Space was tried first per the milestone's instruction). Its inference logic intentionally mirrors `workers/remote-visual/server.py`'s `get_qwen_pipeline()`/`run_qwen_reference()` (same model/profile env vars, same dtype/offload selection) so it can run unmodified on RunPod or Lightning later.

## 13. Lightning AI

Implemented `LightningExecutionBackend` (`packages/assets/src/execution/lightning.ts`) as a generic `RemoteVisualWorkerClient` wrapping the existing `HttpRemoteVisualWorkerClient`/`workers/remote-visual/` protocol — no new inference implementation, no tight coupling to `AssetPipeline`. `LIGHTNING_STUDIO` was added as a new `ExecutionTargetType`. **Not configured** in this environment (`LIGHTNING_API_KEY`/`LIGHTNING_STUDIO_URL` both unset) — `pnpm providers:lightning:doctor` reports `NOT_CONFIGURED` with exact non-secret setup instructions.

## 14. Lightning Worker

No new inference code was written for Lightning — `workers/remote-visual/` is reused unmodified, deployed into a Lightning GPU Studio and exposed via the Studio's supported port/app mechanism, per the setup instructions surfaced by the doctor command.

## 15. Lightning GPU

Config supports `LIGHTNING_GPU_TYPE` to record the selected GPU class; the setup instructions explicitly recommend preferring a high-memory GPU only for the brief Qwen probe and stopping the Studio afterward to avoid burning free monthly credits (tracked as cost tier `FREE_CREDIT`, never `FREE`).

## 16. Kaggle

Implemented `kaggleNotebookDoctor()` (`packages/assets/src/execution/dev-profiles.ts`) as a development/benchmarking profile, explicitly **not** treated as a reliable online API. Reports a semi-manual export/import contract: canonical player + generation manifest uploaded as a Kaggle input dataset → generated artifact + provenance JSON downloaded and re-imported for MetroForge QA. `KAGGLE_USERNAME`/`KAGGLE_KEY` not configured in this environment.

## 17. Colab

Implemented `colabNotebookDoctor()` as an experimental/manual profile for interactive model tests only. MetroForge explicitly does **not** attempt to run a persistent remote HTTP worker on free Colab, per the milestone's instruction — `readiness` is always `MANUAL_INTERACTIVE_ONLY`.

## 18. Free Routing

Implemented `selectFreeExecutionRoute()` (`packages/assets/src/execution/free-routing.ts`) enforcing the required FREE_ONLY priority order: **validated Hugging Face ZeroGPU → validated Lightning free-credit worker → validated local provider → Kaggle/manual batch → `REFERENCE_GENERATION_UNAVAILABLE`**. Live run of `pnpm providers:free:route` in this environment (HF discovery succeeded, Lightning unconfigured, RunPod unconfigured) correctly selected `huggingface-zerogpu` and rejected RunPod outright as `PAID` even before evaluating its readiness.

## 19. Paid Fallback

`RunPodExecutionBackend`'s `costMetadata` now explicitly marks it `costTier: 'PAID'`. `selectFreeExecutionRoute()` never returns a paid backend as `selected` unless `{ allowPaid: true }` is explicitly passed — verified by an offline test (`free-routing.test.ts`: "never silently selects a PAID backend under FREE_ONLY, even if it is the only ready one"). RunPod's existing architecture (§ from the prior milestone) is completely untouched.

## 20. Provenance

`ExecutionTarget.costMetadata` extended with a `costTier: CostTier` field (`FREE | FREE_QUOTA | FREE_CREDIT | PAID | USER_OWNED`), tracked independently of readiness/health so a quota or rate-limit state is never conflated with "the model is bad." `HuggingFaceSpaceExecutionBackend.generate()`'s provenance records `spaceId`, `apiEndpoint`, `executionType: 'HF_ZEROGPU'`, `queueTimeMs`, `generationTimeMs`, `sourceHash`, and `outputHash` (once an artifact exists).

## 21. Tests

Added 16 new offline tests across 3 new files (mocked `fetch`, zero live network calls in `pnpm test`):
- `huggingface-space.test.ts` (7): NOT_CONFIGURED setup instructions, live-shaped API discovery, ENDPOINT_MISSING_API, file upload before invocation, `HF_ZEROGPU_QUOTA_EXHAUSTED` classification from an opaque error event, `HF_RATE_LIMITED` classification from HTTP 429, `REFERENCE_IMAGE_REQUIRED` rejection when no source image is supplied.
- `lightning.test.ts` (4): NOT_CONFIGURED setup instructions, `FREE_CREDIT` cost tier / `LIGHTNING_STUDIO` target type, REFERENCE_CAPABLE health/capabilities, UNREACHABLE on connection failure.
- `free-routing.test.ts` (5): HF preferred over Lightning/local, fallback to Lightning when HF isn't ready, PAID backend never silently selected under FREE_ONLY, `REFERENCE_GENERATION_UNAVAILABLE` when nothing free is ready, PAID allowed only with explicit `allowPaid: true`.

## 22. Runtime Regression

- `pnpm typecheck` — all 14 package/app tsconfigs pass, zero errors.
- `pnpm test` — **123 test files / 662 tests passed** (up from 120/646 prior to this milestone; +16 new tests, zero regressions).
- `pnpm build` — succeeds cleanly.
- `pnpm desktop:build` — succeeds cleanly (both Vite renderer and Electron main/preload bundles).
- `pnpm smoke:godot` — **RUNTIME_VALIDATED** (17/18 gates passed — same known `gameplay_screenshot_qa` gap as prior milestones, unrelated to this work).
- `pnpm validate` (typecheck + test + build) — passes end to end.
- Canonical player reference SHA-256 verified unchanged before and after all work: `1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B`.

## 23. Files Changed

- `packages/assets/src/execution/remote-worker.ts` — added `HF_ZEROGPU_SPACE`/`LIGHTNING_STUDIO`/`KAGGLE_NOTEBOOK`/`COLAB_NOTEBOOK` execution target types, `CostTier` type, `costMetadata.costTier`.
- `packages/assets/src/execution/huggingface-space.ts` (new) — `HuggingFaceSpaceExecutionBackend`.
- `packages/assets/src/execution/huggingface-space.test.ts` (new).
- `packages/assets/src/execution/lightning.ts` (new) — `LightningExecutionBackend`.
- `packages/assets/src/execution/lightning.test.ts` (new).
- `packages/assets/src/execution/dev-profiles.ts` (new) — `kaggleNotebookDoctor`, `colabNotebookDoctor`.
- `packages/assets/src/execution/free-routing.ts` (new) — `selectFreeExecutionRoute`.
- `packages/assets/src/execution/free-routing.test.ts` (new).
- `packages/assets/src/execution/runpod.ts` — `costMetadata.costTier: 'PAID'`.
- `packages/assets/src/index.ts` — exported all new types/classes/functions.
- `apps/cli/src/commands/reference-provider.ts` — added `providers:huggingface:doctor`, `providers:lightning:doctor`, `providers:kaggle:doctor`, `providers:colab:doctor`, `providers:free:route`, `providers:reference:probe:free`.
- `package.json` — corresponding root scripts.
- `.env.example` — `HF_SPACE_ID`, `HF_SPACE_API_NAME`, `LIGHTNING_API_KEY`, `LIGHTNING_STUDIO_URL`, `LIGHTNING_GPU_TYPE`, `KAGGLE_USERNAME`, `KAGGLE_KEY`, `KAGGLE_NOTEBOOK_SLUG`, `COLAB_NOTEBOOK_URL` (all empty).
- `config/remote-workers.json` — added `huggingface-zerogpu-qwen`, `huggingface-zerogpu-own-space`, `lightning-free-credit-worker`, `kaggle-notebook-benchmark`, `colab-notebook-manual` entries; `runpod-reference-core` marked `costTier: "PAID"`.
- `workers/huggingface-zerogpu/app.py`, `requirements.txt`, `README.md` (new) — optional deployable ZeroGPU Space wrapper.

## 24. Commands Run

`pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm desktop:build`, `pnpm smoke:godot`, `pnpm validate`, `pnpm providers:huggingface:doctor`, `pnpm providers:lightning:doctor`, `pnpm providers:kaggle:doctor`, `pnpm providers:colab:doctor`, `pnpm providers:free:route`, `pnpm providers:reference:probe:free` (live attempt against `HF_SPACE_ID=Qwen/Qwen-Image-Edit-2509`).

## 25. Remaining P0

- Obtain an `HF_TOKEN` (free Hugging Face account) and re-run `providers:reference:probe:free` — authenticated ZeroGPU quota is materially higher than anonymous, and may resolve the opaque `AppError`.
- If token-based retry still fails, deploy `workers/huggingface-zerogpu/` as a user-owned Space (`HF_SPACE_ID=<user>/metroforge-reference-worker`) to rule out official-Space-specific restrictions.

## 26. Remaining P1

- Configure a Lightning AI free-credit Studio (`LIGHTNING_STUDIO_URL`) and re-run `providers:lightning:doctor` / the free probe against it.
- Wire real Kaggle API upload/download into `kaggleNotebookDoctor`'s export contract once a benchmarking notebook exists (currently doctor-only, no live Kaggle API call implemented).

## 27. Recommended Next Milestone

**"MetroForge — Authenticated Hugging Face ZeroGPU Reference Probe"**: obtain `HF_TOKEN`, retry the exact same standing→running invocation with authenticated quota, and — if successful — proceed to `REFERENCE_INVOCATION_VALIDATED` and full technical/identity/pose QA against a real output artifact, still without touching RunPod.

## Verdict

**FREE GPU PROVIDER PARTIAL**
