# AI Providers — Verified Current State

Companion to [`METROFORGE_CURRENT_BUILD.md`](./METROFORGE_CURRENT_BUILD.md) §7. Documents only
what was verified by direct source inspection and live testing, not aspirational design.

All text-generation providers implement `TextGenerationProvider`
(`packages/ai/src/types.ts`) and are registered by `bootstrapProviders()`
(`packages/ai/src/bootstrap.ts`). Priority/enabled/license metadata comes from
`config/providers.default.json`. Hosted providers are only ever registered when
`mode` is `HYBRID_FREE`, `FREE_ONLY`, or `CUSTOM` — never `LOCAL_ONLY` — and only if their
API key env var is set.

| Provider | ID | File | Auth env var | Local | Default priority | Status |
|---|---|---|---|---|---|---|
| Ollama | `ollama` | `packages/ai/src/providers/ollama.ts` | — (local server) | yes | 100 | WORKING — real `/api/generate`, verified live this session (deterministic Game DNA fallback exercised because no server was reachable in this environment) |
| Google Gemini | `gemini` | `packages/ai/src/providers/gemini.ts` | `GEMINI_API_KEY` | no | 80 | WORKING (code path real; not exercised live — no key configured) |
| Groq | `groq` | `packages/ai/src/providers/groq.ts` | `GROQ_API_KEY` | no | 75 | WORKING (same) |
| NVIDIA NIM | `nvidia` | `packages/ai/src/providers/nvidia.ts` | `NVIDIA_API_KEY` | no | 70 | WORKING — added this session, see below |
| OpenRouter | `openrouter` | `packages/ai/src/providers/openrouter.ts` | `OPENROUTER_API_KEY` | no | 60 | WORKING (code path real; not exercised live) |
| Hugging Face | `huggingface` | `packages/ai/src/providers/huggingface.ts` | `HUGGINGFACE_API_KEY` | no | 50 | WORKING (text only; code path real, not exercised live) |

## NVIDIA NIM (added this session)

**Base URL**: `https://integrate.api.nvidia.com/v1` (configurable via `NVIDIA_API_BASE_URL`).
**Endpoint**: `POST /chat/completions`, OpenAI-compatible request/response shape.
**Auth**: `Authorization: Bearer ${NVIDIA_API_KEY}`.

Verified live against the real endpoint this session (not just documentation):
- The exact base URL, endpoint path, and request/response shape were confirmed by cross-checking
  three independent sources (NVIDIA's own docs, a live web search for working curl examples, and
  a direct `curl` against `https://integrate.api.nvidia.com/v1/models`).
- **`GET /v1/models` is publicly readable and returns the full model catalog regardless of
  whether the bearer key is valid.** This was discovered by testing with a deliberately fake key
  (`nvapi-dummy-test-key-not-real`) and observing a real `200` response with real model data. This
  means the provider's health check (`getHealthDetails()`) can only confirm "the NVIDIA API is
  reachable," not "this key will be accepted" — key validity is only provable by an actual
  `/chat/completions` call, which the health check deliberately does not make (per the
  requirement not to spend a real generation request just to check configuration). A genuinely
  invalid key surfaces as `NVIDIA_AUTH_FAILED` the first time `generateText()` actually runs.
- `metroforge doctor` was live-tested with both no key (reports "NOT CONFIGURED", makes zero
  network calls) and the dummy key (reports "CONFIGURED — REACHABLE" with real measured latency).
  The key itself is never printed in either case.

**Retry policy**: bounded exponential backoff (500ms × 2^attempt + jitter, default 3 retries),
honors `Retry-After` on 429. Retries on 408/429/500/502/503/504 and network/timeout errors only —
400/401/403/404 fail immediately so `FallbackManager` can move to the next candidate provider
without wasting the retry budget on an error retrying can't fix.

**Typed errors** (`NvidiaProviderError`, field `code`): `NVIDIA_INVALID_RESPONSE`,
`NVIDIA_AUTH_FAILED`, `NVIDIA_RATE_LIMITED`, `NVIDIA_TIMEOUT`, `NVIDIA_MODEL_NOT_FOUND`,
`NVIDIA_PROVIDER_UNAVAILABLE`, `NVIDIA_REQUEST_FAILED`.

**Key handling**: read only from `process.env.NVIDIA_API_KEY`, never stored in the model catalog,
never sent to the Electron renderer (bootstrap only ever runs in the main/CLI process), never
written to `generation_manifest.json`. Any string that happens to contain the literal key is
redacted (`maskApiKey()` in `nvidia.ts`) before it could reach a thrown error, as defense in depth
— verified by a test that deliberately puts the key in a mock error response body and asserts it
never appears in the thrown error's message.

**Not implemented this session (deliberately, not silently skipped)**:
- No image-generation adapter (`packages/assets/src/providers/nvidia-image.ts` does not exist).
  NVIDIA's visual-model endpoints use a different, unverified request/response shape than
  `/chat/completions`, and guessing at that shape was explicitly out of scope.
- Not migrated onto `GenerationRouter` — NVIDIA uses the same `CapabilityRouter`/`FallbackManager`
  path every other hosted text provider already uses (the one this repository's own audit
  confirmed is actually wired to real work — see `METROFORGE_CURRENT_BUILD.md` §5/§8/§31).
  Migrating everything to `GenerationRouter` is a separate, larger, already-documented follow-up.
