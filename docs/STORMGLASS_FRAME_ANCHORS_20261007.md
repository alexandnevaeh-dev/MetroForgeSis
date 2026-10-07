# Native per-frame anchor validation — 2026-10-07

AnimatedAssetSprite now accepts optional `frameFootAnchors` in source-region metadata. Each frame retains its original source pixels and clipped atlas region while its measured foot position stays attached to the actor origin. Facing changes mirror the horizontal presentation offset. Existing scalar `footAnchorY` metadata and ordinary strips retain their presentation.

Anchor arrays must match the source-region count, contain finite numeric coordinates, and fit inside each frame. Validation completes before replacing the existing animation frames.

Native Godot 4.6 OpenGL testing passed 21 checks: sixteen raster measurements across eight poses and both directions, rejection of a malformed anchor count, live playback of all eight frame anchors, automatic facing adjustment, legacy scalar anchor compatibility, and restoration of ordinary-strip presentation. Every rendered foot bottom measured 144 pixels; horizontal foot centers stayed within half a pixel of 80.

Evidence: `E:/MetroForgeData/Development/watchman-anchor-validation-20261007/project/proof.json`, `cadence.log`, and `project/preview.png`. The reproducible scene script is `tests/godot/WatchmanAnchorValidation.gd`; it expects the isolated project plan and review sheet from that evidence directory.

This is an isolated native sprite-rendering test, without the full game contact shader. The sheet remains QA review art, with no production admission or enemy replacement. It does not establish complete walk, attack, hurt, or death animation families. Earlier source sheets and the pre-change runtime backup remain recoverable on E:.

Generation admission now validates optional per-frame anchors before exporting the cape candidate: exact count, finite numeric coordinates, two values per anchor, and bounds inside the corresponding frame. Zero-frame clips are rejected. The existing scalar-anchor cape pack still passes unchanged. The generation package compiled successfully outside the restricted environment; the restricted compile reported the previously observed unrelated test callback inference errors and its log remains retained.

Nine admission regression checks passed against isolated copies, including legacy compatibility, valid per-frame admission, malformed anchors, and empty clips. Repeat after compiling generation with `node scripts/test-stormglass-frame-anchor-admission.mjs E:/MetroForgeData/Development/<isolated-evidence-folder>`. This player-pack admission retains its existing single-row strip constraint; the multi-row watchman review plan has not been admitted as a production enemy pack.

## Runtime malformed-number protection

A further native run passed 25 checks. The loader now rejects non-finite display
scales and scalar anchors, and rejects non-numeric or non-finite source-region
coordinates before constructing atlas rectangles. Four additional regressions
verify rejection of NaN scale, infinite source coordinate, string source
coordinate and NaN frame anchor, preserving both the original frame count and
first texture. Logs are in `finite-validation.log`; the current `project/proof.json`
contains the 25-check result. Earlier 21-check logs remain preserved.
