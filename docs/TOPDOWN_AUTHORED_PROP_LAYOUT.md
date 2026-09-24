# Authored top-down prop layouts

The existing OverworldManager._place_prop accepts an optional fourth dictionary argument. Omission retains legacy placement exactly. Automatic decorative scatter still uses the legacy path; authored doorway art is not registered or auto-placed.

AuthoredPropLayout.gd validates and constructs the optional layout:

```json
{"version":1,"sourceSize":[32,32],"anchorPx":[16,20],"displayScale":0.5,"collisionRectsPx":[{"x":-12,"y":-3,"width":4,"height":6},{"x":8,"y":-3,"width":4,"height":6}]}
```

sourceSize must match the texture. anchorPx measures from its top-left corner. Collision rectangles are relative to the ground anchor in source-image pixels. Display scale applies to art and collision together. An empty collision array intentionally means decorative-only. Malformed authored data is rejected, not silently converted into a central collider.

Native Godot 4.6 test evidence: E:/Metroforge/Recovery-Audit/authored-prop-layout-v1/result.json. Validated anchor, scale, two actual physics footprints, clear center, malformed size/scale/rectangle rejection, and explicit no-collision layout. This is a helper-level native test, not a complete room-generation or desktop-editor test.

Outstanding: editor persistence for authored prop records, placement clearance, non-axis-aligned pillar footprint support if needed, asset camera/scale consistency and under-arch occlusion. A single Y-sorted whole-arch sprite is not proven sufficient. Do not register the current gateway as production-ready artwork.

Optional `layers` supports 1–32 entries `{id: string, sortY: number}`. IDs must be unique; sortY is finite source-pixel ground depth relative to the shared anchor, bounded to twice the source height. Pass a dictionary of matching Texture2D objects as the third `AuthoredPropLayout.create` argument. Every layer must match sourceSize. Missing/wrong textures reject the whole prop; no silent flat fallback. Layered props use nearest sampling and nested Y sorting, preserving a shared artwork position and existing footprints. Without layers the original single-image behavior remains.

Runtime helper and OverworldManager asset loading are implemented. Each layer record additionally supplies `image`, a sibling filename beside the base texture. The loader rejects missing textures, external paths and subdirectories before adding any nodes. Saved room placement records and desktop authoring controls are not yet connected. Do not automatically register the gateway candidate.

## Saved area placements

`TopDownArea.propPlacements` is optional. Omission retains legacy automatic scatter; an explicit array replaces scatter in both overworld and dungeon areas, and `[]` means no props. Each record is `{id, image, x, y, layout}` where image is a `res://` project texture path, x/y are finite ground-anchor coordinates, and layout is the authored contract above. Runtime nodes retain `placement_id` metadata. Duplicate IDs and malformed/missing resources are skipped with warnings. The collection is limited to 512 records. Existing area loading rebuilds these nodes on room entry.

Native integration checks round-trip an area through JSON on disk, restore its layered prop and position, reject duplicates and honor an empty list. This does not prove desktop save/edit controls or collision-clearance authoring. The editor must still expose and persist these records.

## Asset placement metadata

An authored prop image at `assets/.../name.png` may have a sibling `name.prop.json` containing the layout contract. `readTopDownPropAsset` returns no placement candidate when metadata is absent. When present, it validates the layout, project containment, PNG headers, dimensions and every referenced sibling layer. This is technical placement eligibility, not visual approval or proof that arbitrary placement preserves navigation. Existing manifest maturity remains separate. The desktop asset picker still needs wiring to this reader.
