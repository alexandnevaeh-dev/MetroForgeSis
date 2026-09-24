# Metroforge UI behavior contract

Scope: existing Electron/React studio; English authoring interface. This records current canonical owners and the live-preview extension. It is not a release-compliance certificate for historical screens.

Visual source: redesign-audit/DESIGN_TOKENS.md documents apps/desktop/src/tokens.css. Runtime tokens remain canonical and flow through styles.css and studio/ui/index.tsx. Preserve the existing dense warm amber/brown editor panels (verified runtime theme; the older token guide requires reconciliation); add no parallel palette or typography for this feature.

## Canonical UI Map
| Capability | Canonical owner | Source | Variant | Verification |
| --- | --- | --- | --- | --- |
| Select/Listbox | studio/ui/index.tsx Select | existing Room/Project editors | Native OS popup accepted for object choice | Native popup keyboard selection passed in browser harness |
| Form | studio/ui/index.tsx Input and Button | RoomEditor placement inspector | Live numeric coordinates; finite values only | Typecheck; native validation; browser apply/save/undo/conflict passed |
| Feedback | InspectorSection with inline role=status/alert | PreviewScreen and RoomEditor | Pending, acknowledged, error; keep failed draft | Native smoke; browser source-conflict recovery and input preservation passed |
| Scrollbar | apps/desktop/src/styles.css | Existing shell | No feature-local override | Existing theme; visual check pending |
| CRUD | LiveRuntimeInspector + playtestCommand IPC | packages/tools/src/playtest-session.ts and StudioRuntimeBridge.gd | Runtime move/inverse move; explicit authored placement save | Native smoke-live-bridge |

## Live preview behavior
- Inspect actual running scene; list is bounded by runtime to 2000 Node2D entries. Selection is local, ephemeral, and not URL-persisted because it identifies one process instance.
- Apply and Undo wait for runtime success. No optimistic saved/live claims. One command at a time per inspector.
- Source file persistence is separate. Apply/Undo change runtime only. Save placement explicitly persists acknowledged authored positions through the source-save coordinator and existing room history. Save is disabled for unchanged positions, unapplied drafts, unsupported objects, and unconfirmed runtime state.
- Current native node instance identity guards against scene replacement at the same path. Project/session changes remount the inspector; old asynchronous results are ignored.
- Failed commands preserve coordinate input and expose a text error. Inspect refreshes objects and clears one-step undo. Undo restores the actual pre-move position returned by the runtime.
- No destructive actions or paid/external dispatches are introduced. Controls reuse shared tokens and native keyboard semantics.
- Stable authored IDs and explicit source saving are connected. Full session undo/redo, canvas selection, integrated history validation and native Unity/Unreal adapters remain required milestones.

## Loot table creation
LootDefinitionEditor owns create/edit drafts through the existing generation loot service and guarded desktop IPC. New loot table creates an unsaved empty table with an opaque unique ID; no enemy assignment is implied. Name and drop controls share existing editor styles and native OS selection. Create stays in the owning editor with the saved table selected, preserving existing edit behavior. Empty names disable creation and show associated text error. Busy disables edits; service failures preserve the draft. Session navigation retains creation intent and undo history. Discard clears the unsaved table. Restart/rebuild requirements remain explicit in save feedback. Native creation/name validation/navigation/save/reload verified; narrow-layout and broader accessibility coverage remain incomplete.

## Animation asset preview
AssetsGallery owns selection and playback; AnimationPreview owns image loading and frame cropping. Reuse shared Button and existing theme tokens. Authored artifact metadata or the character animation sidecar supplies frame count and FPS; unknown counts remain unknown. Grid frames are read left-to-right, top-to-bottom. Missing/inconsistent frame metadata shows the full sheet with text; load failure is explicit. Frame step pauses playback. Selection resets to frame zero; reduced-motion preference disables initial autoplay. The gallery loops clips for inspection. This does not establish in-game animation quality.
Animation frame scrubber reuses shared Input with native range keyboard behavior. Seeking pauses playback and selects the zero-based frame without changing authored frame metadata. Playback resumes from the selected frame. Validated in the packaged Windows gallery: direct seeking, keyboard decrement, pause, half-FPS resume from selection, and reduced-motion initial pause; synthetic pose-guide fixture, not game artwork acceptance.

## Terrain appearance inspector
AssetsGallery owns canonical floor/wall selection; TerrainPresentationEditor uses shared InspectorSection, Input and Button with inherited tokens. English labels describe bottom-left pixel coordinates. Drafts persist per project/asset during navigation; save waits for the guarded terrain service, preserves failed drafts, and reports restart/rebuild requirements. Discard restores the loaded snapshot. Numeric blanks disable saving. No live terrain reload is claimed. Backend rollback and typechecking passed; packaged UI, keyboard, narrow layout and save/reopen verification remain pending.


Terrain form refinement uses shared PropertyRow with explicit label/control IDs and a shared Checkbox primitive in studio/ui/index.tsx. Checkbox geometry is owned globally in styles.css; terrain fieldset removes native border and uses inherited tokens. Typecheck passed; v8 packaged visual verification pending.

Terrain draft Undo/Redo retains up to 100 steps per asset in the session. Save and Discard clear history; these controls do not undo an already saved file. Packaged v9 verified undo/redo and history clearing after save. Navigation retention is implemented but not yet verified through UI.
