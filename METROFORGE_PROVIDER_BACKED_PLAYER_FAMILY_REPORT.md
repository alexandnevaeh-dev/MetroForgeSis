# MetroForge Provider-Backed Player Family Report

Date: 2026-08-19
Canonical repository: `E:\Projects\MetroForge\Forged`

## 1. Executive Summary

This milestone audited and exercised the real image-provider path for the deterministic fixture `metroforge-smoke-metroidvania`, seed `424242`. A focused provider doctor and `pnpm production:player` command now exist. The provider audit found a genuinely reachable, commercially eligible NVIDIA image route, but the actual player generation request failed at invocation after retries with an NVIDIA HTTP 422/504 error path. The command correctly refused to promote procedural fallback.

The result is partial:

- provider health: eligible
- provider generation: failed
- canonical reference: previous non-fallback NVIDIA reference exists from an earlier successful invocation, but this run did not complete a fresh approved family
- identity QA: not run
- native-scale QA: not run
- player family: `FAMILY_REVIEW_REQUIRED`
- runtime: `RUNTIME_VALIDATED`

No fake production-ready claim was made.

## 2. Baseline

The required baseline was preserved before and after changes:

- `pnpm typecheck`: PASS
- `pnpm test`: PASS, 112 files and 614 tests
- `pnpm smoke:godot`: PASS, `RUNTIME_VALIDATED`
- `pnpm build`: PASS
- `pnpm desktop:build`: PASS
- `pnpm validate`: PASS

Runtime, Visual Constitution, family certification, provenance, history, and placeholder blocking were not weakened.

## 3. Provider Availability Audit

The new `providers:image:doctor` command uses the existing `foundryBootstrapFromEnv()`, `registerFoundryImageProviders()`, `ImageProviderRegistry`, and provider health reports.

Observed provider state:

| Provider | Configured | Enabled | Reachable | Image generation | Reference conditioning | Editing | Commercial | Result |
|---|---:|---:|---:|---:|---:|---:|---|---|
| NVIDIA image | YES | YES | YES | YES | NO | NO | allowed | ELIGIBLE health route |
| ComfyUI | YES | YES | NO | YES | NO | NO | unknown | INELIGIBLE |
| Diffusers | YES | YES | NO | YES | NO | NO | unknown | INELIGIBLE |

NVIDIA health reported the hosted Visual GenAI endpoint reachable for `black-forest-labs/flux.1-dev`. The image route is separate from the text `/models` catalog and is selected through the normal image registry. NVIDIA hosted custom-reference conditioning remains explicitly unsupported by the existing identity adapter.

## 4. Provider Diagnostic Command

Added root command:

```powershell
pnpm providers:image:doctor
```

It reports configured/enabled/reachable/health/capabilities/reference support/editing/commercial status/result/reason without printing credentials. The command exits nonzero when no eligible image provider exists.

## 5. Selected Provider

The normal image registry selected `nvidia-image` as the highest-priority reachable commercially allowed image route for the fixture. ComfyUI and Diffusers were health-checked and rejected as unavailable.

This is a provider selection result, not a generation success result. The implementation now keeps those states distinct.

## 6. Selected Model

The selected configured NVIDIA image model was:

`black-forest-labs/flux.1-dev`

The model ID comes from existing environment/catalog configuration and was not hardcoded into the player generator.

## 7. Capability Routing

The production-player path uses the existing AssetPipeline/manual Asset Foundry path. It does not call NVIDIA directly, create another router, or bypass provider registration. Routing considers health, priority, local/remote mode, commercial metadata, capabilities, and fallback policy.

For the selected NVIDIA registration:

- `image-generation`: supported
- `vision`: registered
- custom reference conditioning: unsupported
- image editing: unsupported in the registration
- commercial metadata: allowed

## 8. NVIDIA Status

NVIDIA image infrastructure is implemented and reachable at health-probe level. The actual generation invocation failed with a provider error after the existing bounded retries:

`NVIDIA image generation errored/timeout (HTTP 422) for black-forest-labs/flux.1-dev ... failed after 3 NVIDIA image attempts`

The health probe therefore must not be interpreted as proof that the configured account/model/payload can complete a production generation. This is the remaining provider integration blocker.

## 9. Canonical Player Reference

The production-player command requests a structured canonical player reference from GameDNA/style/constitution context:

- side-view Metroidvania hero
- readable silhouette
- stable proportions
- weapon continuity
- transparent sprite
- production game scale
- constitution-matching style

An earlier invocation produced a non-fallback NVIDIA artifact at:

`assets/characters/player_production_reference.png`

with provider `nvidia-image`, model `black-forest-labs/flux.1-dev`, and maturity `QA_REVIEW`. The current rerun did not produce a new successful artifact because the provider invocation failed.

## 10. Candidate Variants

No approved bounded candidate set was produced. The command currently requests one canonical reference through the existing manual generation route; the provider failure prevented candidate selection. Variant generation remains bounded by the existing manual generator and should be added only after the single-reference payload is reliable.

## 11. Identity Pack

The command uses the existing `writeCharacterIdentityPack()` path when a successful reference and `visual_dna.json` are available. The pack records source/reference/silhouette/palette, body proportions, clothing, hair, weapon, distinctive features, animation tier, style fingerprint, and pose paths.

The current family is not approved because identity QA and required animation approval remain incomplete.

## 12. Reference Conditioning

The existing identity provider supports custom reference conditioning only when the selected registration advertises it. NVIDIA hosted custom-reference conditioning is explicitly false in `packages/assets/src/identity/provider.ts` because the current hosted Kontext path accepts canned example IDs rather than custom sprites.

Therefore this run does not claim reference-conditioned NVIDIA animation generation. The intended fallback is a compatible reference-capable provider, but ComfyUI/Diffusers were unavailable.

## 13. Base Sprite

The existing `AssetPipeline`/manual generation path writes the canonical player sprite through the normal Asset Foundry. Procedural fallback is rejected by `generateManualAsset()` for production-player use.

## 14. Run Animation

Existing player walk/run sheet generation and animation manifests remain available. They currently derive from the player source when a real source exists, but the production-player command does not yet complete a fresh approved animation family after the provider failure.

## 15. Attack Animation

Existing attack-sheet generation, weapon continuity metadata, and animation QA remain in the AssetPipeline. The family remains review-required because the required member is not proven non-placeholder, normalized, identity-consistent, and approved in this run.

## 16. Hurt Animation

Existing hurt-sheet generation and critique remain available. No fresh production approval was produced.

## 17. Death Animation

Existing death-sheet generation and lineage remain available. No fresh production approval was produced.

## 18. Optional Movement Animations

The fixture already supports generated pose paths for idle, run, jump-start, jump, fall, land, dash, wall-slide, and wall-jump. They remain governed by the existing animation manifest and maturity rules. This milestone did not falsely promote procedural pose transforms to production art.

## 19. Frame Normalization

Existing normalization includes transparent bounds, pixel processing, compiled frame sizes, PNG validation, animation manifests, and contact sheets. A universal player anchor contract and identity-preserving approved frames remain incomplete because the provider-backed family did not complete.

## 20. Anchor/Pivot System

Existing runtime sprites use stable gameplay collision components and animation resources. A dedicated family-level feet/body/pivot/weapon-extent approval record was not completed in this milestone. This remains a P1 requirement before `FAMILY_PRODUCTION_READY`.

## 21. Technical QA

Technical image validation and existing foundry QA reject malformed, blank, invalid-dimension, invalid-alpha, and incompatible animation/tile outputs. The previous successful NVIDIA reference reached `QA_REVIEW`, but that is not equivalent to family approval.

## 22. Identity QA

Identity comparison between reference and run/attack/hurt/death members was not run because the required fresh provider-backed family did not complete. No VLM or embedding identity score was fabricated.

## 23. VLM/Embedding QA

No VLM/embedding identity result was available in this run. The report records identity QA as `NOT_RUN`. Existing NVIDIA vision/VLM adapters remain optional and provider-neutral.

## 24. Native-Scale Review

Native-scale player review was not completed for a newly generated approved family. Existing runtime screenshot capture remains valid and the previous runtime certificate remains `RUNTIME_VALIDATED`, but that does not approve this player family visually.

## 25. Repair Attempts

Provider retries were bounded by the existing NVIDIA image adapter. The provider failed after three attempts. No unbounded loop and no procedural substitution for production success was introduced.

## 26. Provider Fallbacks

Observed fallback order:

1. NVIDIA image selected by health/priority/commercial route
2. NVIDIA generation failed with HTTP 422/504 behavior after retries
3. ComfyUI and Diffusers unavailable
4. procedural fallback refused for the production-player command
5. player family remained `FAMILY_REVIEW_REQUIRED`

## 27. Approval Workflow

The command records provider audit, selected provider/model, reference path, errors, warnings, and family status in `player-family-production-report.json`. Existing asset history supports non-destructive version recording/restoration. Full player-specific approve/reject/regenerate/select-variant operations remain incomplete.

## 28. Version History

Existing `recordAssetVersion`, `listAssetHistory`, and `restoreAssetVersion` remain the history foundation. The new production-player command does not delete prior references. A complete active-version family manifest remains a follow-up.

## 29. Provenance

The provider-backed reference report records provider, model, path, maturity, fallback status, seed, and provider audit. Existing AssetFoundry provenance additionally records prompt hashes, source/derived licenses, cache state, transformations, and parent lineage where available.

## 30. Licensing

NVIDIA image registration reported commercial eligibility `allowed`. ComfyUI and Diffusers reported unknown commercial status and were not eligible for production selection. Unknown or restricted licensing remains blocking for production-ready classification.

## 31. Desktop Family Inspector

No new desktop redesign was made. Existing asset gallery, manual asset generator, Visual Review, previews, history, and restore surfaces remain available. A focused player-family inspector with per-member native-scale animation, anchors, variants, and provider visibility remains P1.

## 32. Godot Integration

The existing Godot assembler and runtime animation path remain unchanged. The provider-backed reference was not promoted into the active runtime player family because the required family was not completed and approved. Collision/runtime systems remain protected from partial visual replacement.

## 33. Runtime Regression

The runtime gate remained passing:

- `pnpm smoke:godot`: PASS
- runtime: `RUNTIME_VALIDATED`
- screenshot capture: PASS

No visual/provider failure weakened runtime certification.

## 34. Before/After Evidence

No valid after-family evidence set exists because provider generation failed during the current production-player run. Existing earlier NVIDIA reference bytes are preserved in the fixture, but the report does not claim a completed before/after production comparison without approved animations and gameplay integration.

## 35. Player Family Certification

Current result:

```text
Canonical reference: provider-backed artifact exists from an earlier run, QA_REVIEW
Animation family: not freshly generated/approved
Identity QA: NOT_RUN
Native-scale QA: NOT_RUN
Player family: FAMILY_REVIEW_REQUIRED
```

The family is not production-ready.

## 36. Whole-Project Visual Status

Whole-project visual status remains `VISUAL_DEGRADED`. Runtime remains `RUNTIME_VALIDATED`. One provider-backed reference cannot promote the whole project or the player family without all mandatory members and approval gates.

## 37. Tests

- Final full suite: 117 test files, 625 tests passed
- New provider eligibility tests: 1 file, 2 tests passed
- `pnpm typecheck`: PASS
- No network dependency was added to the unit suite

## 38. Build Results

- `pnpm install --frozen-lockfile`: PASS
- `pnpm build`: PASS
- `pnpm build:cli`: PASS
- `pnpm typecheck`: PASS
- `pnpm desktop:build`: PASS
- `pnpm smoke:godot`: PASS
- `pnpm validate`: PASS
- `pnpm providers:image:doctor`: PASS, NVIDIA eligible at health level
- `pnpm production:player`: provider generation failed as expected and returned nonzero

## 39. Files Changed

Player/provider changes:

- `apps/cli/src/commands/image-production.ts`
- `apps/cli/src/commands/image-production.test.ts`
- `apps/cli/src/index.ts`
- `apps/cli/package.json`
- `apps/cli/tsconfig.json`
- `package.json`
- `pnpm-lock.yaml`
- `METROFORGE_PROVIDER_BACKED_PLAYER_FAMILY_REPORT.md`

Existing unrelated user/generated worktree changes were preserved. `Forged-cursor-desktop` was not modified.

## 40. Commands Run

From `E:\Projects\MetroForge\Forged`:

```powershell
pnpm typecheck
pnpm test
pnpm smoke:godot
pnpm install --frozen-lockfile
pnpm build
pnpm desktop:build
pnpm providers:image:doctor
pnpm production:player
pnpm validate
```

The production-player command produced `player-family-production-report.json` with the provider audit and exact generation failure. It did not convert fallback output to success.

## 41. Remaining P0

- Resolve the NVIDIA image invocation failure for the configured `black-forest-labs/flux.1-dev` route, or make another existing image provider reachable and eligible.
- Complete a fresh non-fallback canonical player reference and required animation family before attempting certification.

## 42. Remaining P1

- Add provider request/response fixture tests for NVIDIA HTTP 422/504 payloads.
- Add bounded three-candidate reference selection once the image route is reliable.
- Add reference-capable animation generation through a reachable compatible provider.
- Add player anchor/jitter metrics and native-scale approval evidence.
- Implement player-family approve/reject/regenerate/select/restore operations over existing history.
- Add focused desktop player-family inspector.

## 43. Recommended Next Milestone

**NVIDIA Image Invocation Repair and Player Reference Approval**: inspect the exact NVIDIA 422 response payload, correct the existing provider request/model configuration without bypassing the router, generate three bounded canonical candidates, technically validate them, select one, write the identity pack, and only then continue to reference-conditioned player animation members.

# PROVIDER-BACKED PLAYER FAMILY PARTIAL
