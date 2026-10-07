# Quiet canopy foliage variants

The top-down hedge atlas now uses four compact, subdued foliage patterns for
each of its sixteen boundary masks. Native OverworldManager selects variants
deterministically by cell position, retaining v3 mask behavior for older atlases.
This removes the strong repeated diagonal highlights seen in the aqueduct
room-entry capture. Root faces and solid outlines remain readable.

The pipeline emits `ruined-canopy-v4`, 256×544 pixels, 146 role names (including
sixteen aliases to variant zero). Atlas hash:
`a8d8ce95cac6383f83701776bb9d2636f1724ff13ad3228bf90fea69930ff0d8`.
The v2 and v3 exports remain byte-identical to their preserved hashes, covered
by regression tests. Existing saved games are not migrated or overwritten.

Validation under `E:/MetroForgeData/Development/topdown-terrain-v4-20261007`:

- Asset compilation and six asset tests passed, including the real offline
  pipeline, draft-art status, role bounds and legacy atlas preservation.
- All seventeen repository TypeScript projects passed typecheck; terminal
  exit zero is recorded in `typecheck.log`.
- Fresh schema-DNA generation passed seven assembly checks. Text and image
  providers were disabled; runtime and export were explicitly separate.
- Four native rendered hedge checks passed, including collision at every solid
  cell center and exact variant/edge-mask selection.
- Full rendered Input journey passed all eight checks, four transitions,
  twenty attacks and victory. This run took no damage and finished at 100 health.
  Room-entry captures and final proof are in the generated game's
  `qa/topdown-playtest` directory. No harness healing was introduced.
- All five area's tile arrays and collision rectangles match the previous
  same-DNA v3 fixture. The first comparison accidentally used the different
  desktop DNA; its failed comparison is retained separately and superseded by
  `geometry-preservation.json`.

Source backups, sandbox compilation diagnostics and terminal logs are retained.
The canonical Git index hash remained unchanged. Artwork remains QA_REVIEW;
this is not NVIDIA image inference, fresh desktop UI acceptance or finished
artistic presentation. Room dressing and character direction art remain open.

## Actual desktop generation and rendered repeat

Fresh desktop creation report `1791378364126` completed successfully through
the real New Game UI and IPC pipeline, with 32px terrain, v4 style, sixteen
boundary masks and sixty-four variant roles. The initial verifier syntax error
stopped before launch; its failed log is retained and the corrected verifier
passed. An unchanged export copy subsequently passed all eight rendered journey
checks and all four transitions. Byte-preservation and final health are recorded
in `desktop-native-completion.json`. Five area-entry captures were produced.
The publication regression suite passed eighty tests across six files, covering
tile requests, genre isolation, canopy assets, palette, weapon gutters and room
assembly. This desktop run uses local deterministic generation; model-provider
and production-art acceptance remain separate.
