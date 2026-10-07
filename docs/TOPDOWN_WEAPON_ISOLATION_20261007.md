# Top-down canopy weapon isolation — 2026-10-07

The separate canopy actor generator clipped swords and active trails at horizontal
frame cuts in 18 of 96 hero attack poses. The 64px cell itself prevented cross-cell
writes, but cut off weapon content. The hand anchor, blade extent, outline and
active trail now fit within the cell. All 96 attack poses retain at least four
transparent horizontal pixels; no alpha threshold or source raster editing was
used. Existing generated projects and source sheets remain recoverable.

Four regression tests passed. Isolation tests cover hero/melee idle, walk, run,
attack, hurt and death across all eight facings, alongside existing casting and
animation-family contract tests. The assets package compiled successfully.

Fresh LOCAL_ONLY canopy pipeline generation passed seven checks for assembly,
terrain/role preservation, woodland layout, grounded props and draft-art status.
The design stage uses existing schema-validated DNA and explicitly disabled
providers; runtime validation/export were skipped in that pipeline check.
All eight exported attack strips match the corrected generator byte-for-byte.
This is backend generation evidence, not a fresh desktop creation or provider run.

The top-down sprite template now sets `AtlasTexture.filter_clip` for both generic
and directional strips. That candidate template change was applied separately to
the generated project with its original script backed up. Native Godot OpenGL
passed 112 checks covering eight directions, twelve poses each, 30fps/nonloop
metadata, exact atlas regions and clipped sampling. The enlarged contact sheet
shows all poses. It does not establish real-input attack damage, continuous motion,
finished eight-direction body art or visual/production approval.

Evidence: `E:/MetroForgeData/Development/topdown-weapon-isolation-20261007`.
Read `baseline.json`, `candidate.json`, `tests.log`, `exported-sheet-proof.json`,
`generation/generation-proof.json` and `native-render-corrected.log`. The fresh
project is `games/canopy-generator-proof-1791359462205`; its native proof is
`canopy-weapon-proof.json` and contact sheet is `canopy-attack-contact.png`.
An initial fixture-writing attempt failed due to the default Windows text decoder;
its missing-scene log is retained. The corrected write uses explicit UTF-8.

Artwork remains QA_REVIEW and productionAllowed=false. This change does not
replace Stormglass side-view or Platformer assets. Full top-down redesign,
untouched gameplay validation and Unity/Unreal top-down parity remain open.
