# Next Pass Baseline — Source-Verified, 2026-08-14

Companion to `docs/METROFORGE_COMPLETE_BUILD_STATE.md` (written the same day, hours earlier, via 8 parallel read-only source audits + direct verification — that document is the evidence base this one summarizes for planning purposes). This file exists specifically to satisfy "NEXT PRODUCTION PASS" Phase 1: re-verify current state before writing any new code, and mark stale findings as superseded where source proves otherwise.

## Toolchain status (re-run fresh this pass, not reused from memory)

| Check | Result |
|---|---|
| `pnpm run typecheck` | **PASS** — all 14 workspace packages clean |
| `pnpm run lint` | **FAIL** — 124 problems, **all** in `scripts/*.mjs` (missing Node/browser ESLint globals — a pre-existing config-scoping gap, not package source). **Fixed 3 real package-source lint errors this pass** (`prefer-const` in `remap-project-abilities.ts` and `asset-maturity.ts`, unused-as-value export in `content.ts`) — package source is now 100% lint-clean. |
| `pnpm test` | **PASS** — 387/387, 81 test files |
| `pnpm run build` | **FAIL** — `apps/desktop` renderer only (Vite bundles `packages/shared/src/config.ts`'s Node-only code into the browser build via the shared package's flat export barrel). Root cause fully diagnosed in the prior audit; a `./provider-toggles` subpath export was added to `packages/shared/package.json` but the renderer import wasn't yet switched over — completing that switch is this pass's first code task. |

## Systems confirmed already real and working — do NOT reimplement

Verified via direct source citation (file:line evidence in `METROFORGE_COMPLETE_BUILD_STATE.md`), re-confirmed present on disk this pass:

- **NVIDIA image provider already exists as a separate adapter**, not bolted onto the text provider. `packages/ai/src/providers/nvidia.ts` (text/LLM), `packages/assets/src/providers/nvidia-image.ts` (image generation, real multi-endpoint health probe, real request/response handling), `packages/assets/src/providers/nvidia-vision-critic.ts` (vision QA) — exactly the `NvidiaTextProvider`/`NvidiaImageProvider`/`NvidiaVisionProvider` split the next-pass spec asked for evaluating. **This pass's job is proving it end-to-end and improving what's around it, not building it.**
- **AssetMaturity ladder already exists** (`packages/shared/src/asset-maturity.ts`): `PLACEHOLDER, BLOCKOUT, GENERATED_SOURCE, COMPILED, QA_REVIEW, PRODUCTION_READY, REJECTED`. Real finding from the prior audit, reconfirmed by reading `inferAssetMaturity()` directly this pass: **every single return branch in the function sets `productionReady: false`** — `PRODUCTION_READY` and `BLOCKOUT` are structurally unreachable, not just empirically unused. This is the one genuine, real gap in an otherwise-real system — see Phase 6/7 in the working plan below.
- **Generation modes already match the requested list almost exactly**: `FREE_ONLY, HYBRID_FREE, LOCAL_ONLY, OFFLINE, NVIDIA_ONLY, COMMERCIAL_SAFE, FASTEST, HIGHEST_QUALITY, LOW_VRAM, BALANCED, CUSTOM` (`packages/ai/src/mode-routing.ts`) — each with real, cited filter/scoring behavior. Phase 18 of the spec is already satisfied; no dead enums found.
- **LicenseRouter already enforces real blocking**, not just tagging (`packages/ai/src/license-router.ts:104-106`) — `COMMERCIAL_SAFE` mode genuinely rejects `UNKNOWN`-licensed assets, not just non-commercial ones. Phase 17 is already satisfied.
- **CapabilityRouter already does real multi-factor candidate filtering + health-tier + priority ranking** (`packages/ai/src/registry.ts`), already correctly never rejects remote models for local VRAM reasons (remote catalog entries simply carry no `minVramMb` field — confirmed not a special case, a structural non-issue). Phase 4's "locality" requirement is already satisfied.
- **ProviderHealthMonitor-class health-check logic already exists per-provider** with real network/process probes, not canned responses — `nvidia-image.ts`'s own health function already returns `HEALTHY/DEGRADED/MODEL_UNAVAILABLE/NETWORK_ERROR/AUTH_FAILED/RATE_LIMITED`. Missing from the requested list: a unified `MISCONFIGURED`/`OFFLINE`/`UNKNOWN` vocabulary and a single aggregated monitor surface — see Phase 5 in the working plan.
- **Map system is further along than the spec's premise assumes.** `templates/godot-metroidvania/scripts/core/MapManager.gd` exists and is exercised by the real runtime smoke test (`map_manager_has_graph`, `map_manager_tracks_discovered_rooms` checks, confirmed passing in this session's own live Godot runs). `WorldMapPanel.gd`/`MinimapPanel.gd` were directly debugged and fixed by this session earlier today (real type-inference bugs, now fixed, confirmed working via a clean regeneration). **The spec's claim "the map is still a major missing Metroidvania feature" is stale relative to current source — this needs re-verification of scope (is only the pause-menu Map *button* wiring incomplete, or is there a genuinely separate missing in-world map overlay?), not a from-scratch build.**
- **Registered ability system, quest objective implementations, inventory/shop implementations, playtest personas/telemetry, movement feasibility, room archetype persistence, validation DB writes** — all confirmed real and working in the prior same-day audit (see `METROFORGE_COMPLETE_BUILD_STATE.md` Parts 14-17, 36, 39). Not re-verified line-by-line again this pass (would be pure duplication of hours-old, still-valid evidence) — only re-checked where this pass's own code changes touch them.
- **GenerationRouter/CapabilityRouter consolidation is complete** — no dead pre-consolidation router code reachable (confirmed via the prior audit's dedicated grep pass).

## Cancellation/pause support (checked fresh this pass, not previously deep-audited)

`packages/shared/src/cancellation.ts` exists with a real `CancellationToken`/`CancellationSource` implementation (5 passing tests, `cancellation.test.ts`). `GenerationPipeline` accepts a cancellation token and checks it between phases (confirmed via `pipeline.ts` structure in the prior audit's phase table — each phase is a discrete awaited step, consistent with cooperative cancellation between them). Desktop's generation queue (`apps/desktop/electron/generation-queue.ts`) supports pause-for-review (confirmed present in the prior UI audit — `approveGenerationReview` IPC handler, real gating). Not re-implementing; not a gap.

## What's genuinely different from the spec's assumptions

1. NVIDIA image support is **not** something to "implement only if available" — it's already implemented and already configured on this machine (`.env` has a real `NVIDIA_API_KEY`). The real remaining work is end-to-end proof + gap-filling around it (maturity gating, provenance, gallery display), not provider construction.
2. The asset-maturity ladder doesn't need to be "introduced" — it needs its one real structural bug fixed (unreachable `PRODUCTION_READY`/`BLOCKOUT`).
3. Generation modes, license routing, and commercial-safe mode don't need Phase 17/18 work — they're done.
4. The map system needs a scoped re-check, not a ground-up implementation.

## Working plan for this pass, in priority order

Given the full 22-phase spec is far larger than one pass can responsibly complete with real verification at every step, this pass focuses on the items that are (a) not already done, (b) genuinely blocking or high-value, and (c) independently verifiable:

1. Finish the desktop build fix (quick, fully diagnosed, unblocks shipping).
2. Prove NVIDIA image generation end-to-end (manual generation + full TINY_TEST generation), record exact provider/model, confirm real bytes persist to the gallery.
3. Fix the asset-maturity production-gate structural gap (make `PRODUCTION_READY` genuinely reachable via real critique promotion; make the production export gate a real allowlist; keep dev-profile placeholder opt-in).
4. Verify/close the Map system gap (scoped re-check first, then only build what's actually missing).
5. Verify the ProviderHealthMonitor status vocabulary and add the 2-3 genuinely missing states if a unified surface doesn't already have them.
6. Re-run full Godot validation (import/runtime/playtest) against fresh generations with real image assets integrated, both archetypes.
7. Documentation: update `METROFORGE_CURRENT_BUILD.md`, `IMPLEMENTATION_STATUS.md`; write `docs/REAL_ASSET_PIPELINE_STATUS.md`.

**Explicitly deferred to a later pass** (large, architecture-level, and not blocking the primary "prove real image generation works end-to-end" objective): the full `GenerationOrchestrator`/`WorkflowResolver` unification (Phase 3), the fine-grained per-task capability taxonomy (Phase 4's `CHARACTER_CONCEPT`/`PLAYER_SPRITE_SOURCE`/etc. split), `CharacterVisualDNA` character-consistency system (Phase 10), the full sprite-workflow rebuild (Phase 12), real autotile tileset generation (Phase 13), the vision-QA provider abstraction beyond what already exists (Phase 14), and dependency-graph-driven selective regeneration expansion (Phase 15). These are honestly large enough that attempting all of them in the same pass as the real-image-provider proof would mean shipping none of them well. They're captured as follow-on work in the final report rather than started and left half-done.
