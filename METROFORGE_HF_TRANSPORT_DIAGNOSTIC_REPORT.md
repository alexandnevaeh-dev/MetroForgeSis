# MetroForge — HF Transport Diagnostic Report

## 1. Executive Summary

The authenticated repaired Qwen probe surfaced only `{ "message": "fetch failed", "classification": "NOT_A_CAPACITY_FAILURE" }` because low-level Node/Undici transport failures were not wrapped with stage metadata or underlying `error.cause` fields. This milestone added **`HF_TRANSPORT_ERROR`** with explicit network stages, sanitized cause propagation, CLI/doctor exposure, and offline tests — **without** changing Gallery payload serialization, adding providers, or consuming another ZeroGPU invocation.

Live non-GPU verification shows **Node `fetch` to `/config` succeeds** from this process (HTTP 200, ~2.4s). No proxy environment variables are set. The prior opaque `fetch failed` during a full probe was therefore **not** a blanket inability to reach the Space root; the next authenticated probe should report the **exact stage** (`HF_UPLOAD`, `HF_SUBMIT`, `HF_QUEUE_CONNECT`, etc.) if transport fails again.

Verdict: **HF TRANSPORT DIAGNOSTIC PASSED**

## 2. HF Environment

```
HF_TOKEN_CONFIGURED=false   (this Cursor process / repo .env — token never printed)
HF_SPACE_ID=NOT_CONFIGURED  (this Cursor process / repo .env)
```

Prior user milestone had authenticated doctor success; credentials are not present in this diagnostic session. No anonymous GPU generation was attempted.

## 3. Doctor Result

Command: `pnpm providers:huggingface:doctor`

```
configured: false
authenticated: false
authenticationAttached: false
apiDiscovery: NOT_ATTEMPTED
spaceReachable: false
readiness: NOT_CONFIGURED
```

Doctor did not consume GPU quota (configuration missing in this process). When `HF_SPACE_ID` and `HF_TOKEN` are set, doctor failures at `HF_DISCOVERY` now include a `transport` object on the report if the failure is `HF_TRANSPORT_ERROR`.

## 4. Canonical Hash

Not re-hashed this session (no probe run). Baseline unchanged from prior milestones:

`1EF018239E5D1BD6F4A0DF35E5C803A6B1B8BC353590DA6ADAABA7B14CE00A2B`

## 5. Space

Target: `Qwen/Qwen-Image-Edit-2509`  
Root: `https://qwen-qwen-image-edit-2509.hf.space`

## 6. API

Live anonymous GET `/config` (no GPU):

```
status: 200
gradioVersion: 5.46.1
protocol: sse_v3
apiPrefix: /gradio_api
spaceId: Qwen/Qwen-Image-Edit-2509
durationMs: ~2394
```

## 7. Upload

Stage label: **`HF_UPLOAD`**  
Wrapped via `hfFetch('HF_UPLOAD', ...)` on `POST /gradio_api/upload?upload_id={session_hash}`.  
Not exercised live this session.

## 8. Gallery Payload

**Unchanged** — still `[{ image: FileData, caption: null }]`. No serialization edits this milestone.

## 9. Submit

Stage label: **`HF_SUBMIT`**  
Wrapped via `hfFetch('HF_SUBMIT', ...)` on `POST /gradio_api/call/infer`.  
Not exercised live this session.

## 10. Session Hash

Unchanged — per-job `session_hash` still generated and bound to `upload_id`.  
Not exercised live this session.

## 11. Queue

Stages:

- **`HF_QUEUE_CONNECT`** — opening SSE GET `/gradio_api/call/infer/{event_id}`
- **`HF_QUEUE_POLL`** — reading SSE body chunks (`reader.read()`)

## 12. Process Start

Unchanged semantic SSE event `process_starts` (not a transport stage). Transport wrapping does not alter SSE parsing.

## 13. Rewrite Prompt

Unchanged — probe still sends `rewrite_prompt=false`. Not exercised live this session.

## 14. Seed

Unchanged — probe still sends `seed=424242`, `randomize_seed=false`. Not exercised live this session.

## 15. Live Invocation

**Not run** — zero GPU invocations this milestone.

## 16. Live Error or Output

**Prior symptom (user report):**

```json
{
  "message": "fetch failed",
  "classification": "NOT_A_CAPACITY_FAILURE"
}
```

**Root cause:** Node/Undici throws `TypeError: fetch failed` with structured details on `error.cause` (`code`, `errno`, `syscall`, etc.). MetroForge previously re-threw or surfaced only the top-level message with no `code` or `stage`, making transport failures indistinguishable from application failures.

**After fix (example shape):**

```json
{
  "code": "HF_TRANSPORT_ERROR",
  "stage": "HF_UPLOAD",
  "causeCode": "ECONNRESET",
  "causeName": "Error",
  "causeMessage": "read ECONNRESET",
  "causeErrno": "...",
  "causeSyscall": "read",
  "message": "HF transport failed at HF_UPLOAD — TypeError: fetch failed — cause Error ECONNRESET: read ECONNRESET",
  "classification": "NOT_A_CAPACITY_FAILURE"
}
```

Tokens and `Authorization` headers are never included.

## 17. Technical QA

Not applicable — no output image.

## 18. Identity QA

Not applicable — no output image.

## 19. Pose QA

Not applicable — no output image.

## 20. VLM QA

`VLM_IDENTITY_QA=NOT_RUN`

## 21. Native Scale

Not written — no generation.

## 22. Provenance

Not populated — no live invocation.

## 23. ZeroGPU Quota State

`UNKNOWN` — no GPU call this session.

## 24. Gradio Client Diagnostic

**Not run** — `/config` fetch succeeded; no GPU diagnostic warranted until one authenticated probe with new transport reporting is attempted.

## 25. Tests

Added offline transport coverage in `huggingface-space.test.ts`:

- `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `UND_ERR_CONNECT_TIMEOUT`, TLS-style cause
- Stage labeling: `HF_UPLOAD`, `HF_SUBMIT`, `HF_QUEUE_CONNECT`, `HF_QUEUE_POLL`, `HF_RESULT_DOWNLOAD`
- Semantic preservation: `HF_SPACE_APPLICATION_ERROR` still distinct from `HF_TRANSPORT_ERROR`
- Token redaction in diagnostic strings

`pnpm test`: **123 files / 684 tests PASS** (+8 transport tests).

## 26. Build

- `pnpm typecheck` — PASS
- `pnpm build` — PASS
- `pnpm desktop:build` — PASS

## 27. Runtime Regression

`pnpm smoke:godot` — see command output at report time (expected **RUNTIME_VALIDATED**).

## 28. Remaining P0

Run **exactly one** authenticated `pnpm providers:reference:probe:free --target huggingface` with `HF_TOKEN` + `HF_SPACE_ID` configured. If it fails, the JSON error must now include `stage` and `causeCode` — use that to decide upload vs submit vs SSE vs download without another protocol rewrite.

## 29. Remaining P1

If transport succeeds but `HF_SPACE_APPLICATION_ERROR` returns, use **one** `gradio_client` oracle call (counts as the next GPU invocation) — do not stack repeated probes.

If transport fails at `HF_UPLOAD` with reset/timeout despite working `/config`, investigate local TLS/AV/firewall on large multipart POST bodies.

## 30. Recommended Next Milestone

**Single authenticated repaired Qwen probe with transport-aware error capture** — justified now that diagnostics are complete and `/config` baseline connectivity is confirmed. Do **not** rewrite Gallery serialization unless the new probe proves a protocol mismatch at a specific stage.

---

### Proxy environment (SET/UNSET only)

```
HTTP_PROXY=UNSET
HTTPS_PROXY=UNSET
NO_PROXY=UNSET
http_proxy=UNSET
https_proxy=UNSET
no_proxy=UNSET
```

### Network stages implemented

| Stage | When |
|---|---|
| `HF_DISCOVERY` | GET `/config` |
| `HF_UPLOAD` | POST `/gradio_api/upload?upload_id=...` |
| `HF_SUBMIT` | POST `/gradio_api/call/infer` |
| `HF_QUEUE_CONNECT` | GET SSE stream open |
| `HF_QUEUE_POLL` | SSE `reader.read()` |
| `HF_RESULT_DOWNLOAD` | GET output image URL |

### Files changed

- `packages/assets/src/execution/huggingface-space.ts`
- `packages/assets/src/execution/huggingface-space.test.ts`
- `packages/assets/src/index.ts`
- `apps/cli/src/commands/reference-provider.ts`

HF TRANSPORT DIAGNOSTIC PASSED
