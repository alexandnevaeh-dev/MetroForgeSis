# AI Models — Verified Current State

Companion to [`METROFORGE_CURRENT_BUILD.md`](./METROFORGE_CURRENT_BUILD.md) §6. The full model
catalog is `config/models.catalog.json` (data, not code) — inspect it directly for the complete
list. This file documents only the models added this session, plus how to read the catalog's
newer fields.

## `usageClass` (new field, added this session)

`packages/schemas/src/models.ts` `ModelEntrySchema` gained a new **optional, backward-compatible**
field:

```ts
usageClass?: 'development_prototyping' | 'production'
```

`costClass: 'free'` alone can't express the difference between "genuinely free, unrestricted
compute" (e.g. a local Ollama model) and "free but explicitly a developer/prototyping tier, not a
production SLA" (NVIDIA's hosted developer API). Absent means no special distinction — the common
case for local models. Existing catalog entries were not modified; this is purely additive.

## NVIDIA NIM models added this session

All four IDs below were **live-verified against NVIDIA's real `GET /v1/models` response** during
this session, not just taken from documentation. This mattered in practice: two IDs originally
picked from NVIDIA's own docs pages (`deepseek-ai/deepseek-r1` and
`qwen/qwen2.5-coder-32b-instruct`) turned out to be absent from the live catalog when checked —
the actual current DeepSeek entries are `deepseek-ai/deepseek-v4-flash-0731` and
`deepseek-ai/deepseek-coder-6.7b-instruct`, and no Qwen models were present at all at verification
time. All four models below are confirmed live-present as of 2026-08-11.

| ID | Role | commercialUse | Notes |
|---|---|---|---|
| `meta/llama-3.1-8b-instruct` | Fast general text/JSON | `allowed` (Llama 3.1 Community License — well-documented terms) | 128K context |
| `nvidia/llama-3.1-nemotron-70b-instruct` | High-quality reasoning/world-design/QA | `allowed` (same base license, NVIDIA fine-tune) | 128K context, highest priority (78) of the four |
| `deepseek-ai/deepseek-v4-flash-0731` | Reasoning | `unknown` — not confirmed, marked honestly rather than guessed | No public context-window figure found; field omitted rather than invented |
| `deepseek-ai/deepseek-coder-6.7b-instruct` | Code / GDScript | `unknown` — DeepSeek Coder licensing has had restricted variants historically; not verified for this specific model | — |

All four are `enabled: false` by default in the catalog (consistent with every other hosted
provider's model entries — `gemini-2.0-flash`, `groq-llama-3.3-70b`) and
`usageClass: 'development_prototyping'`.

**Update, 2026-08-14**: NVIDIA image generation is real and verified end-to-end (see
`REAL_ASSET_PIPELINE_STATUS.md`) via `NvidiaImageProvider`, but it is deliberately **not** listed in
this model catalog — it's registered directly in `packages/assets/src/asset-pipeline.ts`'s
`ImageProviderRegistry`, a separate registry from the `ModelCatalogService`/`ModelRegistry` this
document otherwise describes. Adding a catalog entry for it here would describe a routing path that
doesn't actually go through this catalog, which would be misleading rather than informative.
NVIDIA vision/multimodal (`NvidiaVisionCritic`) is likewise real, verified, and outside this
catalog's scope — it's a `VisionCritic` implementation, not a `TextGenerationProvider` model entry.
