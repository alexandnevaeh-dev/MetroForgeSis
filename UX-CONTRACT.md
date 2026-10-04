# Metroforge UI behavior contract

Scope: existing Electron/React studio; English authoring interface. This records current canonical owners and the live-preview extension. It is not a release-compliance certificate for historical screens.

Visual source: redesign-audit/DESIGN_TOKENS.md documents apps/desktop/src/tokens.css. Runtime tokens remain canonical and flow through styles.css and studio/ui/index.tsx. Preserve the existing dense warm amber/brown editor panels (verified runtime theme; the older token guide requires reconciliation); add no parallel palette or typography for this feature.

## Canonical UI Map
| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
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

## Top-down room editing additions

# MetroForge UI workflow contract

RoomEditor is the existing room list/detail owner. Selected project and room determine the edit target. Top-down area records come from overworld.json, and prop changes use the existing updateRoom command with propPlacements. Reloading an area or restarting preview is required; do not imply live updates.

Canonical controls: shared Input and native-backed Select for scalar fields and selection; shared Button and InspectorSection for actions/grouping. Existing RoomEditor runRoomAction owns pending, success/error messages and refresh. The app stylesheet owns scrolling and focus styles. Runtime tokens remain in tokens.css.

Prop changes are explicit saves, not autosaves. Preserve layers and collision metadata when changing position/scale. Removal is reversible through the same saved-room history. Block duplicate submissions while pending. Keep invalid drafts visible with an inline explanation. Record history only for successful writes. Failed saves preserve data and report the error. Project/room switches must not apply stale responses to the newly selected target.

Unsupported top-down actions must not silently mutate side-view files. Asset addition and visual direct manipulation remain outstanding. Do not show an empty rendered scene as proof that an area is empty.

## Quantum creation

GenerationQueuePanel owns the shared activity queue. It uses shared Badge/Button controls, reads only summary fields from the main-process queue and renders all active jobs plus ten recent past jobs, with explicit increments of ten. Active and historical status remain separate. Refresh calls never overlap, unchanged summaries retain their React state, and updates after unmount are ignored. Poll every 1.5 seconds while work is active and every ten seconds while idle or on failure; generation start/completion/failure events request an immediate refresh. Read failures retain previous jobs with text and Retry. Cancellation locks duplicate clicks and reports only a request acknowledgement; the next authoritative queue response owns the displayed job status. These frontend changes do not certify worker cancellation or full game completion.

CreateScreen owns genre selection and the create/result flow; shared Input, native-backed Select, TextArea and Button own scalar controls. Selecting Quantum uses the dedicated local Godot generation contract in packages/generation/src/quantum-generation.ts: the Probability Mines test profile, local authored assets, selected nonnegative integer seed and its own material runtime. Manual room scaffolding and AI modes must not be substituted. Show these current limits beside the controls. Genre radio cards support arrow/Home/End keyboard selection and a single tab stop. Preserve entered title, prompt and seed when changing genres.

Creation validates whole-number seeds without truncation or replacing zero with 42. Block duplicate submissions and disable input while either creation action runs. Keep failed input available for correction. Select a resulting project only when files were actually created. Created files, pending tests, failed tests and passing tests are separate result states; file creation alone must never receive a Tests passed badge. Native generation and UI verification reports establish their own scope, not production approval.

## Asset workshop

GenerateAssetScreen uses shared Button, Input, Select and TextArea. The selected project owns its prompt, results, inspector and version history. Switching projects clears the selection and pending responses cannot populate the new project's inspector. Generate alternative always creates a distinct registered asset; Replace selected generates one image at the existing registered path and saves the original artwork and source to history. Every successful alternative can be inspected separately. Failed requests retain the prompt and unlock retry; synchronous action guards prevent duplicate generation/restoration and all mutations disable conflicting actions. Read failures are explicit. Native selectors remain keyboard accessible and the established narrow layout stacks the panels.

Manual generation stages provider writes within the selected project, checks for concurrent edits before promotion, honors provider enablement, and updates matching existing Unity mirrors. In-process write failures roll back images, source, registry and history. Corrupt registries, divergent mirrors, traversal and linked paths fail without inference or overwrite. Existing animation descendants remain present and are marked for rebuilding. Changes invalidate runtime acceptance; a saved image does not certify animation, gameplay, production readiness or visual quality. Staging folders retain generated outputs for diagnosis. Promotion is not a crash-safe multi-file database transaction.

AssetsGallery also scopes selection and history to the selected project. Failed history reads display an explanation without a renderer rejection; late details from a previous selection are ignored. History accepts legacy registry IDs for reading, validates the version-list shape, and restores original provenance together with the image. A restore snapshots displaced artwork so it can be recovered in turn.

## API key management

ApiKeysScreen owns the connection form using shared Input, Button, Badge and ScreenHeader. The top command bar, navigation, Providers and Settings link to the same page. CredentialStore in the Electron main process owns an allowlist of twelve providers and encrypted persistence through Electron safeStorage. LM Studio tokens are optional; Ollama needs no key. Text, image and local-model filters retain drafts in memory and expose their selected state. Credential IPC accepts only the trusted main renderer frame. Saved overrides take precedence over inherited environment keys; removing an override restores the inherited key and does not edit .env. Read APIs return presence/source only. No plaintext fallback, browser storage or key retrieval into fields is allowed. An unreadable vault is preserved and disables mutation. The encrypted file lives in the configured application data directory and is ignored by Git.

Save waits for disk commit before displaying success and immediately updates credentials for newly started provider jobs. Existing jobs are not rebound. Presence is separate from health, model permission, quota, billing and enabled state; saving does not enable a provider or issue a generation request. Providers owns access checks, Settings owns enable/disable and generation modes retain their existing cost policy.

Settings > Runtime owns nonsecret Ollama/LM Studio server URLs and chat-model selections, plus Together, Cerebras and Mistral model selections. Blank values retain environment/default configuration. Local URLs must be loopback HTTP/HTTPS without credentials, query or fragment; renderer guidance and main-process validation enforce the same rule. Provider discovery and text/code/narrative generation use these settings for newly started jobs. Local connections remain free; paid hosted connections are excluded from FREE_ONLY routes and all hosted connections are excluded from LOCAL_ONLY routes. Provider toggles remain authoritative. Model licenses and local server availability are separate from connection health.

Inputs are masked by default and remasked on navigation. Drafts survive in-page navigation in memory only; Save/Discard clears them. Closing the app with an unsaved draft uses the existing Electron unload guard. Invalid input has associated text guidance and blocks submission. Busy locks all key mutations; failure preserves the draft and previous active credential, with retry after storage recovery. Removing a saved key requires an inline confirmation naming the provider and explaining environment fallback. New-generation text health summaries exclude disabled providers and do not imply engine or image-provider readiness. Every route sets a page-specific document title. Static audit and real hidden Electron evidence are retained under reports/game-tests/20261003-connections; synthetic credentials establish storage behavior, not live service authentication.

The New Game form also stays mounted during navigation so a live request, its submission lock, entered description and resulting project are not lost when visiting API Keys or another workspace. GenerationStudio restores real phase/event history from StudioContext. Failed artifact previews display recovery text rather than an indefinite loading message. Read-only previews may read in-progress generated projects inside the configured generated-games root; mutations retain their engine-project guards.

## Native top-down game HUD
GameHUD.gd and World.tscn own the existing readonly gameplay HUD. HealthComponent owns health; InventoryManager owns item counts/names; GameManager owns acquired abilities; MapManager owns room identity/discovery; QuestManager owns currency and active objectives. No duplicate counters or gameplay state changes are introduced for presentation. AdventureHUDTheme.gd owns this game's native theme separately from the studio and side-view UI.

Vitality shows clamped actual current/max health; at 25% or below a LOW label accompanies its danger color. Known dungeon tools are displayed when owned as inventory items as well as when acquired through ability events. Names come from item definitions or game DNA, with a readable fallback; narrow labels truncate visually and retain full tooltip text. The room label follows the current graph node. HUD panels ignore mouse input. Empty quests hide the tracker; its bounded contents determine its height. Death/respawn and victory retain the existing event-driven overlay lifecycle.

Native validation and screenshot evidence live in reports/game-tests/20261001-canopy-hud-interactables. These checks are not a comprehensive accessibility or release certificate.

## Verdant Oath spells and memories

PlayerSpellController owns essence, spell cooldowns and temporary ward protection. The readonly bottom HUD shows those actual values, Q/R/F controls, and whether a spell has been learned. Spell items persist through InventoryManager. SaveManager saves essence and cooldowns; a loaded save takes precedence over outgoing room state and is consumed once. Ordinary transitions carry current values. Unlearned spells, cooldowns, insufficient essence, attacking, death and pause prevent casting.

Inventory scrolls its bounded item list and shows the selected item's description below it. Memories are readable story items. NPC dialogue choices accept quests; accepting after collecting the required items backfills progress and awards completion once. Starting a new game clears inventory and quest state. The expanded native tests and captures live in reports/game-tests/20261001-canopy-epic-foundation.

## Project library and runtime refresh
ProjectsScreen owns library search, twenty-card pagination, inline action feedback and the reviewed runtime-update panel. Shared SearchField owns keyboard clearing and focus restoration across library, assets, models and room search. StudioProvider serializes reads, retains the last loaded library on failure and reports unavailable initial state instead of false emptiness. Path identifies a project; repeated slugs never identify rows. Engine and genre labels describe the actual metadata. Pending actions lock submission; acknowledgements describe launch requests, not game acceptance.

Godot room-template refresh resolves shipped resources from the declared genre. Quantum sealed runtimes and other engines use their dedicated workflow. Preview is read-only; main-process application requires the reviewed SHA-256 plan. Drift rejects mutation. Existing settings and bindings are retained; missing runtime bindings are added. Generated rooms/assets are excluded. Before-images and receipts are written on E: under the project .metroforge directory; partial failures restore touched files and retain a rollback receipt. Runtime changes invalidate old validation. This is a runtime update, not asset regeneration or visual approval.

Library export respects validation by default and labels the source ZIP accurately. It excludes private refresh backups and does not imply a distributable executable or production readiness. Failure preserves query, selection and review. Verification owners: scripts/verify-library-frontend.mjs (controlled failures and races), scripts/verify-project-library-ui.mjs (real packaged IPC and disposable fixtures), project-template-refresh.test.ts (genre separation, drift and rollback).

The project overview catches failed metadata reads and offers inline retry. Pending refresh retains stable controls and ignores responses from previous projects or unmounted screens. Shared project selection uses path identity and keeps initial unavailable state distinct from an empty library. Dashboard failure/race verification is owned by scripts/verify-dashboard-frontend.mjs.


## Room scene preview and geometry
RoomEditor opens with a fitted scene and keeps optional zoom. The grid, palette, painted cells and entity snapping use the scene's tile size, including older castle records that obtain their grid metadata from the runtime scene. Godot collision preview reads authored static rectangles and instanced bodies; rotated rectangles keep exact vertices. Unsupported geometry or transforms report an unavailable preview rather than inventing collision. Scripts are not executed by the preview reader; native comparison is a separate check.

The castle canvas shows the saved registered background with the runtime's cover scale, opacity and floor framing. Inspector drafts do not change the canvas until Apply succeeds. Undo and Reload refresh the saved canvas; obsolete project/biome responses are ignored. Castle art remains scoped to supported side-view projects. The canvas is an authored geometry and artwork preview; Play Preview owns full game rendering. Shared hierarchy rows separate room IDs and archetypes. Current workflow verification is owned by scripts/verify-room-geometry-ui.mjs and native RoomGeometryGroundingTest.gd; neither asserts a completed input-driven whole-game traversal.

## Provider model discovery and selection
ModelsScreen owns the virtualized model catalog and provider-scoped selection. Catalog records use provider plus API model ID as identity; model IDs sent to APIs remain unchanged. Refresh reports additions, updates and connection failures separately, keeps loaded records on read failure, and offers Retry catalog. Pending reads and mutations lock repeated clicks immediately; late responses after navigation are ignored. Shared Button, SearchField, Badge and Select own visual and keyboard behavior. Installation is available in model details, avoiding a nested action inside a listbox option. Arrow/Home/End selection exposes only a mounted active descendant.

Set provider model persists the chosen chat model for Ollama, LM Studio, Together, Cerebras or Mistral using existing guarded settings IPC. It sends no generation request and does not change enablement, keys, generation mode or fallback policy. Candidate status describes catalog availability rather than asserting the model is already configured. Discovered models retain unknown commercial licensing, performance and hardware requirements until verified; provider listings do not establish output quality. Hardware preference scoring runs at ranking time and never repeatedly changes authored priorities. Catalog save is atomic; malformed saved catalogs fail with recovery guidance and are preserved.


## Asset gallery registration and animation playback
The gallery imports existing PNGs from the selected project GAME_SET.json inventory through guarded IPC. Imports verify artwork hashes and genre identity, retain the registry before-image and expose inline success or errors; repeating an import preserves registry bytes. Existing generation provenance remains unchanged. Newly admitted artwork has unverified provider and license information and is not production-approved. Artwork stays in its own game set.

Animation preview uses authored clip FPS, frame count and loop flags. Attacks, hits and deaths that play once hold their final frame and offer Replay; looping clips retain Play/Pause, frame step and keyboard seeking. Special boss attack and telegraph clips use the corresponding sidecar metadata. Assets failed to load show Retry assets. Shared Button and existing studio tokens own appearance.

Asset review uses the full workspace width and height; the generic assist panel and activity drawer remain on other routes. New Game/Generation remain available in navigation. Animation previews cap visual height at 240px while retaining crisp nearest display, with timing controls directly below. The Animation tab filters authored animation records across player, enemy and boss categories.

Long asset IDs and paths wrap inside their inspector. Below 1200px the header project selector can shrink while creation modes retain usable labels, preventing overlap with Jump and application actions. Real packaged checks cover import rejection/retry, preserved artwork, authored clip playback and 1000px gallery controls.
