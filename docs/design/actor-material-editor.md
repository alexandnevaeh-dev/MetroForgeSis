# Actor material color correction

The Asset workshop extends its existing selected-artwork inspector with Correct actor colors. It uses the shared Button, Input and native Select controls, forge tokens and inline status/error feedback. The source viewport is reserved at272px, with intentional internal scrolling for2×/4× inspection. Keyboard users enter source pixel coordinates and activate Sample pixel; rectangle coordinates provide a non-drag editing path.

Color rules match original source pixels inside bounded rectangles. Tolerance includes nearby colors; shading can retain relative brightness or use one flat color. Later overlapping matches win without cascading prior replacement colors. Preview colors changes no project files. Apply colors commits exactly that reviewed source/game pair, preserving both preimages and prior provenance in existing version history. Restore supports both source and compiled image.

Source, game image, registry and game DNA fingerprints guard inspection and apply. Project/asset scoped preview tokens expire after ten minutes; four previews bound the cache. Conflicts preserve entered rules and require a new inspection/preview. Successful saves refresh the inspector, retain the expanded editor and persist the acknowledgement in the Workshop feedback area. Actor review remains pending and runtime validation is invalidated. Derived animation files remain intact but dependent records are marked dirty.

This initial capability supports static manually generated player/enemy/boss/NPC images with a saved source and valid compilation plan. It does not recolor animation sheets, redraw anatomy or approve artwork. Local foreground separation can be required for opaque grounded sources. Color parameters/previews are transient; only Apply saves. Unapproved actors remain separate from gameplay admission and production acceptance.

## Import a corrected actor source

The selected-artwork inspector also offers **Import corrected actor source**. Choose a single transparent, non-interlaced 8-bit RGBA PNG and preview both its source and compiled game image. Source images may have different dimensions from the previous source; compilation keeps the existing game canvas and grounded fit. Import preserves the exact chosen PNG bytes and records the new source dimensions in the compilation plan.

Preview changes no files. **Import this source** uses the same scoped, expiring draft and source/image/registry/DNA checks as color editing. It preserves both original PNGs and the original plan in version history. Restore returns those bytes, dimensions and provenance together. Imported art is identified as manual source import, with filename and source hash; previous generation metadata remains historical and does not establish how the imported file was produced. Dependent animations are marked dirty and acceptance is invalidated. Import does not bind the image to an enemy family or approve its anatomy, animation or combat use.

The backend accepts image bytes, without caller-selected filesystem paths. It bounds file size, dimensions, chunk counts and decompression, verifies chunk checksums and scanline filters, and rejects opaque, empty or animated sources. Keep the original generation receipt separately when importing AI-produced artwork.
