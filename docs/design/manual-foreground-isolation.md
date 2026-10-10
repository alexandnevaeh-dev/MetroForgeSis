# Manual artwork foreground isolation

Transparent manual artwork preserves an existing alpha matte rather than applying color-based backdrop removal again. This prevents neutral robes, steel weapons, icons and effect pixels from being mistaken for gray studio backgrounds. Opaque background plates, portraits and tiles retain their existing behavior. Automatic model isolation is limited to grounded characters and props; other categories retain their existing model-isolation behavior and alpha normalization.

For opaque character/prop sources, configure `METROFORGE_U2NET_WEIGHTS_PATH` to an installed local U2Net state dictionary and use the configured local Diffusers Python runtime. The existing worker runs segmentation locally; this path does not download weights or send images to a remote service. Model weights and dependencies are not included in repository publication.

The original provider source is preserved. Only a separate normalization input receives the generated alpha. Segmentation must keep source dimensions and RGB values unchanged and return a usable matte; configured failures stop generation with an error. When no isolator is configured, the existing color-based compatibility path remains and metadata records `unavailable_fallback`.

Saved `executionMetadata.foregroundIsolation` distinguishes `existing_alpha`, `segmentation_model`, `skipped_category` and `unavailable_fallback`. These describe processing, not art quality. Review the compiled game image for anatomy, pose, palette, cutout and grounding. A matte or automated score does not grant visual approval or production readiness.
