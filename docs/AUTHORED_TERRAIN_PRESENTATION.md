# Authored terrain art in Unity exports

Supply `assets/tilesets/biome_N/floor.png` (or `wall.png`) and a matching `floor.presentation.json` (or `wall.presentation.json`) through the existing texture-file assembly input. Both files are copied into the game and Unity StreamingAssets by the existing exporter.

```json
{"x":150,"y":192,"width":750,"height":125,"pixelsPerUnit":6.75,"borderLeft":0,"borderRight":0,"borderTop":20,"borderBottom":0,"smoothFiltering":true}
```

Crop coordinates are image pixels measured from the bottom-left. Width and height must be positive and fit within the image; scale must be positive. Borders must be nonnegative. Left plus right must be less than crop width; top plus bottom must be less than crop height. Top and bottom borders keep surface trim from repeating through the interior.

The renderer anchors the cropped art at the collision slab's top, then tiles it to the slab's width and height. Physics objects and collider dimensions remain unchanged. Missing settings use the existing renderer. Invalid settings log a warning and use that fallback.

Restart the preview after changing art or settings because textures and presentation sprites are cached. Settings currently require editing the JSON file; a visual terrain-settings inspector is still pending. This feature currently applies to Unity rendering only; native Unreal support has not been verified. Compilation alone is not visual or gameplay acceptance.
