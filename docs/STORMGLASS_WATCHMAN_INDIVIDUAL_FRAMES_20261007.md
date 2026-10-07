# Isolated Watchman walking source

A new individual walking contact pose was generated with the built-in image tool
from the preserved Watchman source. Identity uses the same navy/brass armor and
cyan visor. Trailing cloth is behind the body and the sword points forward.
This source is a single cutout rather than a packed strip, so it introduces no
neighboring animation cell. Native alignment and temporal motion remain untested.

Untouched copied output:
`E:/MetroForgeData/Development/stormglass-watchman-individual-frames-20261007/watchman-walk-contact-right-v1.png`.
RGBA size: 1254×1254. SHA256:
`b8d4f0f66f869f10cf5f14bb3024cebadffb4df82fc455171e97fb375609e608`.
Visible-alpha (≥18) margins: left 361, top 231, right 215, bottom 180 pixels.
Full-alpha (≥1) margins: 89,21,44,34. Faint alpha extends beyond the main silhouette,
so future normalization must preserve the source and inspect both thresholds.

The first copy selected an older sheet from the shared built-in output folder.
That mistake is retained as `wrong-selection-older-sheet.png` and its audit.
The correct copy uses the exact new tool-output filename prefix `exec-56307ab2`.
No source raster was edited, thresholded, resized or packed. Originals remain
recoverable. This is built-in generation, not local NVIDIA inference; the source
has not replaced production game assets and remains draft.

## Passing-pose continuation

The first opposite-contact attempt retained substantially similar leg positions
and was not accepted as that phase. Its untouched output is retained as
`watchman-opposite-contact-unaccepted-v1.png`. A second request explicitly removed
the wide stance, placed the supporting foot beneath the hips and raised the other
knee. The resulting `watchman-walk-passing-right-v1.png` is visibly distinct while
keeping cloth behind and sword forward. Both new sources and all transparency
bounds/hashes are in `individual-frame-audit.json`. This is two draft usable source
poses, not an approved or normalized walk cycle; opposite contact, intervening
phases, coherent foot anchors and native temporal review remain open.

## Native independent-texture review

A standalone Godot preview draws contact and passing at one shared scale
(96/843), aligning their measured visible-alpha bottom anchors to y=224.
Both untouched source textures retain 1254×1254 dimensions; terminal exit was
zero and native alignment assertions passed. The capture
`native-preview/qa/poses.png` was inspected. This uses independent textures and
runtime transforms, with no raster thresholding, resizing or sheet packing.
Source art remains draft; a continuous walk cycle and native gameplay admission
are not established by the two-pose comparison.

An opposite-contact v2 candidate changes foreground knee/shin prominence and
is retained as `watchman-walk-opposite-contact-right-v2.png` (SHA256
`725120224e518c7175edecffa0725a4f3ab4acbb90de192fd865558a47a26f18`). Visible
alpha bounds are 362,233,1038,1075. The three-pose native comparison uses the same
scale and bottom anchors 1074,1078,1075. Alignment assertions and terminal exit
zero passed after importing the newly added PNG. The initial missing-import
failure was stopped and preserved. Previous two-pose capture/proof are retained
in `native-preview/qa/two-pose-preview.png` and `two-pose-proof.json`.
The new three-pose capture was inspected. Contact B remains a candidate phase;
no temporal motion, human animation approval or production admission is claimed.

## Independent-texture motion probe

`native-motion-v1` played contact A, passing, contact B, passing at four entries
per second for a bounded 135 physics ticks. All four entries were observed;
per-pose bottom anchors remained at y=224. Each SpriteFrames entry references
an entire 1254×1254 source texture rather than an atlas cell. Thus no neighboring
sheet cell exists in this probe. Terminal exit was zero, with native proof and
four captures under its `qa` directory. The source PNGs were not modified.

This is a technical playback path using three draft poses, with passing repeated
as an explicitly incomplete gait. It must not count as a completed walking cycle,
acceptable timing, source-pixel artifact removal or production-game admission.
More anatomical phases and visual temporal review are still required.

A down/weight-bearing source adds flexed knees and a lower torso, retained as
`watchman-walk-down-right-v1.png`, SHA256
`1ee158f7e194b744609aad431171fc1cfdcca0eb08987ad68aced784a85f26d5`.
Visible-alpha bounds are 355,279,1074,1078; the 1254×1254 RGBA original is untouched.
`native-preview-four-v1` compares contact A, down, passing and contact B at the
same scale, with bottom anchors 1074,1078,1078,1075. An initial fixture parse error
from inferred array-element typing was stopped and preserved; explicit float
typing corrected it. Native retry exited zero and its four-pose capture was
inspected. Lower down-pose height is intentional gait compression, not per-frame
resizing. These remain draft source phases without a finished temporal cycle.

The rising/heel-lift source `watchman-walk-up-right-v1.png` adds an airborne
forward boot and raised supporting heel. RGBA size remains 1254×1254, visible
bounds 365,230,1047,1077, SHA256
`88bd11c4bdb9c2751fa0cbc36b20a46272612467d6f8fe9acca66ae812a0f4e6`.
`native-motion-v2` plays five independent textures in order: contact A, down,
passing, up, contact B. Five entries were observed and their measured ground
anchors remained aligned. Native exit zero and `qa/proof.json` passed; the up
capture was inspected. Previous source and motion candidates remain preserved.
This is a five-pose technical preview, with the second gait half still incomplete
and no finished walk-cycle or game admission acceptance.

The second-half down pose is preserved as
`watchman-walk-opposite-down-right-v1.png`. `source-poses-six.json` inventories
six draft phases with original-byte hashes, three alpha thresholds and measured
bottom anchors. The remaining requested source phases are opposite passing and
opposite up. The sixth source has not yet joined a native temporal run; no
completion or visual acceptance claim follows from its generated image alone.

The remaining opposite passing/up candidates are now preserved. The source
inventory `source-poses-eight.json` records eight distinct hashes, untouched
1254×1254 canvases and visible bottom anchors
1074,1078,1078,1077,1075,1080,1076,1074. `native-motion-v3` plays all eight
independent textures at eight entries per second with shared scale and those
anchors. This supplies the complete requested phase inventory but does not,
by itself, establish coherent anatomy, satisfactory timing or finished motion.
Native playback results and captures are retained under that candidate's `qa`.
No production game assets have been replaced.

`native-motion-video-v1` records the eight-phase sequence with Godot Movie Maker,
preserving previous previews and source PNGs. Its independent-texture playback
and ground alignment checks passed. `visor-drift-audit.json` estimates roughly
6.05 native pixels of horizontal cyan-visor drift at the shared 96px-height
scale, concentrated in down phases. This is an unresolved source/anchor
consistency issue, despite passing ground alignment. The estimate is a
color-landmark measurement, not skeletal validation. The full set remains
unadmitted and requires correction/review; no finished walk quality is claimed.

`native-motion-aligned-v1` tests per-frame horizontal presentation anchors from
the measured visor centroids, alongside the existing bottom anchors. The original
PNG sources and raw recording remain unchanged. Native recording/playback exited
zero. Read-only pixel measurement of the eight rendered captures found visor-X
range reduced from 7.0 pixels in the raw recording to 1.1 pixels in the corrected
candidate (nearest-pixel sampling differs from the source-scale estimate).
`raster-comparison.json` records every measured frame and verifies all original
source hashes. This is technical landmark stabilization, not proof of coherent
limb motion, grounded foot trajectories or complete walk-cycle quality. Both
videos are preserved and no game asset admission has occurred.
