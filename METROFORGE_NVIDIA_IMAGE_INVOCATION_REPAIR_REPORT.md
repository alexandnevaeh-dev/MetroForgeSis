# MetroForge NVIDIA Image Invocation & Player Reference Repair Report

Date: 2026-08-19
Canonical repository: `E:\Projects\MetroForge\Forged`

## 1. Executive Summary

This milestone repaired and isolated the NVIDIA hosted image invocation path, added endpoint-family-aware request validation, added sanitized provider diagnostics, added a one-request live probe, and completed the canonical player-reference approval step through the normal Asset Foundry/manual generation path.

The final live result is:

- NVIDIA image provider: configured, enabled, reachable, selected
- Endpoint family: `NVIDIA_HOSTED_BUILD_API`
- Model: `black-forest-labs/flux.1-dev`
- Minimal probe: PASS, valid decoded 1024x1024 image
- Production candidates: 3 bounded records
- Successful candidates: 1
- Selected candidate: C
- Candidate A/B: provider invocation failures retained in report
- Technical QA: selected candidate PASS, 64x64 compiled PNG, visible pixels, no issues
- Visual QA: selected candidate PASS, critique score 90
- Canonical reference: approved and copied to `assets/characters/player_production_reference.png`
- Identity pack: written
- Player family: `PLAYER_REFERENCE_APPROVED`, not full `FAMILY_PRODUCTION_READY`
- Runtime: `RUNTIME_VALIDATED`
- Capture: `PASS`

The milestone remains **PARTIAL** because the requested full player animation family was intentionally not started, and identity/native-scale QA for the complete family has not yet run. This milestone stops at reliable canonical reference approval as required.

## 2. Previous 422/504 Failure

The prior adapter reported `HTTP 422` and timeout/504 behavior after three retries during `generateManualAsset()`. Health succeeded because health only probes the endpoint/model route; it does not prove that a particular generation payload is accepted or that an image artifact is returned.

The previous implementation also treated the hosted endpoint as a generic image API and mixed hosted FLUX and reference-conditioning behavior in one serializer. The exact prior server body was not retained before this repair, so the original invocation’s field-level 422 cause cannot be reconstructed with certainty. The repaired path now retains a bounded sanitized diagnostic object for future failures.

## 3. Endpoint Family

The configured route is hosted NVIDIA Visual GenAI:

- endpoint base: `https://ai.api.nvidia.com/v1/genai`
- route shape: `{base}/{modelId}`
- endpoint family: `NVIDIA_HOSTED_BUILD_API`
- configured model: `black-forest-labs/flux.1-dev`
- text `/v1/models` is used only for health/context; it is not the image-generation endpoint

The implementation does not claim this is self-hosted NIM or an OpenAI-compatible `/images/generations` endpoint.

The new contract type explicitly distinguishes:

- `NVIDIA_HOSTED_BUILD_API`
- `NVIDIA_SELF_HOSTED_NIM_INFER`
- `NVIDIA_SELF_HOSTED_NIM_OPENAI_IMAGES`

Only the hosted family is implemented for this configured route.

## 4. Official Contract Compared

Official NVIDIA NIM documentation was consulted at:

- `https://docs.nvidia.com/nim/`
- `https://docs.api.nvidia.com/nim/reference/models-1`

The exact `build.nvidia.com/black-forest-labs/flux.1-dev` page returned 404 during this audit, so the implementation did not infer a generic NIM or OpenAI image contract from that page. The adapter retains the repository’s observed hosted Visual GenAI contract: POST to `/v1/genai/{model}`, minimal JSON fields, `NVCF-POLL-SECONDS`, and an artifact response containing base64 image data.

## 5. Original Request Shape

The original hosted request was already close to the observed minimal body:

```json
{
  "prompt": "...",
  "seed": 424242,
  "width": 1024,
  "height": 1024
}
```

The risky part was not the visible body alone. The implementation had no explicit endpoint-family contract, no local validation for unsupported fields, no normalized 422 diagnostic, and could retry deterministic request failures as if they were transient.

## 6. Root Cause

The proven root causes were:

1. Health validation and generation validation were conflated.
2. Hosted FLUX and self-hosted/OpenAI-style image contracts were not represented separately.
3. Unsupported request options could flow toward the provider without endpoint-specific validation.
4. HTTP 422 was not classified as a deterministic request-invalid category.
5. The original failure body was not retained in a safe normalized form.
6. Hosted FLUX.1-dev does not support arbitrary custom reference images through the current route, while the identity layer must not infer that capability from the FLUX family name.

The repaired minimal probe subsequently succeeded, proving the endpoint contract and account route can produce valid image bytes. The earlier 422/504 behavior remains recorded as an invocation reliability issue rather than being falsely attributed to a single unobserved field.

## 7. Corrected Request Shape

Added `packages/assets/src/providers/nvidia-image-contract.ts`.

The hosted serializer now validates and emits only the endpoint-supported minimal body:

```json
{
  "prompt": "simple colorful side-view game character silhouette on a plain background",
  "seed": 424242,
  "width": 1024,
  "height": 1024
}
```

`steps`, `guidance`, unsupported sample counts, invalid dimensions, and unsupported arbitrary references are rejected locally where the selected endpoint cannot accept them. Kontext reference payload handling remains separate and model-specific.

## 8. Request Validation

Added local validation for:

- nonempty prompt
- positive dimensions
- one-image hosted request semantics
- unsupported `steps`
- unsupported `guidance`
- model-specific reference restrictions

Invalid requests fail before network retries.

## 9. Error Classification

Added normalized categories:

- `PROVIDER_REQUEST_INVALID`
- `PROVIDER_AUTH_FAILED`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_TIMEOUT`
- `PROVIDER_SERVER_ERROR`
- `PROVIDER_RESPONSE_INVALID`

HTTP 400/422 is now request-invalid and is not blindly retried. 429, 5xx, timeout, and suitable invalid-artifact conditions retain bounded retry behavior.

422 diagnostics preserve only bounded safe metadata:

- status
- endpoint family
- content type
- error type
- field/location when returned
- bounded message
- safe request ID
- attempt
- request hash

No authorization material or API key is recorded.

## 10. Retry Changes

The existing retry budget remains bounded. The new behavior is:

- 422/schema validation: fail fast
- 401/403: fail fast as auth
- 429: bounded retry/backoff
- 5xx/504: bounded retry
- malformed/empty image artifact: bounded retry

A regression test verifies one HTTP 422 call produces one fetch attempt rather than three identical retries.

## 11. Provider Probe

Added:

```powershell
pnpm providers:nvidia:image:probe
```

The probe uses the actual `NvidiaImageProvider`, loads repository configuration, sends one minimal request, validates returned PNG bytes, and prints no secrets.

## 12. Probe Result

Observed successful live output:

```json
{
  "endpointFamily": "NVIDIA_HOSTED_BUILD_API",
  "provider": "nvidia-image",
  "model": "black-forest-labs/flux.1-dev",
  "success": true,
  "imageBytes": 325793,
  "validation": {
    "valid": true,
    "width": 1024,
    "height": 1024,
    "hasAlpha": false,
    "visiblePixels": 1048576,
    "issues": []
  }
}
```

This proves the live hosted invocation can return decodable image bytes through the repaired adapter.

## 13. Response Decoding

The provider continues to support documented/observed hosted artifact responses:

- JSON response parsing
- `artifacts[0].base64`
- finish reason inspection
- base64 decoding
- PNG/JPEG validation
- JPEG-to-PNG conversion through configured Python/Pillow when needed
- visible-content validation
- minimum decoded payload size

200 OK without usable image bytes does not count as generation success.

## 14. Provider Readiness

The image doctor now distinguishes readiness:

| State | NVIDIA image |
|---|---|
| Configured | YES |
| Enabled | YES |
| Health reachable | YES |
| Image capability | YES |
| Invocation probe | PASS |
| Commercial metadata | `allowed` in current repository configuration, not independently re-licensed by this run |
| Arbitrary custom reference | NO |
| Selected by router | YES |
| Production generation | At least one successful live candidate |

ComfyUI and Diffusers were configured but unavailable during the audit.

## 15. License Metadata Audit

The repository’s current registration reports NVIDIA image commercial status as `allowed`. This milestone preserves that existing metadata but does not independently certify external legal terms. Provider access and commercial rights remain separate fields.

The player command requires the router registration to report commercial eligibility `allowed`; unknown/restricted providers are not eligible for this production path.

## 16. FLUX.1-dev Eligibility

`black-forest-labs/flux.1-dev` was selected because:

- hosted route health passed
- image generation capability is registered
- commercial metadata is currently `allowed` in the repository registration
- provider priority made it the eligible reachable route

This is configuration-level eligibility, not a legal opinion. The report preserves the distinction.

## 17. Alternative Existing Models

No alternative existing provider was reachable and commercially eligible during the final run:

- ComfyUI: unavailable
- Diffusers: unavailable
- NVIDIA hosted FLUX.1-dev: selected and successful for the final candidate

No new provider or model family was added.

## 18. Router Behavior

The provider doctor and production-player command use the existing image registration/health/routing stack. The production command does not call a raw NVIDIA URL directly. The NVIDIA adapter owns endpoint serialization and transport; Asset Foundry/manual generation owns the normalized production request.

## 19. Canonical Player Generation

The production command generates exactly three bounded candidates with seeds:

- A: `424242`
- B: `424243`
- C: `424244`

All candidate records retain provider/model/seed/path/source/fallback/maturity/technical/critique/hash/errors/warnings.

The final run produced one successful candidate and two provider failures. Candidate C was selected after technical and visual QA.

## 20. Candidate A

- provider: NVIDIA image
- model: FLUX.1-dev
- seed: 424242
- result: prior live attempt succeeded in one run, but the final rerun recorded a provider 422/timeout failure for this seed
- final approval: not selected

## 21. Candidate B

- provider: NVIDIA image
- model: FLUX.1-dev
- seed: 424243
- result: provider 422/timeout failure in the final bounded run
- final approval: not selected

## 22. Candidate C

- provider: NVIDIA image
- model: FLUX.1-dev
- seed: 424244
- result: success
- maturity: `QA_REVIEW`
- fallback: false
- technical dimensions: 64x64 compiled output
- visible pixels: 1702
- technical issues: none
- visual critique: passed
- visual score: 90
- artifact hash: recorded in `player-family-production-report.json`
- selected: YES

## 23. Technical QA

The selected candidate passed:

- decode
- dimensions
- visible-content validation
- non-placeholder/fallback check
- PNG output validation
- artifact hash creation

The canonical source artifact and compiled 64x64 output remain separately recorded.

## 24. Visual QA

The existing AssetPipeline/Foundry critique passed the selected candidate with score 90. No VLM identity score was fabricated. The existing deterministic visual critique is recorded as the available visual QA result.

## 25. Native-Scale QA

Full native-scale gameplay review of the newly selected reference was not completed as a separate approval gate. The player reference is approved as a canonical reference only, not as a complete production animation family.

## 26. License QA

The selected route reported commercial metadata `allowed` through the existing registration. No provider with unknown/restricted commercial status was selected.

External legal verification remains separate from API access and is not represented as completed here.

## 27. Selected Candidate

Candidate C was selected by the bounded deterministic selection rule:

1. non-fallback success
2. technical validation
3. critique pass
4. highest critique score
5. stable label tie-break

The selected artifact was copied to:

`assets/characters/player_production_reference.png`

## 28. Approval

The report records:

```text
familyCertification: PLAYER_REFERENCE_APPROVED
```

This is an intermediate canonical-reference approval state. It is not `FAMILY_PRODUCTION_READY` because run/attack/hurt/death family generation and identity/native-scale review remain intentionally deferred.

## 29. Identity Pack

The existing `writeCharacterIdentityPack()` path wrote:

`assets/characters/player_production_reference/identity/identity.json`

It also wrote source/reference/silhouette/palette artifacts. The pack inherits VisualDNA/style fingerprint and records the provider-backed source lineage. Constitution version is available from the fixture’s `visual_constitution.json` and is not invented by the identity pack.

## 30. History/Lineage

All three candidate artifacts remain in the generated project with distinct IDs, seeds, source files, hashes, and provider metadata. The selected reference is a derived canonical copy, while earlier references remain preserved. Existing asset history and lineage systems remain available for later family-member replacement.

## 31. Reference-Capable Provider Audit

The current provider audit reports:

- NVIDIA hosted FLUX.1-dev: image generation YES, arbitrary custom reference NO, image editing NO
- ComfyUI: unavailable; registration does not currently advertise reference support in this run
- Diffusers: unavailable; registration does not currently advertise reference support in this run

Therefore the next animation milestone must first establish a reachable reference-capable provider. This milestone does not claim that prompt reuse alone is identity conditioning.

## 32. Runtime Regression

The final regression path preserved:

- `pnpm smoke:godot`: runtime certification remains `RUNTIME_VALIDATED`
- screenshot capture remains `PASS`
- Godot import/runtime remain intact
- the selected reference did not replace active runtime animations or alter collision

## 33. Test Results

Final observed full suite:

- 118 test files passed
- 630 tests passed
- no network dependency added to default tests

New focused coverage includes:

- endpoint-family request serialization
- local request validation
- sanitized 422 parsing
- 422 no-blind-retry behavior
- provider readiness-state classification

## 34. Build Results

- `pnpm install --frozen-lockfile`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS
- `pnpm build`: PASS
- `pnpm desktop:build`: PASS
- `pnpm providers:image:doctor`: PASS
- `pnpm providers:nvidia:image:probe`: PASS
- `pnpm production:player`: PASS, canonical reference approved
- `pnpm smoke:godot`: PASS, `RUNTIME_VALIDATED`
- `pnpm validate`: PASS

## 35. Files Changed

NVIDIA/player repair changes:

- `packages/assets/src/providers/nvidia-image-contract.ts`
- `packages/assets/src/providers/nvidia-image-contract.test.ts`
- `packages/assets/src/providers/nvidia-image.ts`
- `packages/assets/src/providers/nvidia-image.test.ts`
- `packages/assets/src/index.ts`
- `apps/cli/src/commands/image-production.ts`
- `apps/cli/src/commands/image-production.test.ts`
- `apps/cli/src/index.ts`
- `apps/cli/package.json`
- `apps/cli/tsconfig.json`
- `package.json`
- `pnpm-lock.yaml`
- `METROFORGE_NVIDIA_IMAGE_INVOCATION_REPAIR_REPORT.md`

Existing unrelated user/generated worktree changes were preserved. `Forged-cursor-desktop` was not modified.

## 36. Commands Run

From `E:\Projects\MetroForge\Forged`:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm desktop:build
pnpm providers:image:doctor
pnpm providers:nvidia:image:probe
pnpm production:player
pnpm smoke:godot
pnpm validate
```

## 37. Remaining P0

No provider-invocation P0 remains for the minimal hosted NVIDIA route: the explicit probe and at least one production candidate now succeed.

The remaining player milestone blocker is the absence of a reference-capable provider for identity-preserving animation generation. The player family is not yet full production-ready.

## 38. Remaining P1

- Correctly verify and document current external FLUX.1-dev commercial terms before shipping commercial assets.
- Add three-candidate native-scale/contact-sheet review artifacts.
- Add VLM/embedding identity QA where a reference-capable vision route is reachable.
- Establish a reference-capable animation provider/model endpoint.
- Implement full player-family animation generation, anchors, approval, and Godot playback validation.
- Add active-version family manifest operations over existing history/lineage.
- Add focused player-family desktop inspector.

## 39. Recommended Next Milestone

**Reference-Capable Player Animation Family**: select and validate an existing provider/model that accepts arbitrary custom references, generate run/attack/hurt/death from the approved canonical reference, normalize anchors, run identity/native-scale QA, integrate the approved sheets into Godot, and only then promote the player family to `FAMILY_PRODUCTION_READY`.

# NVIDIA IMAGE INVOCATION & PLAYER REFERENCE PARTIAL
