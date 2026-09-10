# MetroForge — Authenticated Repaired Qwen Probe Report

## 1. Executive Summary

This milestone was to run **exactly one** authenticated Hugging Face ZeroGPU standing→running probe against the already-repaired `HuggingFaceSpaceExecutionBackend`. No architecture or payload-repair pass was started. No player animation family was generated.

The probe **did not run**. Environment inspection found:

```
HF_TOKEN_CONFIGURED=false
```

`HF_SPACE_ID` is also missing from both `process.env` and the repo `.env`. Per the explicit stop condition, this session halted at **HF_AUTH_REQUIRED** before `pnpm providers:huggingface:doctor` live generation, before the free probe, and before any GPU quota use. No anonymous Space generation was attempted. There is no live output image, so `REFERENCE_INVOCATION_VALIDATED` is not claimed.

Canonical player hash still matches the approved SHA-256. The repaired client from the prior **HF QWEN INVOCATION REPAIR PARTIAL** milestone is unchanged.

## 2. HF Environment

| Check | Result |
|---|---|
| `HF_TOKEN` in Cursor process | not set |
| `HF_TOKEN` in `E:\Projects\MetroForge\Forged\.env` | not present |
| `HF_TOKEN_CONFIGURED` | **false** |
| `HF_SPACE_ID` in process | unset |
| `HF_SPACE_ID` in `.env` | no `HF_*` keys |
| Expected `HF_SPACE_ID` | `Qwen/Qwen-Image-Edit-2509` |

The token was never printed. Restore auth by adding (do not commit `.env`):

```
HF_TOKEN=<your Hugging Face token>
HF_SPACE_ID=Qwen/Qwen-Image-Edit-2509
HF_SPACE_API_NAME=/infer
```

Then re-run this milestone from step 2 (doctor) with **one** probe.

## 3. Doctor Result

**Not run.** Step 1 stop condition (`HF_AUTH_REQUIRED`) forbids proceeding. A doctor call would only hit `/config` (no GPU), but this session did not continue past the token gate.

## 4. Canonical Hash

Path: `GeneratedGames/metroforge-smoke-metroidvania/assets/characters/player_production_reference.png`

```
SHA-256: 1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B
CANONICAL_MATCH=true
```

No `CANONICAL_REFERENCE_MISMATCH`. The canonical player was not regenerated.

## 5. Space

Intended target remains `Qwen/Qwen-Image-Edit-2509` at `https://qwen-qwen-image-edit-2509.hf.space`. Live Space invocation was not performed this session.

## 6. API

Intended API remains `/infer` (`fn_index` 0, Gradio 5.46.1, `sse_v3`, `/gradio_api`). Not invoked live.

## 7. Upload

Not attempted. No upload path, size, or server filename was produced.

## 8. Gallery Payload

Not sent live. The repaired client still constructs:

`[{ image: FileData, caption: null }]`

with FileData `url` = `{root}/gradio_api/file={path}` after a session-scoped upload. That contract was not exercised against ZeroGPU this session.

## 9. Submit

Not attempted. No `/gradio_api/call/infer` POST this session.

## 10. Session Hash

Not generated for a live job (session hashes are created per `generate()` call).

## 11. Queue

No SSE queue events. Queue duration: **n/a**.

## 12. Process Start

No `process_starts` event. Generation duration: **n/a**.

## 13. Rewrite Prompt

Intended live value remains `rewrite_prompt=false` (explicit; not Space default `true`). Not submitted live.

## 14. Seed

Intended live values remain `seed=424242`, `randomize_seed=false`, `true_guidance_scale=4.0`, `num_inference_steps=40`, size `1024×1024`. Not submitted live.

## 15. Live Invocation

**Zero live GPU invocations this session.**  
`pnpm providers:reference:probe:free --target huggingface` was **not** executed.

## 16. Live Error or Output

Classification: **HF_AUTH_REQUIRED** (pre-flight).  
No Space application error, quota message, or output gallery. No event/job ID.

## 17. Technical QA

Not run — no output artifact.

## 18. Identity QA

Not run — no output artifact. Not treated as identity success.

## 19. Pose QA

Not run — no standing→running evidence.

## 20. VLM QA

`VLM_IDENTITY_QA=NOT_RUN`

## 21. Native Scale

Evidence directory was not written (probe never ran):

`GeneratedGames/metroforge-smoke-metroidvania/qa/hf-qwen-invocation/`

(`canonical.png`, `generated_running.png`, `side_by_side.png`, `native_scale.png`, `probe.json` absent)

## 22. Provenance

Incomplete by design: no live `referenceInputUsed` / `outputHash` / queue / generation timings. Canonical source hash was verified locally only.

## 23. ZeroGPU Quota State

**UNKNOWN** — no invocation, therefore not `HF_ZERO_GPU_QUOTA_EXHAUSTED`, `HF_ZERO_GPU_QUEUE_BUSY`, or `HF_ZERO_GPU_RATE_LIMITED`. Not classified as `EXECUTION_CAPACITY_FAILURE`.

## 24. Gradio Client Diagnostic if needed

**Not used.** Official `gradio_client` counts as a GPU invocation. It is reserved for a later opaque `HF_SPACE_APPLICATION_ERROR` after an authenticated MetroForge probe. That condition was not reached.

## 25. Tests

Not re-run this session (no product-code change). Prior baseline remains: **123 test files / 676 tests PASS**.

## 26. Build

Not re-run this session (no product-code change). Prior baseline: typecheck PASS, build PASS, desktop:build PASS.

## 27. Runtime Regression

Not re-run this session. Prior `pnpm smoke:godot` remains **RUNTIME_VALIDATED**. Canonical hash re-verified this session (unchanged).

## 28. Remaining P0

- Put `HF_TOKEN` and `HF_SPACE_ID=Qwen/Qwen-Image-Edit-2509` in the Forged `.env` (or the Cursor process environment).
- Re-run **one** authenticated probe: `pnpm providers:huggingface:doctor` then `pnpm providers:reference:probe:free --target huggingface`.
- Do not start a second GPU call automatically if that probe fails.

## 29. Remaining P1

- If that authenticated probe returns quota/queue/rate-limit: `EXECUTION_CAPACITY_FAILURE` → Lightning free GPU worker (`LightningExecutionBackend` + `workers/remote-visual/`).
- If it returns opaque `HF_SPACE_APPLICATION_ERROR`: one official `gradio_client` `/infer` diagnostic (the next GPU call), then Lightning if the official Space fails the same way.
- Player animation family remains **NOT_GENERATED**.

## 30. Recommended Next Milestone

**Authenticated repaired Qwen probe (retry)** after `HF_TOKEN` is present in this environment — still exactly one live ZeroGPU call, no architecture rewrite, no player family production.

Project visual remains **VISUAL_DEGRADED** from prior smoke. Player family remains **FAMILY_REVIEW_REQUIRED**. Animation members remain **NOT_GENERATED**.

AUTHENTICATED REPAIRED QWEN PROBE FAILED
