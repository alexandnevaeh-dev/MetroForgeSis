# MetroForge — Authenticated Hugging Face ZeroGPU Reference Validation

## 1. Executive Summary

This milestone extended `HuggingFaceSpaceExecutionBackend` to propagate authentication through every step of the Gradio Space protocol (discovery, upload, submission, polling, result download), expanded the error taxonomy to distinguish auth/quota/queue/rate-limit/API/model failures, added granular per-stage timeouts, and richened the doctor report per the required field set. **The live authenticated test did not run**, because `HF_TOKEN` is not configured in this environment (`HF_TOKEN_CONFIGURED=false`, verified without printing it). Per the milestone's explicit stop condition, the live probe halted at `HF_AUTH_REQUIRED` before making any authenticated request. All tooling, contracts, and offline tests were completed and validated; the baseline regression is fully preserved. Verdict: **AUTHENTICATED ZEROGPU REFERENCE PARTIAL**.

## 2. Previous Anonymous Attempt

The prior milestone's anonymous attempt against `Qwen/Qwen-Image-Edit-2509` reached the ZeroGPU execution path (discovery, upload, and job submission all succeeded) and then received an opaque application error, classified as not-a-model-failure and consistent with anonymous ZeroGPU restrictions. This milestone did not repeat that anonymous attempt or spend additional quota re-confirming it.

## 3. Authentication

`HF_TOKEN_CONFIGURED=false` — verified directly from the process environment and from the project's `.env` file (no `HF_TOKEN=` line present in either). Per the milestone's explicit instruction ("If missing: HF_AUTH_REQUIRED and stop the live test"), the live authenticated probe was **not attempted**.

## 4. Token Handling

The token is read only from `process.env.HF_TOKEN` at the point of use (never a shell literal), attached solely as an `Authorization: Bearer` request header, and is never logged, printed, embedded in a URL, persisted in provenance, written to a report, or captured in a screenshot. `pnpm providers:huggingface:doctor` reports only `HF token: CONFIGURED / MISSING` — never the value. An offline test (`huggingface-space.test.ts`: "reports hfTokenConfigured=true ... without ever exposing it") asserts the full JSON doctor report never contains the raw token string even when one is configured.

## 5. Space API Discovery

Live discovery against the official Space succeeded (no token required for this step): `GET https://qwen-qwen-image-edit-2509.hf.space/config` returns the named endpoint `/infer` (`fn_index` 0, `api_prefix` `/gradio_api`, Gradio 5.46.1, protocol `sse_v3`) with 9 inputs / 2 outputs, matching the schema recorded in the prior milestone. No endpoint names were guessed.

## 6. API Endpoint

`/infer` — inputs: Input Images (gallery), Prompt (textbox), Seed, Randomize seed, True guidance scale, Number of inference steps, Height, Width, Rewrite prompt. Outputs: Result (gallery), Seed.

## 7. ZeroGPU State

`zeroGpuDetected: DETECTED` — `Qwen/Qwen-Image-Edit-2509` is recorded as a known official ZeroGPU Space (publicly documented hardware), reported without scraping any unstable internal endpoint. `lastQuotaState: UNKNOWN` — no invocation was attempted this session, so no quota state was observed.

## 8. Canonical Reference

```
Path: GeneratedGames/metroforge-smoke-metroidvania/assets/characters/player_production_reference.png
Expected SHA-256: 1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B
```

## 9. Local Hash

Verified via `Get-FileHash` before and after this milestone's work:
```
1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B
```
Matches exactly — no `CANONICAL_REFERENCE_MISMATCH`.

## 10. Upload

**Not attempted this session.** `sourceImageFromPath()` (which re-verifies the hash locally before any network call) is invoked by `providers:reference:probe:free`, but the command halts at the `HF_TOKEN` check *before* calling it, per the milestone's stop condition — no bytes were uploaded to Hugging Face this session.

## 11. Submission

Not attempted (see §10).

## 12. Queue

Not attempted (see §10). Queue-state tracking (`QUEUED`/`PROCESSING` derived from `estimation`/`heartbeat`/`process_starts` SSE events) is implemented and covered by the new granular-timeout design (§ below) but was not exercised live.

## 13. GPU Invocation

Not attempted (see §10) — no ZeroGPU time was consumed this session.

## 14. Result

No result — no invocation occurred.

## 15. Quota State

`UNKNOWN` (no invocation attempted). The `lastQuotaState` field is populated in real time during an actual invocation (`QUEUED` → `PROCESSING` → `AVAILABLE` on success, or `QUOTA_EXHAUSTED`/`RATE_LIMITED` on failure) and is exposed on the doctor report for future runs.

## 16. Error Classification

No live error was produced this session (the probe halted before any request). The classification taxonomy is fully implemented and distinguishes, per the milestone's explicit requirement, the following codes rather than collapsing them into `HUGGINGFACE_FAILED`:

| Code | Trigger |
|---|---|
| `HF_AUTH_REQUIRED` | HTTP 401/403, or SSE error text matching unauthorized/authentication/forbidden |
| `HF_ZERO_GPU_QUOTA_EXHAUSTED` | SSE error text explicitly mentioning quota/GPU time |
| `HF_ZERO_GPU_QUEUE_BUSY` | SSE error text explicitly mentioning a full/busy/limited queue |
| `HF_ZERO_GPU_RATE_LIMITED` | HTTP 429 on any request in the flow |
| `HF_SPACE_UNAVAILABLE` | HTTP 5xx, or a missing response body on the SSE stream |
| `HF_SPACE_APPLICATION_ERROR` | An opaque SSE error event with no error text (the anonymous-attempt signature) |
| `HF_SPACE_API_CHANGED` | Discovery finds a different/missing named endpoint, or a non-2xx/5xx HTTP status on `/config` or `/call` |
| `HF_UPLOAD_FAILED` | Non-quota, non-auth, non-5xx upload failure |
| `HF_RESULT_INVALID` | Missing/zero-byte output image, or a download failure |
| `MODEL_GENERATION_FAILED` | An SSE error event with explicit text not matching auth/quota/queue |

Quota/queue/rate-limit codes are recorded as `EXECUTION_CAPACITY_FAILURE`, never `MODEL_FAILURE`, in the CLI probe's JSON output.

## 17. Artifact Validation

Not reached (no output artifact was produced this session). The existing validation path (PNG-only, non-zero-byte, sha256-verified) is unchanged and covered by offline tests.

## 18. Identity QA

Not reached.

## 19. Pose QA

Not reached.

## 20. VLM QA

`VLM_IDENTITY_QA=NOT_RUN` — no output artifact exists to compare.

## 21. Native-Scale QA

Not reached — no canonical/generated/side-by-side comparison artifact was produced.

## 22. Provenance

No provenance-with-real-output exists this session. The provenance shape produced on a successful `generate()` call (`referenceInputUsed`, `sourceAssetId`, `sourceHash`, `spaceId`, `apiEndpoint`, `executionType: 'HF_ZEROGPU'`, `queueTimeMs`, `generationTimeMs`, `outputHash`) is unchanged from the prior milestone and is exercised by offline tests with a mocked successful response.

## 23. Performance

No queue/generation/total-latency numbers exist this session (no invocation occurred).

## 24. Free Routing Status

`pnpm providers:free:route` still correctly selects `huggingface-zerogpu` first (discovery succeeds, so `readiness: REFERENCE_CAPABLE`) ahead of Lightning (unconfigured) and rejects RunPod outright as `PAID` — unchanged behavior, re-verified this session.

## 25. Benchmark

Not added to `benchmark:reference-providers` — no successful invocation occurred, so there is no identity/pose/technical/visual-quality/latency data to record. Recording a benchmark entry without a real result would be fabrication and was not done.

## 26. Lightning Fallback Status

Per the milestone's instruction ("Do not start Lightning setup if authenticated HF succeeds... If HF fails for capacity reasons, generate the exact Lightning setup instructions"): HF did not fail for *capacity* reasons this session — it was never invoked, because `HF_TOKEN` is missing. This is a credential gap, not a ZeroGPU capacity failure, so Lightning fallback setup was not generated this session. The existing `pnpm providers:lightning:doctor` setup instructions remain available unchanged for when Lightning is actually needed.

## 27. Test Results

- New/updated offline tests in `huggingface-space.test.ts` (15 tests, up from 7): token-configured/missing doctor states, token never exposed in the JSON report, dynamic API discovery, `HF_SPACE_API_CHANGED` on an unexpected endpoint, `Authorization` header propagation verified across all 5 stages of a `generate()` call (discovery, upload, submission, polling, result download), successful-result provenance, and each of the new granular error codes (`HF_SPACE_APPLICATION_ERROR`, `HF_ZERO_GPU_QUOTA_EXHAUSTED`, `HF_ZERO_GPU_QUEUE_BUSY`, `HF_ZERO_GPU_RATE_LIMITED`, `HF_AUTH_REQUIRED`, `HF_SPACE_UNAVAILABLE`, `HF_RESULT_INVALID`).
- **123 test files / 670 tests passed** (up from 662; +8 net new, zero regressions) — no live Hugging Face requests in `pnpm test`.

## 28. Build Results

`pnpm build` and `pnpm desktop:build` both succeed cleanly.

## 29. Runtime Regression

- `pnpm typecheck` — all 14 package/app tsconfigs pass, zero errors.
- `pnpm test` — 123 test files / 670 tests passed.
- `pnpm build` — clean.
- `pnpm desktop:build` — clean (Vite renderer + Electron main/preload).
- `pnpm smoke:godot` — **RUNTIME_VALIDATED** (17/18 gates, same known `gameplay_screenshot_qa` gap as prior milestones).
- `pnpm validate` — passes end to end.
- Canonical player reference SHA-256 verified unchanged: `1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B`.

## 30. Files Changed

- `packages/assets/src/execution/huggingface-space.ts` — full rewrite: `HfSpaceTimeouts`/`DEFAULT_HF_SPACE_TIMEOUTS` (connection/upload/queue/generation/resultTransfer budgets), `HfSpaceErrorCode` taxonomy, `Authorization` header propagated to every request stage, richer `HuggingFaceSpaceDoctorReport` (`hfTokenConfigured`, `apiDiscovery`, `spaceReachable`, `authenticationAttached`, `zeroGpuDetected`, `referenceCapability`, `lastQuotaState`).
- `packages/assets/src/execution/huggingface-space.test.ts` — expanded from 7 to 15 tests.
- `packages/assets/src/index.ts` — exported `DEFAULT_HF_SPACE_TIMEOUTS`, `HfSpaceErrorCode`, `HfSpaceTimeouts`.
- `apps/cli/src/commands/reference-provider.ts` — `providers:huggingface:doctor` now prints the required human-readable summary (Space/HF token/API discovery/Space reachable/Authentication attached/ZeroGPU/Reference capability/Last quota state); `providers:reference:probe:free` (aliased as `providers:huggingface:reference:probe`) now checks `HF_TOKEN` first and halts with `HF_AUTH_REQUIRED` before any live call when missing, and classifies capacity-vs-non-capacity failures in its output.
- `package.json` — added `providers:huggingface:reference:probe` script alias.

## 31. Commands Run

`pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm desktop:build`, `pnpm smoke:godot`, `pnpm validate`, `pnpm providers:huggingface:doctor` (live discovery, no token), `pnpm providers:reference:probe:free --target huggingface` (halted at `HF_AUTH_REQUIRED`, no live authenticated call made).

## 32. Remaining P0

- Configure `HF_TOKEN` in this environment (or wherever the CLI is actually run) and re-run `pnpm providers:reference:probe:free --target huggingface` exactly once to attempt the authenticated invocation.
- If the authenticated attempt succeeds: run technical/identity/pose/VLM/native-scale QA against the real output and, if all pass, set `REFERENCE_INVOCATION_VALIDATED` and add the benchmark entry — do not proceed to player animation family production automatically even then (per §34, a human should confirm before starting the next milestone).
- If the authenticated attempt fails for capacity reasons (`HF_ZERO_GPU_QUOTA_EXHAUSTED`/`HF_ZERO_GPU_QUEUE_BUSY`/`HF_ZERO_GPU_RATE_LIMITED`), proceed directly to Lightning free-credit worker enablement using the already-implemented `LightningExecutionBackend` — no further Hugging Face code changes needed.

## 33. Remaining P1

- Wire an actual `benchmark:reference-providers` write path once a successful HF ZeroGPU result exists (currently no successful result to record).
- Consider persisting `lastQuotaState` across CLI invocations (currently in-memory per backend instance) if repeated quota-aware routing decisions across separate process runs become useful.

## 34. Recommended Next Milestone

**"MetroForge — First Authenticated Qwen ZeroGPU Invocation"**: with `HF_TOKEN` actually present in the execution environment, run the single authenticated standing→running probe, and depending on outcome either complete technical/identity/pose QA and reach `REFERENCE_INVOCATION_VALIDATED`, or fall through to Lightning free-credit worker enablement per the exact instructions already generated in this milestone's tooling.

## Verdict

**AUTHENTICATED ZEROGPU REFERENCE PARTIAL**
