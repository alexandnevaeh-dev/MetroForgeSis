# MetroForge — HF Qwen Invocation Repair Report

## 1. Executive Summary

This continuation resumed an unfinished Hugging Face ZeroGPU / official Qwen Space invocation repair. Inspection showed the prior session had already started Gallery-shaped payloads and explicit `rewrite_prompt=false` in `HuggingFaceSpaceExecutionBackend`, but the free reference probe still used Space-default-prone settings (`seed=42`, no conditioning), uploads were not session-scoped, `.env` was not loaded for HF CLI commands, offline tests did not assert the repaired payload, and no repair report existed.

This session completed that client-side repair, added offline coverage, and re-ran the regression baseline. A live ZeroGPU generation was **not** executed here: `HF_TOKEN` is not present in this Cursor process or in the repo `.env`, so the stop condition is `HF_AUTH_REQUIRED`. No anonymous GPU call was made. There is still **no real returned image**, so `REFERENCE_INVOCATION_VALIDATED` is not claimed.

Verdict: **HF QWEN INVOCATION REPAIR PARTIAL**.

## 2. Handoff State

Took over existing work on `feature/claude-generation-runtime` in `E:\Projects\MetroForge\Forged`. Did not reset the worktree. Did not rebuild provider architecture. The repair report file did not exist (draft/incomplete/completed: **missing**). Continuation started from the already-modified `packages/assets/src/execution/huggingface-space.ts` plus CLI probe in `apps/cli/src/commands/reference-provider.ts`.

## 3. Existing Partial Changes

Preserved and completed:

- Gallery JSON as `[{ image: FileData, caption: null }]` (matches live `/gradio_api/info` `example_input`).
- Extra taxonomy: `HF_GALLERY_PAYLOAD_INVALID`, `HF_MODEL_INFERENCE_ERROR`, `HF_PROMPT_REWRITE_ERROR`.
- Authorization on discovery/upload/submit/poll/download.
- Separate connection/upload/queue/generation/result timeouts.

Added in this continuation:

- Gradio `session_hash` plus `upload?upload_id=` (required to associate uploaded files with the job).
- FileData `url` pointing at `{root}{apiPrefix}/file={path}`.
- Always-explicit 9-value `/infer` vector so Space defaults (`rewrite_prompt=true`, `randomize_seed=true`) cannot apply.
- Slider snapping to live min/max/step (1024×1024 is in range 256–2048 step 8).
- CLI loads `@metroforge/shared` dotenv, uses seed `424242`, and only prints `REFERENCE_INVOCATION_VALIDATED` after technical + identity + pose gates.

## 4. Authentication

```
HF_TOKEN_CONFIGURED=false
HF_SPACE_ID in Cursor .env: missing
HF_SPACE_ID in process env: unset
```

Expected Space: `Qwen/Qwen-Image-Edit-2509`.

The token is never printed. This Cursor environment does **not** have `HF_TOKEN` in `process.env` and the repo `.env` has no `HF_*` keys (VS Code configuration from the prior milestone did not carry over).

**HF_AUTH_REQUIRED** — do not run anonymous generation.

Exact instructions:

1. Create a Hugging Face access token (read is enough for a public Space).
2. Put it in `E:\Projects\MetroForge\Forged\.env` as `HF_TOKEN=<token>` (never commit `.env`).
3. Set `HF_SPACE_ID=Qwen/Qwen-Image-Edit-2509`.
4. Optionally `HF_SPACE_API_NAME=/infer`.
5. Re-open the terminal/Cursor session so dotenv loads, then run:
   - `pnpm providers:huggingface:doctor`
   - `pnpm providers:reference:probe:free --target huggingface`

## 5. Space Discovery

Live `GET https://qwen-qwen-image-edit-2509.hf.space/config` (no token, no GPU):

- Space: `Qwen/Qwen-Image-Edit-2509`
- Root: `https://qwen-qwen-image-edit-2509.hf.space`
- Gradio `5.46.1`, protocol `sse_v3`, `api_prefix` `/gradio_api`
- Named API: `/infer`, `fn_index` / dependency id `0`
- `show_error`: false (opaque application errors remain expected if the app throws)

## 6. API Contract

`/infer` inputs (order from live config `dependencies[0].inputs`):

1. Gallery — Input Images
2. Textbox — Prompt
3. Slider — Seed (0–2147483647, default 0)
4. Checkbox — Randomize seed (**default true**)
5. Slider — True guidance scale (1.0–10.0, default 4.0)
6. Slider — Number of inference steps (1–50, default 40)
7. Slider — Height (256–2048 step 8, UI default 256; app treats 256×256 as “auto”)
8. Slider — Width (256–2048 step 8)
9. Checkbox — Rewrite prompt (**default true**)

Outputs: Gallery Result, Slider Seed.

Official Space `app.py` (`infer`) iterates gallery items as `item[0]` (tuple/list of image + caption). `rewrite_prompt=True` calls DashScope (`DASH_API_KEY`); if that path runs, failures become opaque `AppError` because `show_error=False`. MetroForge therefore **must** send `rewrite_prompt=false`.

## 7. Gallery Contract

Live `api_info` GalleryData is an array of `GalleryImage`:

```json
[{ "image": { "path": "<uploaded-or-url>", "url": "<file-url>", "orig_name": "...", "meta": { "_type": "gradio.FileData" } }, "caption": null }]
```

Not a bare Image, not a bare FileData, not `[file, caption]` at the JSON layer. Official Gradio `example_input` uses this shape. MetroForge now serializes the same shape after multipart upload.

## 8. Previous Request Payload

Prior live probes (from earlier reports) reached `/call/infer` then SSE `error` / `data: null` (`HF_SPACE_APPLICATION_ERROR`). Likely contributors in the unfinished client:

- Missing `session_hash` / `upload_id` (upload not bound to the job session).
- Probe `seed=42` with **no** explicit checkboxes → Space defaults `randomize_seed=true` and `rewrite_prompt=true` if those slots were omitted.
- Gallery `url: null` (schema allows it if `path` is set; official example still sets `url`).

## 9. Repaired Request Payload

```json
{
  "data": [
    [{ "image": { "path": "<upload>", "url": "<root>/gradio_api/file=<upload>", "size": <n>, "orig_name": "player.png", "mime_type": "image/png", "is_stream": false, "meta": { "_type": "gradio.FileData" } }, "caption": null }],
    "<running prompt>",
    424242,
    false,
    4.0,
    40,
    1024,
    1024,
    false
  ],
  "fn_index": 0,
  "session_hash": "<12-char>",
  "event_data": null
}
```

Upload URL: `POST {root}/gradio_api/upload?upload_id={session_hash}` with `Authorization: Bearer` when a token exists.

## 10. Rewrite Prompt Setting

`rewrite_prompt = false` always unless `conditioning.rewritePrompt` is explicitly true. Probe forces false. Official Space default is true; that path is an external DashScope rewrite and is disabled for the deterministic MetroForge probe.

## 11. Seed/Randomization

- `seed = 424242`
- `randomize_seed = false`
- Guidance 4.0, steps 40, size 1024×1024 (snapped into live slider ranges)

## 12. Gradio Client Diagnostic

**Not run (live predict).** `HF_TOKEN_CONFIGURED=false`; a `gradio_client` `predict()` would be either anonymous GPU use (forbidden here) or an unauthenticated failure.

Oracle used instead (no GPU):

- Live `/config` and `/gradio_api/info`
- Official Space `app.py` from `huggingface.co/spaces/Qwen/Qwen-Image-Edit-2509`

`view_api()`-equivalent signature:

`infer(images, prompt, seed, randomize_seed, true_guidance_scale, num_inference_steps, height, width, rewrite_prompt) -> (result gallery, seed)`

## 13. MetroForge Client Diagnostic

Offline mocked `generate()` now asserts: session hash, `fn_index` 0, Gallery nesting, rewrite false, randomize false, seed 424242, auth on all stages. Live MetroForge probe **not run** (`HF_AUTH_REQUIRED`).

## 14. Payload Comparison

| Field | Previous live risk | Repaired client |
|---|---|---|
| Gallery | FileData / `url:null` / possible missing session | GalleryImage + file URL + `upload_id` |
| rewrite_prompt | Space default **true** if omitted | explicit **false** |
| randomize_seed | Space default **true** if omitted | explicit **false** |
| seed | probe used 42 | 424242 |
| session | missing | generated per job |

## 15. Upload

Implemented: multipart `files` to `/gradio_api/upload?upload_id={session}`. Live upload this session: **not attempted**.

## 16. Submit

Implemented: `POST /gradio_api/call/infer` with JSON payload above. Live submit: **not attempted**.

## 17. Queue

SSE poll still treats `estimation`/`heartbeat` as `QUEUED` and `process_starts` as `PROCESSING`. Queue duration is separated from generation once `process_starts` is seen. Live queue: **not observed**.

## 18. ZeroGPU State

`lastQuotaState: UNKNOWN` — no invocation in this session. Not classified as quota exhausted (no quota evidence).

## 19. Space Error

No new live Space error. Historical authenticated/anonymous probes reported opaque `HF_SPACE_APPLICATION_ERROR` / Gradio `AppError` with `show_error=False`. After token is restored, one probe should distinguish rewrite vs gallery vs true app/GPU failure using the expanded taxonomy.

## 20. Live Result

No output image. Live GPU calls this session: **0**.

## 21. Technical QA

Not run on a live artifact (none). Probe now uses existing `validateTechnicalPng` (decode, visible pixels, PNG signature, hash ≠ input) when an image exists.

## 22. Identity QA

Not run on a live artifact. Probe uses deterministic palette Jaccard vs canonical; does **not** treat “reference was uploaded” as identity success. Threshold is conservative; VLM remains separate.

## 23. Pose QA

Not run on a live artifact. Probe uses foreground bbox aspect shift (standing vs running), not a fabricated pose label.

## 24. VLM QA

`VLM_IDENTITY_QA=NOT_RUN` — no live image; Ollama VLM is only invoked if `VLMCritic.isAvailable()` after a real output.

## 25. Native Scale

Evidence directory prepared by the probe after success:

`GeneratedGames/metroforge-smoke-metroidvania/qa/hf-qwen-invocation/`  
(`canonical.png`, `generated_running.png`, `side_by_side.png`, `native_scale.png`)

Not written this session (no generation).

## 26. Provenance

On success the backend records: `referenceInputUsed`, `sourceAssetId`, `sourceHash`, `executionType: HF_ZEROGPU`, `spaceId`, `apiName` `/infer`, seed, prompt hash, rewrite/randomize/guidance/steps/size, output hash, queue and generation durations. Not populated live this session.

## 27. Tests

`packages/assets/src/execution/huggingface-space.test.ts`: **21 tests** (was 15). New coverage: Gallery serialization, explicit rewrite/randomize/seed payload, 9-input schema mapping, `upload_id`, rewrite error code, gallery error code, prompt hash. All mocked; **no live GPU in `pnpm test`**.

`pnpm test`: **123 test files / 676 tests PASS** (baseline 123 / 670; +6).

## 28. Build

- `pnpm typecheck` — PASS
- `pnpm build` — PASS
- `pnpm desktop:build` — PASS
- `pnpm validate` equivalent (typecheck + test + build) — PASS as separately run steps

## 29. Godot Runtime Regression

`pnpm smoke:godot`: **RUNTIME_VALIDATED** (17/18 gates; known `gameplay_screenshot_qa` gap unchanged).

Canonical player SHA-256 after smoke (unchanged, not regenerated by this repair):

`1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B`

## 30. Files Changed

- `packages/assets/src/execution/huggingface-space.ts`
- `packages/assets/src/execution/huggingface-space.test.ts`
- `packages/assets/src/index.ts`
- `apps/cli/src/commands/reference-provider.ts`
- `METROFORGE_HF_QWEN_INVOCATION_REPAIR_REPORT.md` (this file)

Unrelated pre-existing dirty worktree files were left untouched.

## 31. Commands Run

- `git status` / `git diff --stat` / `git log`
- Canonical `Get-FileHash` (before and after)
- Env inspection (key names / SET vs EMPTY only; token never printed)
- Live Space `/config` and `/gradio_api/info` (discovery only)
- `pnpm exec vitest run packages/assets/src/execution/huggingface-space.test.ts`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build` / `node scripts/build.mjs`
- `pnpm desktop:build`
- `pnpm smoke:godot`

Not run: `pnpm providers:reference:probe:free` (would be anonymous or would halt at `HF_AUTH_REQUIRED`).

## 32. Remaining P0

- Configure `HF_TOKEN` and `HF_SPACE_ID=Qwen/Qwen-Image-Edit-2509` in this environment.
- Run **one** `pnpm providers:reference:probe:free --target huggingface`.
- If official `gradio_client` is used as a second oracle, that counts as the one live GPU call unless the MetroForge probe is skipped.

## 33. Remaining P1

- If the official Space still returns opaque `AppError` with rewrite disabled and auth attached, stop further HF protocol rewrites and use already-implemented `LightningExecutionBackend` + `workers/remote-visual/`.
- Optional: persist live SSE event names/job ids (redacted) into the probe JSON for faster triage.

## 34. Recommended Next Milestone

**Authenticated repaired probe (single GPU call)** with `HF_TOKEN` present, then technical/identity/pose QA on a real running-pose image. Do **not** start Player Animation Family Production until `REFERENCE_INVOCATION_VALIDATED` is earned with a real artifact.

HF QWEN INVOCATION REPAIR PARTIAL
