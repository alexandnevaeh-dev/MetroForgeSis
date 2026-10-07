# Coral hero identity — 2026-10-07

The canopy hero now uses the documented warm coral coat with violet-red shadows,
soft coral highlights, cream trim and muted brass. Trailing cloth, scarf and the
collapsed death pose share that identity. Bright gold is no longer the dominant
coat color. Green hat accents preserve the woodland character identity.

All 63 generic/directional hero strips contain the coral body palette. All
63 alpha masks and dimensions are identical to the preserved earlier family;
this is a generator palette revision, not resampling or raster editing. The
24 melee/ranged/NPC/boss animation strips remain byte-for-byte unchanged. Weapon
isolation, casting and animation-family contract tests passed, and a persistent
palette regression passed. Source backups, earlier generated gold sheets and
hash receipts remain on E:.

Fresh LOCAL_ONLY pipeline generation passed seven assembly/terrain/layout/draft
checks. It starts from schema-validated DNA with providers disabled; runtime
validation and export are separate, so this is not end-to-end AI or desktop UI
acceptance. The fresh project contains current unpatched templates, including
sprite clipping and the revised playtest observer.

Native Godot OpenGL passed seven checks: actual player, coral clusters, clipped
sampling, movement, multiple walk poses, active attack and east attack clip.
Idle/walk/active-attack captures are in the project. The first fixture sampled
attack state before activation; its failed proof/captures are preserved in
`qa/coral-hero-first`. The corrected observer waits up to40physics frames for
the actual active state, without altering actor timing or damage.

Evidence: `E:/MetroForgeData/Development/topdown-coral-hero-20261007`.
Read `palette-proof.json`, `silhouette-proof.json`, `tests.log`,
`palette-test.log`, `generation/generation-proof.json`, and
`native-observed-state.log`. The fresh project is
`games/canopy-generator-proof-1791362725126`; native proof and captures are
under `qa/coral-hero`.

Artwork remains QA_REVIEW, productionAllowed=false and unapproved. Complete
purpose-built eight-direction body art, environment refinement, fresh desktop
creation, full AI/provider acceptance and cross-engine top-down campaigns remain
unfinished. Existing user projects and side-view/Platformer sets are preserved.
