# Provenance — visual reference & asset-template library

**This entire library (images, schema, JSON templates, integration code) is the product of an
AI-delegated authoring/extraction pass by Claude Code, reviewer identity
`claude-code:delegated-visual-qa-2026-09-07`. It is not the user's own personal visual sign-off.**
No `APPROVE` decision has been recorded against any of it in the repository's real QA history
(`packages/generation/src/asset-qa.ts`'s `writeQaReviewHistory`/`promoteAssetThroughQa`); it should
be treated as `QA_REVIEW` / human-review-pending, matching the same disclosure convention used for
every prior Foundry V3 pack revision (`test-packs/metroforge-foundry-v3/manifest.json`,
`docs/audit/MODERN_COHESION_TEST_PROJECT.md`'s Tenth–Thirteenth sessions).

## What is reused vs. newly authored

| Content | Status |
|---|---|
| Player idle/run/attack/hurt/death frames | Reused byte-for-byte from the QA-approved `test-packs/metroforge-foundry-v3/characters/player/*.png` (reviewer `claude-code:delegated-visual-qa-2026-09-06-r2`, `PRODUCTION_READY`). |
| Player jump/fall poses | **Newly synthesized** for this reference guide only — a squash-stretch of the real idle frame with motion-line annotation. Not a compiled animation clip; disclosed inline on the pose-guide image itself. |
| Melee / ranged enemy reference | Reused byte-for-byte from the accepted pack. |
| Flying / armored-heavy enemy archetypes | **Newly authored** this session, using the same construction technique (flat/beveled polygon geometry, `poly()`/`limb()` helpers modeled on `build_pack.py`) and the same locked palette roles. Not yet visually reviewed against the repository's real QA gates — `QA_REVIEW`. |
| Boss reference (scale/weak-point/attack phases/death) | Reused byte-for-byte from the accepted pack; weak-point callout and scale annotation are new overlay graphics on top of the real frames. |
| Foundry biome terrain/props/backgrounds | Re-authored at the same palette/tile-size as the accepted pack for kit completeness (explicit floor/wall/ceiling/platform/corner/transition role set); not a byte-identical crop of the accepted `terrain.png`/`backdrop.png`/props sheets. |
| Flooded-utility and overgrown-reactor biome terrain/props/backgrounds/traversal | **Newly authored** this session. `QA_REVIEW`. |
| `visual-constitution.json` | Extracted and generalized from the accepted pack's `VISUAL_SPEC.md`; the palette/rule content is not new creative direction. |

## Review status

Every image in this library carries a `QA_REVIEW` / `productionReady: false` status by omission —
none has been through `buildAutomatedQaEvaluation`/`createQaReviewRecord`/`promoteAssetThroughQa`
with an `APPROVE` decision. Reviewer-identity enforcement (distinguishing AI-delegated review from
the user's own personal approval in the schema itself) remains the same documented, unimplemented
follow-up noted in every prior session of this project — not fixed here, and not blocking this
milestone, per the standing instruction to keep it a separately documented follow-up.

Do not represent any image or template in this library as carrying the user's personal visual
approval unless the user has actually reviewed it and a real review record with their identity has
been written.
