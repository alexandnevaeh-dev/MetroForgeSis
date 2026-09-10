# MetroForge Reference-Capable Player Animation Report

Date: 2026-08-19
Canonical repository: `E:\Projects\MetroForge\Forged`

## 1. Executive Summary

This milestone audited and extended the reference-capable player animation path without generating unrelated player designs or using procedural poses as production output. The approved canonical player reference is preserved. A provider-neutral reference doctor and probe now report whether an existing configured route can consume arbitrary custom reference images.

The current result is:

- canonical reference: preserved and available
- identity pack: preserved and available
- NVIDIA hosted FLUX.1-dev generation: healthy/invocation-validated
- NVIDIA arbitrary custom reference: unavailable
- ComfyUI: unreachable/not installed as a usable route
- Diffusers: unreachable/reference model not installed
- reference probe: `REFERENCE_CAPABILITY_UNAVAILABLE`
- animation stage: blocked before generation
- player family: `FAMILY_REVIEW_REQUIRED`
- runtime: `RUNTIME_VALIDATED`
- capture: `PASS`

The milestone is **PARTIAL**. No provider-capable arbitrary-reference animation route exists in the current configured environment, so generating animations would require either unsupported prompt-only identity claims or procedural fallback. Both are correctly refused.

## 2. Previous State

The prior milestone produced a fresh provider-backed canonical reference through NVIDIA hosted FLUX.1-dev, generated three bounded candidates, selected candidate C, and wrote the player identity pack. It intentionally stopped before full animation generation because NVIDIA hosted FLUX.1-dev does not advertise arbitrary custom-reference conditioning.

That approved reference remains the source of truth for this milestone.

## 3. Canonical Player Reference

Current approved source:

`GeneratedGames/metroforge-smoke-metroidvania/assets/characters/player_production_reference.png`

The generated project also preserves candidate A/B/C artifacts and the selected candidate metadata in `player-family-production-report.json`. The identity pack remains under:

`assets/characters/player_production_reference/identity/`

No replacement reference was generated or discarded during this milestone.

## 4. Reference Hash/Identity Pack

The reference doctor/probe validates that the source file exists before attempting a reference operation. Existing identity-pack output includes source/reference/silhouette/palette/identity JSON, VisualDNA style fingerprint, body proportions, clothing, hair, weapon, distinctive features, and animation tier.

The source hash and candidate hashes remain recorded in the prior player-family production report. A reference mismatch is treated as a blocker rather than silently regenerating a new player.

## 5. Reference-Capable Provider Audit

Added:

```powershell
pnpm providers:reference:doctor
```

Observed statuses:

| Provider | Health | Custom reference | Image editing | Readiness |
|---|---|---:|---:|---|
| NVIDIA hosted FLUX.1-dev | HEALTHY | NO | NO | `REFERENCE_CAPABILITY_UNAVAILABLE` |
| ComfyUI | unavailable | NO advertised | NO advertised | `REFERENCE_MODEL_NOT_INSTALLED` |
| Diffusers | unavailable | NO worker capability | NO | `REFERENCE_MODEL_NOT_INSTALLED` |

The doctor reports configured/enabled/reachable/capabilities/commercial status/readiness without secrets.

## 6. NVIDIA Reference-Capable Status

NVIDIA hosted FLUX.1-dev remains a working text-to-image route:

- `IMAGE_GENERATION`: YES
- arbitrary custom reference: NO
- image editing: NO
- pose conditioning: NO
- identity conditioning: NO
- custom multi-image reference: NO

The existing identity provider explicitly keeps `NVIDIA_KONTEXT_CUSTOM_REFERENCE_SUPPORTED = false` because the current hosted route does not accept arbitrary custom sprites. This was not weakened to force animation generation.

## 7. Diffusers Status

The local Diffusers worker is currently text-to-image oriented. No installed IP-Adapter, ControlNet, img2img reference workflow, or equivalent reference model was found in the configured local model/runtime path.

The doctor reports `REFERENCE_MODEL_NOT_INSTALLED`/unavailable rather than downloading a large model automatically.

## 8. ComfyUI Status

ComfyUI is configured in the environment but its health check is unavailable. The current registered workflow is a minimal text-to-image Flux workflow and does not advertise a verified arbitrary-reference workflow for this fixture.

No reference workflow was invented or silently enabled.

## 9. Other Existing Provider Status

Automatic1111, Hugging Face image, Stability, DeepAI, Replicate, and retrieval providers remain provider-neutral alternatives in the existing registry. None was both configured/reachable and verified as an arbitrary-reference identity-preserving route during this run.

Unknown/restricted commercial status remains ineligible for production reference animation.

## 10. Selected Provider

No reference-capable provider was selected. NVIDIA was selected for ordinary image generation but rejected for the reference task because capability is model/endpoint-specific.

## 11. Selected Model

For ordinary image generation the current model remains `black-forest-labs/flux.1-dev`. It is not considered reference-capable for this animation milestone.

## 12. Endpoint

The working NVIDIA route is:

`https://ai.api.nvidia.com/v1/genai/{model}`

Endpoint family:

`NVIDIA_HOSTED_BUILD_API`

The route is not treated as self-hosted NIM infer or OpenAI-compatible image editing.

## 13. Hardware/Runtime Requirements

The available local reference routes require capabilities not present in this environment:

- ComfyUI: reachable service plus a configured reference-capable workflow/model
- Diffusers: Python worker plus installed reference model/adapter and suitable hardware
- NVIDIA hosted: current route is reachable but lacks arbitrary custom-reference support

No large model was downloaded automatically.

## 14. License Status

The existing NVIDIA registration reports commercial status `allowed` for hosted image generation, but that does not create reference capability. ComfyUI/Diffusers remain unknown/unverified for production licensing in the current registration. No reference animation asset was promoted, so no new commercial claim was made.

## 15. Reference Probe

Added:

```powershell
pnpm providers:reference:probe
```

The probe loads the approved player reference, checks source existence, evaluates configured providers through the existing registry/health path, and writes:

`player-reference-probe.json`

The current result is `REFERENCE_CAPABILITY_UNAVAILABLE`.

## 16. Reference Probe QA

The probe correctly stops before making a fake identity transformation because no eligible provider advertises arbitrary custom-reference editing. It records the source path and provider statuses but does not produce a false output image or VLM score.

## 17. Generation Architecture

The existing intended architecture remains:

```text
approved reference
 -> identity provider capability check
 -> reference-conditioned pose request
 -> normalized output
 -> technical QA
 -> identity/animation QA
 -> approval
 -> Godot integration
```

No second router or animation provider stack was introduced. The animation stage is guarded by reference capability readiness.

## 18. Base/Idle

No new base/idle animation was generated. The approved canonical reference remains intact and is the only accepted source for future identity-preserving animation.

## 19. Run

Not generated. Prompt-only or procedural run output would not prove identity preservation and was intentionally refused.

## 20. Attack

Not generated. The existing AssetPipeline can derive attack sheets, but this milestone does not promote independently derived/procedural attack content as reference-preserving production output.

## 21. Hurt

Not generated. The family remains review-required.

## 22. Death

Not generated. The family remains review-required.

## 23. Optional Movement Members

Jump, fall, land, dash, wall-slide, and wall-jump are not generated in this milestone. Existing procedural pose paths remain available for prototype/runtime fallback only and are not considered production family members.

## 24. Frame Counts

No new reference-conditioned frame set exists. Future frame counts must come from the existing animation manifest and runtime semantics, not a universal hardcoded count.

## 25. Animation Timing

No new timing data was introduced. Existing animation manifests remain the runtime source of truth for loop/non-loop/FPS behavior.

## 26. Normalization

Existing PNG validation, pixel processing, frame compilation, and identity-pack normalization remain available. No raw provider pose was produced in this run, so no new normalized animation derivatives were created.

## 27. Anchor/Pivot Contract

The previously deferred player feet/pivot/body-center/weapon-extent contract remains incomplete. It is intentionally not bypassed by generating procedural sheets.

## 28. Jitter Metrics

No new animation frames were available for jitter measurement. Anchor and scale drift metrics remain a required next-stage gate.

## 29. Identity QA

`VLM_IDENTITY_QA: NOT_RUN` because no reference-conditioned output exists to compare against the canonical source. No identity score was fabricated.

## 30. Pairwise Consistency

No reference-to-run/attack/hurt/death comparisons were possible. Existing identity provider and visual critique interfaces remain ready for a future validated route.

## 31. VLM QA

Not run for animation because no animation output exists. Existing NVIDIA vision/VLM adapters remain optional and provider-neutral.

## 32. Embedding QA

Not run. No existing reachable image-embedding route was available for this reference task, and no new embedding platform was added.

## 33. Native-Scale QA

The canonical reference itself passed prior technical/visual candidate QA, but native-scale animation-family review was not run. No animation family is approved.

## 34. Contact Sheets

No new animation contact sheets were produced. Existing canonical/reference and prior runtime evidence remain preserved. The next successful provider run must produce bounded run/attack/hurt/death/family sheets.

## 35. Desktop Player Inspector

No desktop redesign was made. Existing asset gallery, manual asset generation, Visual Review, history, and restore surfaces remain available. A focused player-family animation inspector remains a future requirement.

## 36. Variant/Approval Workflow

Existing candidate/asset history supports bounded variants and restore. This milestone adds no fake approval operation for missing animation members. The approved canonical reference remains the active source; animation approval cannot occur before reference-capable output exists.

## 37. History/Lineage

The approved reference, candidate artifacts, identity pack, prompt/model/seed metadata, and previous versions remain preserved. No procedural derivative was promoted or used to overwrite the canonical source.

## 38. Repair Attempts

No animation repair attempts were made because the first prerequisite, reference-capable provider readiness, failed. This avoids consuming retries on an unsupported capability.

## 39. Provider Fallbacks

Observed reference-task fallback order:

1. NVIDIA hosted FLUX.1-dev: healthy for generation, not reference-capable
2. ComfyUI: unavailable/reference model not installed
3. Diffusers: unavailable/reference model not installed
4. procedural pose fallback: explicitly refused for production animation
5. result: `REFERENCE_CAPABILITY_UNAVAILABLE`

## 40. Licensing

No new animation asset was classified production-ready. Existing provider license metadata remains unchanged and unknown/restricted paths remain blocked for production approval.

## 41. Godot Integration

No new animation sheets were integrated into Godot. The approved canonical reference was preserved and active runtime animations/collision were not changed.

## 42. Runtime Playback

No new animation playback test was run because no approved animation family exists. Existing runtime playback remains healthy with the prior generated fixture.

## 43. Runtime Regression

The baseline runtime path remains intact:

- `pnpm smoke:godot`: `RUNTIME_VALIDATED`
- screenshot capture: `PASS`
- no procedural animation was promoted into the production family

## 44. Player Family Certification

Current status:

```text
Canonical Reference: PLAYER_REFERENCE_APPROVED
Reference Provider: REFERENCE_CAPABILITY_UNAVAILABLE
Animation Members: NOT_GENERATED
Identity QA: NOT_RUN
Anchor QA: NOT_RUN
Native-Scale QA: NOT_RUN
Player Family: FAMILY_REVIEW_REQUIRED
```

## 45. Whole-Project Visual Status

Whole-project status remains `VISUAL_DEGRADED`. Runtime remains `RUNTIME_VALIDATED`. No family-level false promotion occurred.

## 46. Before/After Evidence

No after-animation evidence exists because no reference-capable provider was available. The canonical reference and prior candidate artifacts remain the before/reference evidence set.

## 47. Test Results

The required baseline remained green before the reference audit. Focused reference/identity tests also pass.

The latest full suite observed during this milestone completed with:

- 118 test files passed
- 630 tests passed

The default test suite remains offline-capable and does not require NVIDIA credentials.

## 48. Build Results

- `pnpm install --frozen-lockfile`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS
- `pnpm build`: PASS
- `pnpm providers:image:doctor`: PASS
- `pnpm providers:reference:doctor`: expected nonzero, no eligible reference route
- `pnpm providers:reference:probe`: expected nonzero, `REFERENCE_CAPABILITY_UNAVAILABLE`
- `pnpm smoke:godot`: PASS, `RUNTIME_VALIDATED`
- `pnpm validate`: PASS

## 49. Files Changed

Reference-capability changes:

- `packages/assets/src/identity/reference-capabilities.ts`
- `packages/assets/src/index.ts`
- `apps/cli/src/commands/image-production.ts`
- `METROFORGE_REFERENCE_CAPABLE_PLAYER_ANIMATION_REPORT.md`

Existing unrelated worktree changes and the approved canonical reference were preserved. `Forged-cursor-desktop` was not modified.

## 50. Commands Run

From `E:\Projects\MetroForge\Forged`:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm providers:image:doctor
pnpm providers:nvidia:image:probe
pnpm providers:reference:doctor
pnpm providers:reference:probe --project GeneratedGames/metroforge-smoke-metroidvania
pnpm smoke:godot
pnpm validate
```

## 51. Remaining P0

- Make one existing provider/model/endpoint genuinely arbitrary-reference capable and reachable without silently downloading unapproved large models.
- Run a successful reference probe before generating any production animation members.

## 52. Remaining P1

- Add a local Diffusers reference workflow/model after license/hardware approval, or configure a ComfyUI img2img/IP-Adapter workflow.
- Add provider-specific reference invocation validation and response QA.
- Generate run/attack/hurt/death from the approved reference only after the probe succeeds.
- Add anchor/jitter metrics, contact sheets, native-scale QA, and Godot playback validation.
- Add focused player-family animation inspector and active-version operations.

## 53. Recommended Next Milestone

**Reference Provider Enablement**: configure and validate one existing arbitrary-reference-capable route, preferably a licensed local Diffusers/ComfyUI workflow with explicit hardware/model requirements, then rerun `providers:reference:probe` before beginning player animation members.

# REFERENCE-CAPABLE PLAYER ANIMATION FAMILY PARTIAL
