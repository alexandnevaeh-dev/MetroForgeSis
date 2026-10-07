# Architecture module admission and lookup

Stormglass kit admission now checks PNG header dimensions and hashes, atlas
rectangles, non-overlapping sample regions, unique safe role names, positive
opaque bounds contained within each region, bottom-center anchors, and clipped
sampling. Optional older manifest size metadata remains supported; when present
it must match the actual PNG. Source pixels are not resampled or modified.

Rooms must provide the modules used by the native renderer: walls, floor
courses, columns, lighting, door/rune states, threshold trim, and configured
windows and props. The assembler warns when the intended room kit cannot be
admitted and fallback decoration is active. Native lookup also warns once per
missing role rather than silently omitting every request for that module.

All three shipped kits passed sampling checks. Eight malformed-manifest
variants and an invalid image header were rejected. Actual 43-room graph
integration admitted the complete kit and rejected a copied kit with its floor
module removed, without writing an active room-kit configuration. The generation
build passed. A native Godot lookup test passed missing-module null handling,
warning deduplication, and reuse of a clipped floor-course AtlasTexture.

Evidence, isolated fixtures, original runtime backup, and native logs:
`E:/MetroForgeData/Development/stormglass-kit-admission-20261006`.
This validates module admission and diagnostics, not finished artwork or full
campaign acceptance. The broader Stormglass runtime/presentation failures remain.
