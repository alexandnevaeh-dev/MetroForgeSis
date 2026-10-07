# Canopy terrain v3 — 2026-10-07

The dark square patches were TILE_WALL collision cells painted as flat grass.
Terrain v3 gives them connected hedge/root barrier faces, with boundary outlines
and a short root front face. Native rendering selects sixteen wall adjacency
masks only when the atlas declares them. Existing v2/generic terrain keeps its
prior selection logic. No collision construction, walkability or terrain values
were changed.

The original canopyTerrainV2 API remains byte-identical, SHA256
fec49cab6c7dc0fa5693b6009d2ec13cc99ad8b01db770fbe4da0a48fc98cd11.
The new canopyTerrainV3 API extends the atlas to256x352 and82roles, SHA256
07c3cafc05a0aa05391c7891e8d49db0bf4f55523d057dae84b6e25984b1dc55.
Fresh woodland generation uses v3 and retains draft maturity, unscored visual
critique and productionAllowed=false. Existing user projects were not migrated.

Five broader asset-pipeline tests passed, including legacy atlas preservation,
role bounds, landmark anchors, genre/style isolation and actual offline asset
admission. The stale gold-hero receipt failed as expected after the coral palette
revision; the earlier log remains retained. Its new exact hash matches the
separately validated coral family. Fresh pipeline generation passed seven checks
with providers disabled, schema-validated DNA, and runtime/export separately
scoped. Tile arrays and collision rectangles match the previous five-area export.

Three native overworld checks passed: terrain layer, hedge-role rendering at all
wall cells, and collision at every wall-cell center. The captured barrier artwork
still needs visual refinement/approval. Full navigation regression is running and
must be inspected before claiming complete route acceptance.

Evidence: `E:/MetroForgeData/Development/topdown-terrain-v3-20261007`.
Read `geometry-preservation.json`, `environment-tests-updated-receipt.log`,
`generation/generation-proof.json`, and `native.log`. Project:
`games/canopy-generator-proof-1791364378937`; native hedge proof/capture are
`qa/hedges/proof.json` and `qa/hedges/overworld.png`. This is CPU procedural art
and native GPU rendering, not local NVIDIA image inference or production approval.

The rendered full route subsequently passed all eight checks, four transitions
and boss victory with twenty attack inputs, seventy damage taken, thirty health
remaining and zero deaths. No harness health grant occurred. Actual checkpoint
events were empty and the ordinary victory autosave was recorded separately.
Evidence: `journey.log`, `journey-summary.json`, and the project's
`qa/topdown-playtest/proof.json` / `final.png`. Updated wall-role/dimension
assertions also passed the focused test in `wall-role-test.log`.
