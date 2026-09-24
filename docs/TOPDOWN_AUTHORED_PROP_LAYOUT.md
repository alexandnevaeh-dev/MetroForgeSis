# Authored top-down prop layouts

The existing OverworldManager._place_prop accepts an optional fourth dictionary argument. Omission retains legacy placement exactly. Automatic decorative scatter still uses the legacy path; authored doorway art is not registered or auto-placed.

AuthoredPropLayout.gd validates and constructs the optional layout:

```json
{"version":1,"sourceSize":[32,32],"anchorPx":[16,20],"displayScale":0.5,"collisionRectsPx":[{"x":-12,"y":-3,"width":4,"height":6},{"x":8,"y":-3,"width":4,"height":6}]}
```

sourceSize must match the texture. anchorPx measures from its top-left corner. Collision rectangles are relative to the ground anchor in source-image pixels. Display scale applies to art and collision together. An empty collision array intentionally means decorative-only. Malformed authored data is rejected, not silently converted into a central collider.

Native Godot 4.6 test evidence: E:/Metroforge/Recovery-Audit/authored-prop-layout-v1/result.json. Validated anchor, scale, two actual physics footprints, clear center, malformed size/scale/rectangle rejection, and explicit no-collision layout. This is a helper-level native test, not a complete room-generation or desktop-editor test.

Outstanding: editor persistence for authored prop records, placement clearance, non-axis-aligned pillar footprint support if needed, asset camera/scale consistency and under-arch occlusion. A single Y-sorted whole-arch sprite is not proven sufficient. Do not register the current gateway as production-ready artwork.
