# MetroForge design context

## Product and direction
MetroForge is a Windows game creation and editing tool. Preserve the established dense workbench: room hierarchy, central viewport, right inspector. New top-down features extend that editor rather than create a second application. The user's dark-fantasy artwork direction governs generated content; application controls retain their established forge theme.

## Runtime token ownership
`apps/desktop/src/tokens.css` is canonical for colors, typography, spacing and radii; `apps/desktop/src/styles.css` maps these into application layouts. Current surfaces include app #171a20, panel #252b34, primary text #edf1f7, muted text #96a3b5, copper accent #e07030. No new palette or font is introduced for prop editing.

## Connection setup and navigation

The application remains a forge workbench. Navigation now leads with the task name (New Game, World Map, API Keys); forge names are secondary captions. Create, Library, Build & Play, AI & Quality and Dispatch group related tasks. The API Keys page uses the same runtime tokens, shared Input/Button/Badge controls and a responsive two-column connection grid. Each card exposes one provider, credential source and a masked replacement field. Text, image and local-model filters reduce the twelve-card form; a copper-accented local-model guide links to Runtime settings for key-free setup. Runtime uses shared labeled Inputs for server URLs and model names. A copper border marks the storage explanation; no separate palette or font is introduced. Connection setup replaces the unrelated generation activity drawer with space for forms and a contextual connection guide. Runtime token ownership remains model B; colors and spacing are consumed directly from tokens.css through styles.css.

## Shared components
Reuse Button, Input, Select, InspectorSection and editor primitives from `apps/desktop/src/studio/ui/index.tsx`. RoomEditor owns async save feedback and room refresh; the generation room-edit service owns validation and persistence. Keep physical positions and scale together in the inspector. Top-down runtime data must not be presented as side-view tile data.

## Verification boundary
The first top-down prop inspector has typecheck evidence only. Native UI interaction, narrow layout, keyboard operation and screenshot review remain required before calling it complete.

## Room workspace sizing
The room canvas opens fitted to its available width. Zoom controls allow closer inspection. Room IDs and archetypes use separate lines in the shared hierarchy row; the inspector thumbnail contains the room rather than cropping its lower half. Saved castle background artwork sits behind authored geometry and markers; this is an editor composition, with complete runtime decoration available through Play Preview. Geometry, painting and snapping consume the actual scene tile size.
RoomEditor uses its available content width as a container. At 720px and above hierarchy, canvas and inspector stay alongside one another; saved resizable pane widths resume at 1050px. Fixed-column layouts hide inactive resize separators. Actual Electron window sizes 1000, 1200 and 1500 verified without workspace horizontal overflow. Smaller layouts and broader workflow accessibility checks remain outstanding.

## Native top-down adventure HUD
This is a separate generated-game surface; studio tokens and the side-view set keep their existing identity. `templates/godot-topdown-adventure/scripts/UI/AdventureHUDTheme.gd` is the canonical native runtime theme. GameHUD, its readonly panels, quest text and the current-room map marker consume it directly. Runtime ownership is model B: this document records roles; the GDScript constants own values.

Ink #142630, moss panel #192e35 at 95% opacity, edge #428276, primary text #dae2b5, secondary text #a1b0ae, amber trim/location #eeb866, map/tool light #63d8d3, normal vitality #82b987 and low vitality #e07b80. Use the built-in Godot font: 14px body, 13px vitality utility, 14px room label; quest titles 13px and objectives 11px. These are native logical pixels at the 1280x720 game viewport, not CSS pixels.

The signature is a compact moss-backed vitality and field-tool cluster with amber room identity. Survival information leads; the map stays at the opposite corner. Keep the center clear. Show actual health numerically and mark low health with text as well as color. Display inventory/ability names rather than internal IDs. Quest layout grows for its bounded two quests/two objectives. Native screen-reader, smaller-window and broader accessibility coverage remain separate verification work.

## Verdant Oath presentation

The top-down woodland test uses an opt-in 3D diorama with its existing animated pixel sprites. HD-2D style requests enable `data/visual/hd2d.json` through the Godot assembler. HD2DWorldPresenter maps the authoritative 2D tiles, positions, sprite frames, prop anchors and boss aiming lines into the 3D view; gameplay collision stays in the original controller. Nearest filtering preserves sprite edges. Timber houses, textured roof geometry, lights, shadows and restrained fog give the hamlet depth. Forward+ supports glow and ambient occlusion; Compatibility uses the same geometry without those effects.

Maintain the shared woodland palette and bottom-ground anchors. Player casting has twelve authored poses at 24fps in each of eight facings; movement, combat, hit and death keep their complete strips. The renderer must use the current source frame, with no independent animation timer. The sixteen-area Verdant Oath test remains draft artwork; runtime success is not a finished graphics or performance certificate.


## Asset gallery registration and animation playback
The gallery imports existing PNGs from the selected project GAME_SET.json inventory through guarded IPC. Imports verify artwork hashes and genre identity, retain the registry before-image and expose inline success or errors; repeating an import preserves registry bytes. Existing generation provenance remains unchanged. Newly admitted artwork has unverified provider and license information and is not production-approved. Artwork stays in its own game set.

Animation preview uses authored clip FPS, frame count and loop flags. Attacks, hits and deaths that play once hold their final frame and offer Replay; looping clips retain Play/Pause, frame step and keyboard seeking. Special boss attack and telegraph clips use the corresponding sidecar metadata. Assets failed to load show Retry assets. Shared Button and existing studio tokens own appearance.

Asset review uses the full workspace width and height; the generic assist panel and activity drawer remain on other routes. New Game/Generation remain available in navigation. Animation previews cap visual height at 240px while retaining crisp nearest display, with timing controls directly below. The Animation tab filters authored animation records across player, enemy and boss categories.

Long asset IDs and paths wrap inside their inspector. Below 1200px the header project selector can shrink while creation modes retain usable labels, preventing overlap with Jump and application actions. Real packaged checks cover import rejection/retry, preserved artwork, authored clip playback and 1000px gallery controls.
