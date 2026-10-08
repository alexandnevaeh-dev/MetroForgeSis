# Watchman forward attack key poses

Two new independent transparent source PNGs preserve the existing Watchman's
navy cloth, brass armor trim, steel helmet and cyan visor. Windup raises the
sword in front of the body; forward follow-through lowers it to the right.
The rear cloth remains behind the torso to the left.

Sources are outside production assets at
`E:/MetroForgeData/Development/stormglass-watchman-attack-20261007`.
The windup SHA256 is `de2392ea8713935146c881fdadcb7db193446b2549ec14f85372a4f2b48113df`.
The follow-through SHA256 is `06fd066647bfb7a72b963e4105dfefee98b29bd1a2848d02767a89cf6eb10aff`.
Both are unchanged 1254x1254 RGBA sources generated using built-in imagegen;
this is not local NVIDIA image-inference evidence.

The first contact attempt drifted in body/ground position and had only 21px
right padding. Its corrected intermediate version still approached the edge.
Both unaccepted versions remain recoverable. The selected windup/follow-through
have 154px and 93px visible-alpha right margins, respectively.

The native OpenGL review draws the two key poses and the existing walk reference
as whole independent textures at a shared 96/843 scale with measured foot
anchors. Source dimensions and ground alignment passed, the process exited
zero, and its screenshot was inspected. Source PNGs were not resized or packed
into a sprite sheet, so this review has no neighboring atlas cells to bleed.
Read-only bounds/visor measurements and hashes are in `source-keypose-audit.json`;
the rendered proof/capture are in `native-preview-v1/qa`.

This is a key-pose comparison, not a completed attack animation or production
admission. Intermediate poses, recovery, temporal continuity, contact timing,
full enemy-family art and visual acceptance remain open.

The guardian art checker also now names the actual exported final guardian
`boss_final` instead of nonexistent `boss_003`. Existing file-size requirements
and all other art checks remain unchanged. Native roster validation is tracked
separately; correcting an ID does not make inadequate art acceptable.

The isolated native roster test passed three checks: all four generated guardian
IDs are covered, `boss_final` replaces `boss_003`, and the current procedural
guardian artwork remains rejected. Import and native execution exited zero
without script errors. Evidence: `roster-game/guardian-roster-proof.json`
and `roster-completion.json` in the E: source-review directory. This invokes the
actual art-checker method against real exported files; it does not claim a
successful full art suite or finished guardian presentation.

## Swing-start source and production-loader excerpt

An additional swing-start source lowers the sword through an up-right diagonal
while preserving the planted body and rear cape. Its SHA256 is
`0f1cc594e70e32537b57c9d53a539f32b58f26c800daa860c9abd93945b47191`.
The untouched source has 62px visible-alpha right margin, more than 7px at the
native review scale. Cyan visor horizontal drift across the three attack
sources is about 1.32 source pixels. These are landmark/padding measurements,
not skeletal or complete temporal-continuity approval.

`native-attack-excerpt-v1` exercises the actual `AnimatedAssetSprite.gd` with
three independent full-source regions, measured frame foot anchors and explicit
6fps non-looping preview metadata. Eight native checks passed: exact source
isolation, clip timing/loop state, three ground anchors, all poses observed and
one-shot completion on forward follow-through. Exit status was zero and the
frame captures were inspected. Source PNGs remain unchanged and outside the
production asset catalog. This is a coarse excerpt, not a complete attack or
combat-timing admission; additional transition/contact/recovery poses are open.

The first preview fixture used a Node root for a Node2D script and failed.
Its original scene/log remain preserved; the corrected fixture passed. The
repeatable preparation script now creates the matching Node2D root.
Evidence: `motion-source-audit.json`, `motion-native-retry.log`, and
`native-attack-excerpt-v1/qa/proof.json` in the E: review directory.

## Recovery source and four-pose review

The independent recovery source SHA256 is
`c018a1d81cd4a4f48ae795ff46ee7b5c8caabf17d56c7fe485347b8cdadd6223`.
It relaxes the arms back toward guard while keeping the sword forward/right and
rear cloth left. Its source visor is about 27.7px left of the windup landmark;
the preview corrects that using a frame anchor rather than editing the PNG.
Its 48px visible-alpha right margin becomes about 5.5px at the review scale.

The four-pose production-loader review passed 13 native checks with explicit
6fps one-shot metadata: independent whole-source sampling, timing/loop state,
four horizontal/ground anchors, pose advancement and completion on recovery.
Native exit was zero. A read-only raster audit of all four captures measured
0.5px horizontal cyan-visor range after correction. All source hashes remain
unchanged. This measurement proves landmark stabilization, not skeletal
accuracy or complete temporal continuity.

The original three-pose review remains preserved. The first four-pose proof's
scope text incorrectly said three poses; the corrected fixture/proof was rerun
and the earlier proof retained. Final evidence is `motion-v2-native-final.log`,
`motion-source-audit-v2.json`, `motion-raster-audit-v2.json` and
`native-attack-excerpt-v2/qa/proof.json`. The captures were inspected.
These sources remain outside the production catalog. More intermediate/contact
poses, a settled ready pose, combat synchronization and visual approval remain
open before admission as a complete enemy animation.

## Settled ready pose and both-facing idle transition

The new ready-source SHA256 is
`9a31f8b5c902a6adbe8cdfb4874625255398c6788282873315c80d051b03d9f4`.
It maintains the planted guard, rear cloth and forward blade with an 80px
visible-alpha right margin. Runtime landmark anchors compensate source drift;
the original image is unchanged and remains outside production assets.

The five-pose preview uses this source as its last attack pose and as a matching
singleton idle. Twenty native checks passed through the actual sprite loader:
source isolation, explicit non-looping preview timing, all five poses in both
facings, their anchors, completion on ready and manual transition to idle while
retaining ground placement and facing. Exit status was zero. Read-only capture
audits measured 0.5px horizontal cyan-visor range in each facing, including the
idle transition; every source hash remains unchanged. Captures were inspected.

Evidence: `motion-source-audit-v3.json`, `motion-v3-native.log`,
`motion-raster-audit-v3.json` and `native-attack-excerpt-v3/qa/proof.json`.
The left-facing preview correctly places the weapon left and rear cape right.
The singleton idle is a matching stance, not a completed idle cycle. This
coarse five-pose excerpt still needs additional contact/transition poses,
combat synchronization, family integration and visual approval before admission.

## Contact-source study 2026-10-08

Two new unmodified built-in imagegen studies are retained on E: (`watchman-attack-contact-unaccepted-v3.png` and `watchman-attack-contact-right-v4.png`). V3 kept the planted silhouette but had only 35px visible right margin; it was not admitted. V4 shortens the forward blade for padding and remains a draft contact study. The cape stays behind the torso and there are no adjacent atlas frames. Its measured bounds and SHA256 are in the sibling JSON receipt. No native six-frame sequence or complete-family quality is claimed; production source assets and the existing five-frame proofs remain unchanged. This was built-in image generation, not local NVIDIA inference.

## Six-pose native excerpt

The padded contact V4 source is now tested between start and follow-through in an isolated six-pose excerpt through the current production AnimatedAssetSprite loader. Both facings passed 22 native checks: independent whole-source frames, authored one-shot timing, all six observed poses, declared ground/head anchors, final ready pose and matching singleton-idle transition. Import and native exit were zero without script/native errors. Read-only captures measured a maximum 0.8px horizontal cyan-visor range in each facing. All six source hashes remained unchanged.

Evidence: `motion-v4-completion.json`, `motion-source-audit-v4.json`, `motion-raster-audit-v4.json`, `motion-v4-native.log` and `native-attack-excerpt-v4/qa` under the E: attack evidence root. The initially mis-rooted empty preparation and failed import log are preserved. Native right/left contact captures were inspected: weapon faces forward and cape remains behind the body.

The blade is foreshortened in the contact study. Weapon-length consistency and motion quality remain art review work. This is still a coarse excerpt and singleton idle; full idle/walk/run/hurt/death family completion, combat contact-frame synchronization and production admission remain open. The production game assets and earlier five-pose proofs are unchanged.
