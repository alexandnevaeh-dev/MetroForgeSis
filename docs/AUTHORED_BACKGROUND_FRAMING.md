# Authored background framing

Direct Unity exports can supply `assets/backgrounds/biome_N/presentation.json` beside the biome background textures, either in `textureFiles` or already on disk. Supplied data takes precedence. The file must contain exactly these fields:

```json
{"farCameraRelative": true, "farParallax": 0.1}
```

`farCameraRelative` is a boolean. `farParallax` must be a finite number from 0 to 1. Unknown fields and invalid values fail export. With no file, existing framing behavior remains unchanged.

The shared gameplay pack records these values on each room in that biome. Unity's existing CameraBackgroundLayer fits the far image to the camera viewport, clamps movement to its overscan, and leaves collision geometry unchanged. This does not imply native Unreal support for the presentation behavior.

The existing Unity room editor can change these fields after export and saves both gameplay copies with backups. Restart the preview to apply persisted changes. Room edits do not currently rewrite the biome presentation source file; re-exporting from the old source can reset them.

Validation: 6 framing tests and 16 gameplay-pack tests pass. Fresh painted export v3 preserves the fields in root and StreamingAssets gameplay data. Native visual evidence is tracked separately in DEVELOPMENT_HANDOFF.md.
