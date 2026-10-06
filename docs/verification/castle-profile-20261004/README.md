# Castle gallery profile and editor/native parity - 2026-10-04

The optional data/visual/castle-spatial-profile.json selects Stormglass castle rooms for horizontally mirrored interior bays at a fixed world height. It preserves actor/camera scale when a hall grows wider and stacks separate storeys at reduced opacity. Tile painting, entity scenes and miniature previews share CastleBackdrop. Rooms outside the profile retain saved cover/anchor framing. The Inspector identifies profiled rooms and explains vertical framing. Profiles are authored project data; there is no profile-editing control yet.

Backend snapshots validate profiles, include them in optimistic revisions, and refuse stale background writes or unsupported native renderers. Invalid heights safely fall back in the native renderer. Top-down projects ignore this castle-specific profile. Platform floor material repeats at world scale; textured corbels touch gallery balcony undersides.

## Reproduce the candidate

Build the workspace, then run node scripts/stage-castle-gallery.mjs SOURCE_GAME NEW_E_CANDIDATE. SOURCE_GAME must be the original 40-room Stormglass test set with its 2048 by 1536 room_001. The staging script creates a new E: folder only, compiles a 4096 by 1536 gallery with nine balconies/step surfaces, preserves all 39 sibling records and connections, verifies unchanged assets, and writes provenance. It never promotes a candidate or certifies native gameplay. Native tests can be run separately with scripts/verify-input-journey.mjs after import. A backdrop fixture additionally requires CastleBackdropValidation.gd/.tscn in the disposable game.

## Evidence and limits

- Exact packaged MetroForge: 41 room/editor/IPC checks including shared modular rendering, native rectangle/opacity comparison, Save/Undo/conflict behavior, profile errors/recovery, and narrow window bounds. 44 API Keys UI checks use synthetic keys/local endpoints, not provider authentication or inference.
- 69 unit checks, workspace/renderer typechecks, native desktop build and strict premium audit passed. DESIGN lint has zero errors and a pre-existing missing-frontmatter warning.
- 17 controlled Godot 4.6 NVIDIA backdrop checks cover actual rendered bands, mirror mode, grading, supports and invalid-height restoration. These force room loads and are separate from gameplay proof.
- A fresh pristine candidate completes the native ordinary-input 40-transition journey through 35 unique rooms with four bosses, six earned abilities and three cleared-arena returns. No room forcing or granted abilities in that journey. ObjectDB instances-leaked exit warning remains; dummy audio is not listening acceptance.
- The staging script recreates all 40 room records and the gallery scene exactly as the native gameplay candidate. No franchise reference images are included in game assets or these proofs.

The references guide long wings, shafts, stacked galleries, supported architecture, save alcoves and useful gated returns. This candidate implements one longer gallery, not an entire reference castle. Existing 640 by 360 panorama details still appear coarse next to the foreground. New original modular artwork, broader progression redesign, distinct guardian animation/art, fresh provider inference and Unity/Unreal acceptance remain open. Top-down sets are unchanged. The accepted prior portable and canonical generated game remain preserved; this portable contains the separate development gallery candidate.

All artifacts and dependencies remain on E:. Canonical HEAD and dirty Git index are preserved. Launcher configuration references the existing environment file; keys are never copied into the portable or proofs.
