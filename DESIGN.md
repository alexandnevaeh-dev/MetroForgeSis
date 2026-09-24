# MetroForge design context

## Product and direction
MetroForge is a Windows game creation and editing tool. Preserve the established dense workbench: room hierarchy, central viewport, right inspector. New top-down features extend that editor rather than create a second application. The user's dark-fantasy artwork direction governs generated content; application controls retain their established forge theme.

## Runtime token ownership
`apps/desktop/src/tokens.css` is canonical for colors, typography, spacing and radii; `apps/desktop/src/styles.css` maps these into application layouts. Current surfaces include app #171a20, panel #252b34, primary text #edf1f7, muted text #96a3b5, copper accent #e07030. No new palette or font is introduced for prop editing.

## Shared components
Reuse Button, Input, Select, InspectorSection and editor primitives from `apps/desktop/src/studio/ui/index.tsx`. RoomEditor owns async save feedback and room refresh; the generation room-edit service owns validation and persistence. Keep physical positions and scale together in the inspector. Top-down runtime data must not be presented as side-view tile data.

## Verification boundary
The first top-down prop inspector has typecheck evidence only. Native UI interaction, narrow layout, keyboard operation and screenshot review remain required before calling it complete.

## Room workspace sizing
RoomEditor uses its available content width as a container. At 720px and above hierarchy, canvas and inspector stay alongside one another; saved resizable pane widths resume at 1050px. Fixed-column layouts hide inactive resize separators. Actual Electron window sizes 1000, 1200 and 1500 verified without workspace horizontal overflow. Smaller layouts and broader workflow accessibility checks remain outstanding.
