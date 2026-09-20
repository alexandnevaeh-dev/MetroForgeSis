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
