# Opt-in independent source frames

The Godot side-view AnimatedAssetSprite metadata loader accepts `sourceFrames`
as an alternative to `sourceSheet`. Each frame names a relative `assets/*.png`
path, accompanied by a matching `sourceRegions` rectangle, `frameFootAnchors`
point, declared `frameCount` and finite positive `displayScale`. Paths with parent
traversal, absolute paths, backslashes or colon separators are rejected. A clip
cannot declare both formats. Regions must fit their own source texture.

All frame textures and offsets are prepared before replacing the animation.
Failure returns without partial replacement or timing mutation. FPS must be
finite and positive; loop values must be booleans. JSON numeric counts are
accepted as integer-valued floats because Godot's JSON parser returns floats.
Existing single-sheet metadata retains its loading path. Each prepared frame
uses filter-clipped AtlasTexture sampling from its own source PNG.

Native validation passed seventeen checks with terminal exit zero, including
eight independent Watchman source textures, exact clipped regions, per-frame
anchors, ten malformed-input rejection cases, legacy sheet compatibility and
three actual sidecar timing-preservation cases. Evidence and original loader
backup are under
`E:/MetroForgeData/Development/stormglass-independent-frame-loader-20261007`.
The repeated negative cases use generated fixture metadata, not user assets.

This is a Godot side-view loader capability. It does not admit the draft Watchman
set, establish gait quality, export equivalent Unity/Unreal behavior, or modify
top-down animation handling. Asset-pipeline admission and full actor-family
validation remain separate work.

## Real enemy lifecycle validation

EnemyController previously assigned raw family scale after the sprite's ready
method applied clip scale. It now calls `set_base_presentation_scale` when
available, preserving base family scale × clip display scale on startup and
subsequent frame/animation changes. The method rejects nonfinite/nonpositive
base scale and preserves facing. Plain legacy sprites retain direct assignment.

An isolated actual Enemy scene with a draft independent-frame idle/walk sidecar
passed eleven native lifecycle checks: eight frames, idle source, composed scale,
per-frame offsets, flip_h, negative-scale facing, legacy attack scale restoration
and invalid-base rejection. The initial flip observer resumed before sprite
processing and failed; its log/proof are retained. Waiting for a complete process
tick corrected that observer, and the retry exited zero. AI is disabled and walk
velocity is supplied in this fixture. It is not natural combat or campaign proof.
Existing physics, health, attack timing and damage are unchanged. Full campaign
regression and cross-engine presentation parity remain open.

## Complete legacy campaign regression

The rendered `campaign-v1` candidate completed all 34 planned transitions, six
abilities, four bosses and victory in 322.047 seconds, with 110 attacks, 160
damage taken and zero deaths. Terminal exit was zero without native/script
errors. Comparison of 1891 prior-export inputs confirms exactly two changes:
AnimatedAssetSprite.gd and EnemyController.gd. Existing game geometry, art and
data are unchanged; no draft Watchman art was installed in this regression.
`campaign-v1/completion.json` records the final result and scope. This establishes
legacy campaign behavior with the loader/base-scale changes, not draft animation
quality, actual-app generation after this change or Unity/Unreal parity.

Actual desktop generation report `1791400120982` subsequently emitted the updated
loader/controller and passed archive export, while broader artwork/presentation
validation remained failed at 255/382. The finished export is copied unchanged
to `fresh-app-campaign-v1` for a complete native route test. No draft frame art or
QA gameplay patch is installed. Terminal journey proof and hash reconciliation
remain pending; the earlier patched-candidate pass is preserved separately.

The unchanged fresh-app campaign subsequently passed: 34/34 transitions, six
abilities, four bosses, 113 attacks, 180 damage taken, zero deaths and victory
after 319.922 seconds. Native terminal exit was zero without native/script
errors. Final hash comparison verifies all 1892 copied project inputs unchanged.
`fresh-app-campaign-v1/completion.json` records results and scope. The canonical
Git index hash remained unchanged. This confirms current loader/controller
behavior in the actual app export while preserving separate failed broader
art/presentation gates. Draft Watchman gait and cross-engine parity remain open.

Before publication, the previously unpublished StormglassArrivalStability fixture
also passed 21 native checks across three Echo descent/return cycles and
five-second idle arrival observations. It exited zero without native/script
errors; the existing ObjectDB teardown warning remains. This fixture explicitly
removes encounters after one initial room setup and is route/arrival evidence,
not combat or earned progression. Its E:-resident proof path and scope are in
`arrival-stability/completion.json` under the loader evidence directory.
