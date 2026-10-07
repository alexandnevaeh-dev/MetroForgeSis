# Stormglass masonry development evidence — 2026-10-06

The room inspector now reads per-room kit metadata for native Stormglass
projects with complete referenced manifests/atlases and an existing room scene.
It displays wall material and furnishing roles rather than offering panorama
controls that the runtime kit hides. Missing, unsafe, malformed, and unrelated
kit data retain fallback behavior. Four focused inspector/geometry checks and
the desktop build passed. Actual app inspection confirmed the architecture
section, absence of ineffective Apply background controls, preserved geometry,
and unchanged room records. The canvas remains a geometry preview; exact
themed-asset preview and editable room-kit composition remain unfinished.

The editor now previews 32 shallow treads and a 40px handrail on each compiled
stair flight, matching the native renderer's geometric detail. Three focused
preview tests and the desktop build passed. Actual app inspection of room_002
found seven flight polygons, 224 treads, seven handrails, and seven native
collision polygons. The middle doorway remained clipped correctly and room
records stayed byte-for-byte unchanged. Capture and proof:
`E:/MetroForgeData/Development/stormglass-masonry-20261006-v1/editor-1791335868045`.
This is editor geometry parity; its generic background is not native themed-kit
art parity or finished presentation.

The old themed kit filled rectangular canvases with repeating façade art and only
dressed floors/landings. The new opening experiment adds actual solid roof masses
and piers, with connected low hall openings. Collision rectangles and brick faces
share dimensions. Background art clips to the room rectangle; façade/window/column
scales and prop height follow the enclosed chamber height. Camera framing follows
the reachable masonry band rather than the unused canvas.

The TypeScript Godot package build passed. An isolated overlay of the actual
app-generated campaign passed 19 native Godot checks, including actual player
walking through the first connecting hall, player-shape roof blocking, hall
clearance, unused-space collision and collision-matched brick surfaces.

Evidence and recoverable before-images:
`E:/MetroForgeData/Development/stormglass-masonry-20261006-v1`.
The final log is `native-traversal.log`; images are beneath the E:-resident
`appdata/Godot/app_userdata/.../qa/masonry` directory.

This is an opening-area collision/presentation experiment, not completion of all
43 themed rooms. Stair corridors, backroom-loop traversal with this geometry,
editor/render parity, fresh real-app generation and full gameplay/art acceptance
remain required. The older floating stair layout is still present and is not
accepted as a finished architectural stair corridor.

## Shared-world doorway correction

Portal anchors now use overlapping world-space room edges. The shrine door enters
the tall stairwell at its shared middle floor (704px local), instead of moving the
player to the shaft bottom. Side walls are split at the actual doorway elevation;
walls below the opening remain solid. The gallery descent and its floor opening
share the stairwell's world-space X coordinate. Arrival positions follow the
reciprocal authored portal. Unknown external rooms retain their existing behavior.
The upper landing was widened to support the real vertical arrival position.

Four focused shared-world geometry tests passed. The isolated compiled campaign
passed ten native checks covering actual shrine/stairwell return movement, middle
landing arrival, doorway wall collision, gallery walk-and-fall descent and safe
upper-landing arrival. See `spatial-vertical-native.log` and
`spatial-recompile.json` under the evidence root. Fresh app generation and broader
campaign traversal remain outstanding.

## Editor geometry preview

Published room records now carry compiler-derived `masonryRects`. Room and
tile-paint previews consume the same records, preserve middle wall openings and
clip background artwork to the room dimensions. Preview data rejects nonfinite
or out-of-bounds rectangles. This is an authoring geometry preview, not a native
artwork screenshot. Generation and desktop TypeScript checks passed; two focused
rendering tests passed. Fresh real-app editor inspection remains outstanding.

## Continuous switchback staircase

The new authored stair plan has eight landings and seven inclined stone flights.
Landings retain the shrine floor at 704px and the vertical entry balcony at 128px.
The runtime selects the active overlapping flight for player collision; ordinary
CharacterBody2D movement handles ascent, and Down plus horizontal movement selects
descent. No runtime stair code assigns player position.

The isolated campaign was explicitly migrated after backing up its previous
painted records to `rooms.before-stair-migration.json`. Canonical recompilation
preserves incompatible painted landings and omits the new flights instead of
mixing two layouts. Fresh generation owns the complete new stair plan.

Native ascent/descent passed all 14 flight checks. A later run also verified a
544px scrolling camera view, giving 15 checks; all ten spatial-door checks passed
against the migrated staircase. Logs: `stair-camera-walk.log` and
`stair-port-regression.log`. Fourteen focused collision-parser, preview and stair
plan tests passed. Editor collision previews now retain polygon edges instead of
painting their enclosing rectangles. New stone tread and handrail drawing remains
subject to native visual review. Finished room artwork and complete campaign
acceptance remain outstanding.

The updated desktop build passed. Real-app editor verification in
`editor-1791317937624` confirmed seven rendered stair polygons, seven matching
native collision polygons, the middle doorway wall dimensions, selected-room
identity and unchanged project records. The main Git index hash remains the
preserved value recorded in the Platformer evidence document.

Native tread/handrail presentation loaded without script errors and passed all ten
spatial-door checks (`stair-treads-native.log`). The captured middle landing is
under `stair-treads-appdata/.../qa/spatial-ports/middle-landing.png`. Treads now read
as steps, but their procedural surface treatment still needs an artistic pass to
match the detailed façade kit. This capture is not finished-art acceptance.
# Room-sized masonry update — 2026-10-06

The themed room renderer now places a recessed brick backwall inside the same
exact room clip as its facade modules and props. It uses the room's wall tint.
Solid masonry has lower-edge shadows and sparse deterministic cracks; stair
flights have stone block faces, wear, and trim with a palette derived from the
room's columns. AtlasTexture resources are reused per role within a room kit.
These visual changes do not modify collision or move the player.

Native isolated-candidate evidence at
`E:/MetroForgeData/Development/stormglass-backwall-20261006`:
all 43 themed rooms passed 1241 room-bounds and surface checks across 205 floor
and platform surfaces; ten actual connected-portal checks passed; seven stair
ascents, seven descents, and the camera-height check passed. GPU captures were
inspected. Enemy animation fallback and ObjectDB exit warnings remain. Stair
art remains visibly less detailed than the Gothic facade modules. These results
do not establish full campaign combat, fresh app generation parity, finished
artwork, or visual approval. Existing source snapshots remain recoverable;
GitHub publication snapshots need refreshing before upload.
