# Metroforge development handoff — 2026-09-20

## User scope and standing authorization
Continue development without waiting for routine input until Metroforge is a complete, modern-looking game creation application that produces a polished, playable game. Include gameplay, algorithms, assets and visual acceptance. Include Unity, Unreal and real local NVIDIA tests. Keep ALL new downloads, dependencies, caches, models, build outputs and scratch files on E:. Authorized GitHub destination: alexandnevaeh-dev/MetroForgeSis. Do not overwrite remote history. This recovered folder has no .git ancestry; reconcile the integration branch before uploading. Browser is signed out and Git HTTPS certificate validation currently fails; do not disable TLS verification.

User added: visual game development editing INCLUDING editing during live gameplay. This is a required feature, not an optional follow-up.

An hourly heartbeat is active for this task. It reads this handoff. Notify only meaningful changes or blockers, not repetitive status. Current project path: E:\Metroforge\MetroForge-Recovered. Original downloaded archive and previous laptop copy remain preserved.

## Current pass
- Updated scripts/engine-acceptance.mjs to probe the current OS instead of unconditionally invoking macOS tools, choose Windows/Mac/Linux build plans, accept configurable test project/report paths, reject missing/stale playtest evidence, and report incomplete acceptance with exit 2.
- Added scripts/lib/engine-acceptance-platform.mjs and direct Node regression tests. Plans cover Unreal host paths and Unity build entry points; five evidence cases cover missing, stale, failed and valid playtest results.
- Added BuildWindows and BuildLinux alongside BuildMacOS in the Unity build template. Native C# compilation remains unverified.
- scripts/engine-generation-check.mjs now fails requested missing/non-engine projects rather than silently succeeding after skipping them.
- Updated recurring work to include visual/live editing.

## Evidence, not release approval
- All 17 TypeScript configurations passed typecheck. Log: E:\Metroforge\Recovery-Audit\typecheck-current.log.
- Changed JavaScript files passed ESLint. Direct platform/evidence regression script passed.
- Unity and Unreal assemblers each produced an 8-room project from the recovered manual fixture; both passed static QA. No sprite clips in this fixture: it is not an art/visual quality demonstration. Log: E:\Metroforge\Recovery-Audit\engine-smoke-current.log.
- Native acceptance reported both editors missing and exit 2. Reports: E:\Metroforge\Recovery-Audit\engine-reports.
- Full Vitest and renderer build remain blocked before collection by Node child-process piped stdio EPERM. Direct executable launch and inherited stdio work. Do not disable tests or bypass sandbox policy.
- NVIDIA RTX 5060 Laptop GPU, 8151 MiB, driver 616.92. Existing PyTorch 2.7.1+cu128 reported CUDA available and a real GPU matrix test returned 3680.0. Log: E:\Metroforge\Recovery-Audit\nvidia-current.log. This alone does not prove asset quality.
- Real local diffusion probe launched with existing C: model/runtime read-only; all new caches and output are E:. Check E:\Metroforge\Recovery-Audit\gpu-inference-current.log and gpu-probe/ before reporting its outcome.
- No completed native Unity/Unreal game, live edit runtime, final visual approval, full test-suite pass, or GitHub upload has been claimed.

## Visual/live editing implementation milestones
1. Reuse RoomEditor.tsx tile paint, entity selection/drag, inspector and existing Electron room-edit history. Audit undo/redo and persisted placement identity. WorldEditor and PreviewScreen are existing surfaces.
2. Introduce an engine-neutral edit transaction with stable object ID, project/session ID, base revision, validated operations, inverse operations and runtime acknowledgement. Source save and runtime application must be separate states. Never label an edit live until the runtime acknowledges it.
3. Connect a local, development-only preview session to the active engine. Start with supported object position/property edits; preserve health, inventory and progression. Reject stale revisions, wrong projects, invalid coordinates and unsupported edits. Never ship a remotely accessible edit endpoint in exported production games.
4. Add pause/resume, select-in-viewport, property inspector, undo/redo, apply/revert, and persistence across preview restarts. Explain restart-required edits in the UI. Do not silently reload and call it live editing.
5. Implement adapters and capability reporting for Godot, Unity, Unreal. Existing project-edit-service.ts currently hardcodes Godot recompilation: address this before exposing edits for foreign engines.
6. Validate actual running-game edit, undo, scene transition, save/reload and reconnect for each supported engine; capture visual evidence and measure responsiveness. Style the integrated editor using the required frontend design skills.

## Next work
Finish and inspect GPU image probe; establish a reproducible desktop/test launch without piped-process failures; install engines/toolchains on E: when possible (user handles license/account prompts); implement the first live-edit transaction path with meaningful tests. Preserve the complete-game and modern visual-quality goal while progressing in concrete increments.

GPU inference completed: local SD-Turbo generated a 512x512 foundry image on the RTX 5060 in 32.86 seconds. Output and JSON are in E:\Metroforge\Recovery-Audit\gpu-probe. This is a real inference smoke test, not production visual approval. Reused existing model/runtime on C: read-only; new files stayed on E:. Added package commands test:engine-platform, validate:engine-generation and validate:engine-acceptance.

## Live-edit session foundation — continuation
Implemented packages/engines/src/live-edit-session.ts and exported its API. Supports stable object/room IDs, project+session isolation, optimistic revision checks, atomic move/property batches, inverse operations, undo/redo, detached snapshots, separate persistence revision and runtime acknowledgement, and disconnected runtime state. Property changes use an adapter-provided allowlist; non-finite coordinates/values and reserved property keys are rejected. Unsupported operation types fail without committing partial state.

Validation: node node_modules/typescript/bin/tsc -b packages/engines --pretty false passed; node scripts/test-live-edit-session.mjs passed; ESLint on the new implementation and regression script passed. package.json has test:live-edit (requires compiled engines package). Regression covers atomic rollback after a valid operation followed by an invalid one, unknown objects, wrong project/session, stale revisions, receipt/snapshot mutation isolation, reverse-order undo, redo invalidation, save versus runtime state and disconnect.

This is a tested shared model, NOT a connected live editor. Next: integrate it with Electron preview session lifecycle, load object identities from room placements, persist acknowledged authoring snapshots through existing project editing/history, and add a development-only runtime adapter. Do not claim UI or running-game editing until the actual runtime path has been exercised. Existing source room editor still hardcodes Godot recompilation and must not be used to silently modify Unity/Unreal outputs.

## Connected Godot runtime bridge — continuation
Found desktop playtest-session.ts already hosted a loopback bridge but StudioRuntimeBridge.gd was absent from all templates. Added the client to the side-view Godot template and registered its autoload. It is inert without an explicit Studio environment flag and a debug build; connects only to loopback using launch token, processes while paused, buffers UTF-8 bytes across TCP fragments, caps input, supports pause/resume/get_state and scene-relative Node2D moves, rejects invalid paths/coordinates, returns exact request IDs, and exits when its controlling session disconnects. Reload-current-room returns an explicit restart-required error instead of silently resetting state.

Desktop bridge now routes acknowledgements through its existing line buffer using unique request IDs, checks originating authenticated socket/command, handles disconnect/timeouts and protects command/correlation fields from payload override. No optimistic pause state when disconnected. Headless launch option added for native smoke checks.

Validation: tools TypeScript build and changed-file ESLint passed. Python loopback integration exercised real Godot 4.6 auth, fragmented messages, pause, inspect, move and inverse move, invalid edits, resume. Reusable scripts/smoke-live-bridge.mjs tested the ACTUAL desktop bridge with native Godot, concurrent commands, request correlation and payload protection. It passed and exited cleanly. Package command smoke:live-bridge requires compiled tools and GODOT_EXECUTABLE. Scratch projects are retained under .metroforge/live-bridge-smoke, excluded from Git along with any studio-bridge.json token files. Native Godot emits a pre-existing root certificate store warning; runtime bridge assertions passed.

The connected runtime supports ephemeral node-path positioning, NOT yet full authoring-session integration. Next connect stable authored object IDs, LiveEditSession revisions/undo, renderer selection and persistence. Do not call full visual/live editing complete: current smoke uses a minimal scene; it does not prove generated-game health/progression continuity, native Unity/Unreal adapters, graphical editing, or scene-transition persistence. Top-down template also needs the bridge adapter integrated and tested.

## Preview live-object inspector — continuation
Added LiveRuntimeInspector.tsx to PreviewScreen. It reuses InspectorSection, Select, Input and Button, inspects the actual runtime scene, selects Node2D objects, applies finite X/Y positions and offers one-step undo using the runtime-returned pre-move position. Commands are serialized; success is acknowledged, errors retain input, stale component responses are ignored. Component is keyed by project and preview start time. Runtime changes are explicitly temporary and not source saves. Removed the misleading Live reload room control. Preview session polling ignores old-project responses and catches disconnections.

Runtime inspector payloads carry expectedInstanceId; Godot rejects a recreated node at the same scene path. Added instance IDs to get_state object records. Native smoke test now covers stale-ID rejection and matching-ID acceptance.

Verification: desktop TypeScript --noEmit passed; ESLint passed on changed UI; Prettier applied; native smoke-live-bridge passed after the runtime and test changes. Desktop renderer build remains blocked by esbuild spawn EPERM (desktop-build-inspector.log). No browser screenshot, keyboard/popup interaction, layout, or complete UI flow is yet verified. UX-CONTRACT.md records shared owner mapping, ephemeral runtime semantics and the existing token guide. Premium strict static audit was launched; poll execution session 83392 or inspect E:\Metroforge\Recovery-Audit\premium-audit-inspector.json/log before claiming its outcome. Last observation confirmed it was still running.

Next priorities: unblock renderer execution and inspect the actual UI; connect stable authored identities and permanent placement save + full undo/redo to the shared LiveEditSession; graphical viewport selection; top-down/Unity/Unreal adapters and native coverage. Original complete modern application/game/GitHub requirements remain open.

## Browser-to-native inspector verification — continuation
Native esbuild CLI succeeds even though Vite's Node service fails with piped spawn EPERM. Bundled the full renderer as a diagnostic (E:\Metroforge\Recovery-Audit\renderer-probe), then bundled the production LiveRuntimeInspector with existing styles into a local harness. Harness connects over a same-origin, loopback-only test HTTP adapter to the actual playtest-session tools and a native headless Godot scene; responses are not mocked. Harness lives under .metroforge/live-inspector-harness and is Git-ignored. Do not ship its HTTP test adapter as production API.

Browser UI evidence: initial empty/disabled state; Inspect returned Enemy at (20,30); entering (144,88) and Apply received runtime success; Undo restored (20,30); empty X disabled Apply. Screenshot inspected: production shared styles render coherently in a 480px inspector harness. Full Electron placement, narrow viewport, keyboard popup and entire application visual quality still need validation.

Failure-path browser test exposed stale success text after disconnect. Fixed LiveRuntimeInspector to mark connection unconfirmed, show inspect-again guidance and disable Apply/Undo after failure while preserving inputs. Rebuilt and repeated connected then disconnected inspection in browser; verified both actions disabled and recovery message visible. Fixed singular object count. Desktop typecheck and changed-component ESLint passed. Harness server and Godot processes were stopped after testing.

Premium audit session 83392 is terminal (tool handle missing); report exists at Recovery-Audit/premium-audit-inspector.json. It reports 17 findings: 9 ownership findings and 8 violations. Requires triage; examples include native Select ownership not detected despite written UX contract and shared Button spread-prop handlers flagged actionless. Do not claim audit clean. Normal Vite/Electron build remains blocked; native CLI success is a diagnostic route, not proof of a finished production bundle.

## Stable authored identity for live edits — continuation
Generated side-view Godot entity roots now include explicit room ID, placement kind and placement ID metadata. Metadata follows the actual selected placement (including legacy ID fallback), uses escaped scene strings, and is omitted when no placement exists or its kind/ID is duplicated. Player, enemy, boss, NPC, ability/item pickup and checkpoint roots are covered; child sprites and decoration are not persistence targets.

StudioRuntimeBridge get_state exposes validated identity as authored: {roomId, kind, id} while preserving nodePath and ephemeral instanceId. Metadata is not inherited by children, and unsupported kinds are excluded. This supplies the runtime-to-source link; it does NOT implement permanent saving yet.

Validation: Godot package TypeScript build and changed-file ESLint passed. Expanded scripts/smoke-live-bridge.mjs checks generated metadata for all entity kinds, duplicate/missing placement rejection, real native Godot decoding, child/invalid identity exclusion, correlated moves, restart identity stability and temporary move reset to source coordinates. Native smoke and shared live-edit-session regression both passed. No new dependencies/downloads; writes stayed on E:.

Next: use authored identity with a verified project/session and source-conflict check in an explicit save operation, route through existing room history, enforce engine scope (project-edit-service currently hardcodes Godot), integrate shared LiveEditSession undo/redo and persistence UI. Native Unity/Unreal coverage, full production desktop build, visual/gameplay acceptance, and GitHub upload remain open. Hourly development automation remains the continuation mechanism.

## Explicit placement persistence service and desktop command — continuation
Added generation/live-placement-save.ts: inspectPlacementForSave hashes the source rooms JSON plus scene; saveAuthoredPlacement requires that revision, a unique saved placement, and exact metadata on a direct scene child. It updates only that node's position and the corresponding rooms.json coordinates, retaining other room/document fields and scene text. It avoids geometry regeneration for a position-only edit. Non-Godot targets, ambiguous/missing identities, invalid IDs/coordinates, and stale source are rejected. I/O errors attempt restoration of both original artifacts; this is compensating rollback, NOT crash-safe multi-file atomic storage.

Added electron/live-placement-save.ts coordinator and inspect-live-placement/save-live-placement IPC + preload/API types. Coordinator checks project identity, active preview start time before/after await, node instance, authored identity and current runtime coordinates; rejects drift rather than saving an unacknowledged position. Successful IPC save records prior room in existing room history. No runtime restart or pause side effects. Renderer Save control is NOT connected yet; next task is integrate source inspection into object inspection and expose explicit Save placement with pending/conflict/error states. Preserve temporary Apply/Undo semantics and use shared UI controls/UX contract.

Verification: generation build, Electron TypeScript build, renderer typecheck, and ESLint on all changed TS files passed. Expanded native scripts/smoke-live-bridge.mjs passes: real Godot inspect/move, temporary edit reset, explicit persisted save and restart, generated identity coverage, source conflict/Unity-Unreal exclusion, wrong-project/session/instance/drift rejection, preservation of unrelated content, and injected second-file write failure restoring both source files byte-for-byte. Smoke now imports desktop coordinator and requires current generation + Electron builds, in addition to tools/Godot. No native Unity/Unreal editor validation is implied by exclusion tests. All scratch artifacts remain E:-resident. No Godot/server sessions intentionally left running.

Remaining persistence work: connect UI and browser-test success/conflict/disconnect; verify room-history undo in integrated app (existing undo recompiles whole rooms); decide crash recovery journal for two-artifact writes; preserve fractional coordinates on later general recompiles (existing resolveEntityPlacements rounds); protect older general Godot-only room/world edit routes from foreign engines. Full application/game visual acceptance, Unity/Unreal native runs, GitHub upload and full modern gameplay production remain open.

## Live inspector Save placement UI — continuation
Connected source inspection and explicit Save placement in the production LiveRuntimeInspector. PreviewScreen passes its active session start ID. Inspect retrieves source snapshots for authored objects; unauthored children retain temporary runtime editing with clear save-unavailable feedback. Save uses acknowledged coordinates, is disabled for unapplied drafts/unchanged source positions, waits for desktop coordinator confirmation, refreshes the saved baseline, and invalidates stale source snapshots for other objects. Runtime Undo after Save remains temporary and keeps the new source revision. Failed save preserves coordinates and disables Apply/Undo/Save until reinspection, avoiding stale undo re-enabling a save.

Verification: renderer typecheck and changed-UI ESLint passed. Rebuilt native esbuild CLI harness and exercised real production React component against native Godot and production inspect/save coordinator (no mock responses). Browser verified native dropdown keyboard selection, unapplied draft Save disabled, acknowledged Apply enables Save, Save updates source baseline, runtime Undo leaves rooms.json at saved coordinates, source conflict prevents overwrite, Inspect recovers, and server disconnection preserves coordinates and disables all mutation actions. Screenshot inspected in 480px panel; no clipping observed. Updated UX-CONTRACT.md to reflect runtime amber/brown theme and explicit source save semantics.

Harness HTTP adapter now supports /session, /inspect and /save and exists only in Git-ignored scratch. Server session 34718 stopped after tests. Browser harness bypasses Electron IPC transport/history wrapper; full Electron UI and room-history undo still need integration coverage. Normal Vite service spawn EPERM remains unresolved; diagnostic native bundling does not prove production build. Next: integrated history/redo and fractional placement preservation, reduce runtime inspection RPC fanout if larger scenes warrant it, visual viewport editing and broader native engine/gameplay acceptance. Unity, Unreal, NVIDIA production quality and GitHub publication remain part of the full goal.

## Saved placement undo/redo and precision — continuation
Room history now records live-placement saves as targeted position commands. Undo/redo uses source revisions and saveAuthoredPlacement instead of regenerating geometry, and advances history only after success. Existing ordinary room snapshots can redo via a captured forward snapshot. Added redo-room-edit IPC/preload/API and Room Editor Redo room edit control. Room Editor now displays backend errors[] and catches rejected IPC calls. General room restore remains its old recompile path; full rollback of ordinary room/world edits is not proven.

Preserved fractional authored placement coordinates in resolveEntityPlacements (previously rounded during compilation). Added engine checks to older applyRoomEditAndRecompile/applyWorldEditAndRecompile so Unity/Unreal targets are rejected before any Godot writes. Native Unity/Unreal validation remains required; adapter exclusion is not a substitute.

Verification: generation and Electron builds, renderer typecheck and changed-file ESLint passed. Native smoke-live-bridge now exercises .25/.5 coordinates through scene generation, actual Godot moves, save, history undo/redo and restart. Source-conflict undo leaves history intact; multi-step undo/redo round-trips without changing unrelated scene content; source-save history operations do not mutate runtime. Two saves, two undos, two redos and one undo all passed. New Room Editor button has static validation only; full Electron visual/interaction coverage remains pending. Native smoke processes exited cleanly.

Next: validate integrated Electron room-history UI and ordinary-edit transaction behavior, address broader live session history/viewport selection, native Unity/Unreal setup, and GitHub authentication/publication. Keep full game/application and modern visual-quality goal intact.

## GitHub publication access update
Browser now confirms authenticated owner access to alexandnevaeh-dev/MetroForgeSis (Alexis Forrest). Remote main still has initial .gitignore/README only; integration/metroforge-unified is the development branch. Git schannel still fails SEC_E_NO_CREDENTIALS, but verified TLS works using OpenSSL with a PEM exported from existing Windows trusted root stores (43 PUBLIC root certificates). Trust bundle: E:\Metroforge\Recovery-Audit\work\windows-trusted-roots.pem. TLS verification was NOT disabled and no new trusted authorities were added.

Verified remote branch SHA: d126bd26b695f788110d3ec74b9d621506297743. Started separate publication clone at E:\Metroforge\MetroForge-Publish using --filter=blob:none --single-branch --branch integration/metroforge-unified and command-local http.sslBackend=openssl/http.sslCAInfo pointing to bundle. EXEC SESSION 81064 IS STILL LIVE at last poll, no new output. Metadata pack and HEAD exist; checkout blob fetch has tmp_pack_l9KOcH currently 0 bytes. Do not restart/reclone based on elapsed silence: poll session 81064 and inspect current state. Source recovery untouched. E: has about 1.999 TB free. Windows process command-line inspection via CIM is access-denied.

Publication candidate inventory (rg respecting .gitignore with --no-require-git, excluding node_modules/.git/.metroforge/.codex/dist/dist-electron) saved at Recovery-Audit/work/publish-candidate-files.txt: 4,893 files ~212 MB. Inventory is not yet credential-reviewed or reconciled and must NOT be blindly uploaded. Need clone completion, baseline comparison/recovery overlay review, credential/private-artifact screening, branch commit and authorized upload. Git CLI authenticated push is not yet established even though browser owner auth works; no credential extraction or token creation has been attempted.

## Publication checkout and commit ready — continuation
Initial clone session 81064 was deliberately stopped after verifying the original archive contains every remote blob; this was an evidence-based local hydration route, not a timeout restart. No Git processes remained; removed its exact stale .git/index.lock. Imported all 2,679 verified archive blobs with git hash-object --no-filters, read-tree HEAD and checkout-index; checkout was clean at d126bd26b695f788110d3ec74b9d621506297743. Branch codex/windows-recovery-live-edit now has local commit 5d7ba03 (Recover Windows development and add persistent live placement editing) in E:\Metroforge\MetroForge-Publish. No remote push yet.

Reconciliation: archive matched all remote blobs exactly. Candidate token patterns in five test files were confirmed synthetic (test/fake markers). Source overlay excludes templates/godot-metroidvania/qa/visual-polish (~149 MB local captures), review-artifacts/ENGINE_ENV.json and ENGINE_ACCEPTANCE.json; ignore rules were added in recovered source too. Runtime assets and source remain. Existing upstream tracked .metroforge metadata stayed unchanged. Commit has 440 changed files including docs/WINDOWS_RECOVERY_VALIDATION.md; no deletions. Reports: publish-reconciliation.json, publish-overlay.json, publish-whitespace-check.log, publish-commit.log under Recovery-Audit. Some source line-ending normalization occurred; mixed upstream conventions and pre-existing whitespace warnings remain, not claimed clean. Preserved source semantics, built generation/Electron, typechecked renderer and reran native live/save/history smoke successfully after staging.

Git TLS verified with command/repo-local OpenSSL and existing Windows trusted roots PEM; no verification bypass. Network and E: filesystem permissions were granted SESSION scope in current environment. Browser is owner-authenticated, but noninteractive Git push cannot obtain credentials (shell signal-pipe error); direct standard Git Credential Manager get also found no usable credential. No credential values printed, no token created, no auth permissions approved. Requested user complete standard PowerShell sign-in: & 'C:\Program Files\Git\mingw64\bin\git-credential-manager.exe' github login --username alexandnevaeh-dev --browser. Await answer; continue independent development. After login, push the prepared branch and create/attach a PR against integration/metroforge-unified, preserving the verified base.

Next independent build lead: scripts/desktop-build.mjs compiles Electron then Vite (blocked by Node esbuild piped child spawn). Native esbuild CLI successfully bundles renderer. apps/desktop/src has no import.meta.env/raw/worker special imports and no public directory detected. Could implement an explicitly selected native production build path with valid file-relative HTML/assets and proper Electron preload bundle, then validate actual Electron startup/IPC. Inspect Electron sandbox/preload module requirements before claiming success. Do not silently substitute diagnostic renderer output for release validation.

## Native desktop build and Electron bootstrap diagnosis — continuation
Added explicit scripts/desktop-build-native.mjs and desktop:build:native command. Resolves Vite's installed esbuild/native optional package rather than hardcoding pnpm version, invokes CLI with inherited stdio (avoids service pipe EPERM), runs renderer and Electron typechecks, produces production-minified file-relative HTML/JS/CSS and bundled preload.cjs. Staged evidence is retained under .metroforge/desktop-build and excluded from Git. Vite now uses base './' and cjs preload output too. Main prefers preload.cjs and keeps sandbox/context isolation enabled. Native build passed with 385.4KB JS, 69.5KB CSS and 9.1KB preload. Changed-file ESLint passed.

Installed pinned Electron 33.4.11 using its official npm install.js/checksums and existing trusted roots via NODE_EXTRA_CA_CERTS. Binary and download cache are on E:. No dependency version changed. Installed path apps/desktop/node_modules/electron/dist/electron.exe now exists.

Added opt-in desktop-smoke.ts observations and scripts/smoke-desktop.mjs (smoke:desktop): hidden actual production application, normal App getVersion IPC observation, renderer load requirement, explicit failure hooks/timeout, isolated E:-resident profile/temp/data and JSON/log evidence. Main imports IPC handlers after app readiness and reports startup dependency failures clearly.

Native startup FAILED: Electron exit 0xC0000005 (3221225477 / signed -1073741819) before app readiness. Minimal CommonJS app probe writes 'main module loaded' then fails before whenReady, including --disable-gpu diagnostic. Node-only Electron mode succeeds (Node20.18.3, Chrome130). This is pre-MetroForge Chromium/Electron startup failure in current environment; do not claim exact root cause, GPU fault, or full production execution. No sandbox disabling attempted. Logs: Recovery-Audit/desktop-native-smoke*.log; electron-bootstrap-probe.txt; electron-bootstrap-software-probe.txt. Canonical smoke failure evidence: .metroforge/desktop-smoke/1789945949701/result.json. Launched processes are terminal; none intentionally left running. Original installer session35723 completed; first smoke12661 stopped via own process; second2133 exited access violation.

Git sign-in user question remains pending. Publish branch needs subsequent changes synchronized and committed (same verified base). Full application/game quality, native Unity/Unreal runtime testing and GitHub push/PR still open.


## E-resident native validation and Unity setup — continuation
Publication checkout now includes commit 0b95595 for the native desktop build and startup diagnostics; still not pushed because Git sign-in is pending.

Added scripts/validate-native-engines.ps1 and docs/NATIVE_ENGINE_VALIDATION.md. Wrapper rejects non-E storage/test projects before creating files and redirects temporary/app data, Unity UPM/Bee and Unreal DDC/Zen caches to E. Actual wrapper run reports generated/static gates passed for both fixture projects; all native runtime/build stages blocked by missing editors. Evidence: Recovery-Audit/native-validation/20260920-231724-444. C-drive storage rejection check passed. Visual Studio compiler setup also absent from the standard installation locations checked.

Hardened Unity capture evidence: current play report must list nonempty, fresh PNG-header/dimension-checked files confined lexically to its capture folder before pending_review is reported. Existing/empty folders, missing/stale files, invalid headers and outside paths fail. This is evidence availability, not image decoding or visual approval. Focused platform/play/capture tests and JavaScript syntax check passed; no native Unity execution is implied.

Official Unity 6000.3.0f1 Windows installer download is IN PROGRESS in exec session 41916. Target E:/Metroforge/Recovery-Audit/downloads/unity/UnitySetup64-6000.3.0f1.exe (partial .exe.part). Total 4,131,048,704 bytes; last checked 1,307,574,272 bytes. Do not restart while session remains live. Download script writes SHA256 metadata on completion. Verify Authenticode before executing. No installer run or license accepted. Source URL https://download.unity3d.com/download_unity/d1870ce95baf/Windows64EditorInstaller/UnitySetup64-6000.3.0f1.exe verified from official Unity release page. Existing Windows trusted-root PEM used for TLS. Epic launcher requires user sign-in/license acceptance; not yet downloaded or installed. Native editor tests, local NVIDIA follow-up, full game quality and GitHub publication remain open.


## Ordinary room edit rollback - continuation
Added a rollback boundary around applyRoomEditAndRecompile. Snapshots rooms.json and target scene, restores exact bytes after returned compilation errors or thrown write/compiler exceptions, removes scenes newly created by a failed edit, reports rollback errors explicitly, and rejects unsafe room identifiers before accessing scene paths. This is synchronous error rollback, not crash-safe atomic commit; ordinary world edits remain outside this boundary. Generation TypeScript build via existing node_modules/typescript/bin/tsc passed. pnpm wrapper tried dependency reconciliation and aborted before removal (NO_TTY); do not force reinstall. New scripts/test-room-edit-rollback.mjs passed with generated fixture, injected errors/exceptions and success branch; actual Godot smoke-live-bridge also passed. Native Unity download session41916 still LIVE, last observed 1,956,642,816 / 4,131,048,704 bytes. Continue polling same session. Git authentication still pending.


## Authored tile erasure persistence - continuation
Added tileCellsAuthored to Godot room options/published data. Explicit Studio tileCells including [] mark authored paint; later recompiles retain these cells instead of procedural regeneration. Scenes serialize [] and authored_cells=true. RoomTileMap routes authored data through an exact paint function, avoiding procedural atlas variation/filtering/backfill. Existing floor and shell collision is separate and unchanged; this is visual paint, not full collision authoring. New scripts/test-authored-tile-persistence.mjs verifies actual assembler nonempty/empty writes and resize persistence; optional GODOT_EXECUTABLE runs scripts/fixtures/authored-tile-runtime.gd to verify exact atlas choice and clear-all on actual TileMapLayer. Both passed along with generation/Godot TypeScript builds and live-bridge smoke. Godot logged its pre-existing Windows root-certificate store error but tile test exited zero. Full editor interaction/visual review still pending.
Prior turn inspected CUDA probe image and rejected production approval (dense texture, unclear playable depth); audit gpu-probe/visual-review.json records evidence. Current NVIDIA driver query passed; no new inference that turn. Unity download session41916 continues, last observed 2,997,878,784 / 4,131,048,704 bytes. Poll same live handle, verify Authenticode on completion, do not run installer silently through license acceptance.


## Tile editor hit target and save recovery - continuation
TilePaintEditor painted overlay now ignores pointer events so underlying cell receives center clicks. Save guards duplicate submissions, catches rejected IPC, clears busy state in finally, preserves draft, reports backend errors[], and ignores responses after unmount. RoomEditor keys tile editor by project/room. Updated updateRoom API type to expose backend errors. Renderer typecheck and changed-file ESLint passed. Browser test using actual component with mocked rejected updateRoom confirmed center erase sends tileCells:[], shows injected failure and re-enables Save. This is UI evidence, not Electron/backend integration. E audit tile-ui-audit.json records strict audit failed with 17 existing contract/static findings outside this patch; full UI acceptance remains open. Temporary browser harness is ignored under .metroforge/live-inspector-harness; server session54069 should be stopped after test.
Unity DOWNLOAD COMPLETE, session41916 terminal exit0. Official installer E:/Metroforge/Recovery-Audit/downloads/unity/UnitySetup64-6000.3.0f1.exe is 4,131,048,704 bytes; metadata SHA256 1629b8e701ad1b4f5576d6f912fcc1e82aaacee56bfbafa75a4d3eb62a1190ac. This is a self-computed hash, not vendor comparison. Authenticode check session95573 is still live with no output; poll before installer execution. No installation/license acceptance performed. Browser open took a long tool-side wait but returned successfully; do not restart download.

Unity signature follow-up: session70499 completed; Authenticode Valid, signer Unity Technologies SF, signature evidence downloads/unity/signature.json. Initial session95573 output formatting hid status so a structured check was used. Browser tile test tab closed and server54069 stopped. Requested user run verified installer on E: and complete license activation because native installer UI is unavailable here; await installed Unity.exe path. Publication latest commit f837b53; upload remains pending Git authentication.


## Actual artwork in tile paint canvas - continuation
Replaced synthetic hue tile markers with cropped SVG references to the actual atlas. Shared useTilesetArtwork handles image decoding, natural rectangular dimensions, missing/rejected artwork and stale requests for palette and canvas. Palette uses true rows/columns and dynamic grid cell size; RoomEditor passes tileSize to both controls. Existing fixture source atlas is 256x192, so prior fixed128 square assumptions were incorrect. Browser actual-component harness with real embedded template PNG showed metal panel artwork; center erase through image sends [] and rejected save remains recoverable. Mock IPC in harness only, not full Electron evidence. Typecheck and changed-file ESLint passed. Existing strict UI audit issues remain. No new dependency or download.


## Keyboard tile authoring - continuation
Added one roving tab stop to tile canvas, labelled SVG button cells, arrow-key navigation with bounds clamping, Enter/Space painting/erasing, busy guard reuse and token-based focus outline. Browser actual-component fixture verified Enter erase, Right navigation, Tab directly to Save, Tab back into remembered cell, Space paint and visible focus over artwork. This is browser component evidence with mocked IPC, not full Electron accessibility certification. Renderer typecheck and changed-file ESLint passed. Goal remains active; Unity install/license and Git login answers still pending.


## Room patch validation - continuation
Room edit boundary rejects null/unsafe room IDs, nonpositive/fractional/nonfinite dimensions, invalid boolean/list inputs, negative/fractional tile coordinates, duplicate occupied cells and nonfinite entity positions before taking write snapshots or compiling. Extended rollback test verifies 13 invalid inputs leave exact source/scene bytes unchanged and never invoke assembler. Generation TypeScript build, rollback/validation test and actual assembler authored-tile persistence test passed; native Godot subtest explicitly skipped this turn (no executable env), earlier native evidence still separate. No claim of full schema or gameplay validation.


## Integrated desktop rebuild - continuation
Rebuilt current editor changes with node scripts/desktop-build.mjs --native: renderer and Electron typechecks plus native bundles passed (387.5KB JS, 69.6KB CSS, 9.1KB preload). Build evidence .metroforge/desktop-build/1789953085324 and apps/desktop/dist/build-info.json. Follow-up node scripts/smoke-desktop.mjs FAILED with exit3221225477 (0xC0000005), empty startup.log; result .metroforge/desktop-smoke/1789953088933/result.json. No Application event1000 entries in preceding3hours were available via Get-WinEvent; fault module is still unknown. No security/sandbox flags changed. Do not claim integrated application runtime acceptance from passing bundles/browser component checks. All launched test processes terminal.


## Electron local crash capture attempt - continuation
Minimal CJS probe in Recovery-Audit/electron-crash-probe uses app.setPath(crashDumps,E audit path) and crashReporter.start({uploadToServer:false}) per official https://www.electronjs.org/docs/latest/api/crash-reporter. Probe reaches main loaded, then reporter fails with crashpad_client_win.cc(868) not connected; no dump generated. Authoritative node spawnSync run result exit4294930435, distinct from ordinary app startup 0xC0000005. Do not infer reporter failure is root cause of original crash. First direct PowerShell GUI invocation returned before process termination; its preliminary result was replaced by proper process-observed result.json. All probe processes terminal. No network crash upload, security changes or application runtime changes. Further native fault isolation requires another diagnostic path; application/game goal remains open.


## Full generated game runtime validation - continuation
Fixed smoke-godot.mjs undeclared root dotenv dependency by using Node builtin loadEnvFile (supported project Node baseline). LocalSpriteWorkerProvider now catches synchronous spawn errors as SPAWN_ERROR and handles stdin errors with termination, so local provider health failure is reported instead of crashing generation. Focused injected synchronous failure test scripts/test-local-worker-spawn.mjs passes for capabilities/generation; assets TypeScript build and provider ESLint passed.
Full LOCAL_ONLY smoke session25170 completed, producing GeneratedGames/metroforge-gameplay-validation-2026-09-21t01-15-43-323z, eight rooms and 138 assets, but validation FAILED: subprocess Godot import EPERM plus modern visual quality71/100 below gates. All image providers unavailable, procedural fallback explicitly degraded; not production art.
Direct PowerShell native Godot import then RuntimeSmokeTest execution both exit0 (sessions90922 and88338 terminal). Logs Recovery-Audit/gameplay-direct-import.log and gameplay-direct-runtime.log. Runtime emitted READY and RESULTS_END,195 PASS lines,0 FAIL,28 SOFT_FAIL. Soft failures include headless screenshots, music-playing check and absent optional shortcut/breakable wall. Root certificate store error, headless null textures and shutdown object leak warnings remain. This is real gameplay-system evidence, not screenshot quality or release certification. Current generated validation_report.json is NOT overwritten to turn failures green. Next: repair QA subprocess output capture for Windows and obtain actual rendering captures; native Unity/Unreal and Git sign-in still pending.


## Windows QA subprocess capture - continuation
Added packages/qa/src/process-capture.ts and connected Godot validator/gameplay-capture subprocesses. Windows launches use file descriptors for stdout/stderr instead of piped handles; logs stay under process temp (E under env.ps1), capture exit/error/signal, preserve stderr even for successful exec calls, enforce output limit as ENOBUFS failure, retain evidence. Non-Windows keeps ordinary spawn capture. No shell interpolation or sandbox changes. Focused scripts/test-qa-process-capture.mjs passed stdout/stderr, nonzero, missing executable, timeout and Windows output-limit cases. QA TypeScript build and changed-file ESLint passed.
Actual QAValidator now launches Godot successfully. Import gate still FAIL due Windows root certificate store error (not hidden). Runtime gate completed through repaired launcher:196/223 PASS,27 soft failures,exit0,READY true; state SOFT_FAIL, not full acceptance. Report Recovery-Audit/qa-captured-runtime.json. Session63460 terminal. Existing generated validation report unchanged. Next rendering capture can now use same file-backed subprocess adapter; full visual-quality/Unity/Unreal/Git requirements remain open.


## Native NVIDIA gameplay rendering and captures - continuation
Repaired QA adapter enabled real windowed capture of generated eight-room game. First run exit1 exposed smoke helper missing PRESENTATION_CAPTURE from HUD-mode recognition; GameHUD already recognized it and intentionally cleared currency/collectible labels. Added that mode to RuntimeSmokeTest helper (normal DEBUG functional assertions retained) and updated disposable generated fixture test script. Rerun session99144 terminal exit0 in27.8s,20 named gameplay PNGs,nonblank/decode success,267 colors for gameplay screenshot. Renderer log confirms D3D12 Forward+ on NVIDIA GeForce RTX5060 Laptop GPU. First log temp/metroforge-qa-process-ugyZzH/stdout.log; latest capture telemetry Recovery-Audit/gameplay-windowed-capture.json and generated qa/capture_telemetry.json. Player idle screenshot inspected: player and foundry recognizable, composition/art remain prototype and not production-approved. Native rendering proof does not resolve Unity/Unreal or full desktop runtime.
Known next QA concern from source inspection: gameplay capture currently sets windowed strategy from decodable/nonblank file alone, even on nonzero exit or stale image; harden freshness/exit checks and telemetry start timestamps before relying on certification. Existing generated static/modern validation report remains failed, not overwritten.


## Fresh capture evidence gate - continuation
Gameplay capture now requires exit0, no timeout, decoded/nonblank image and file modification timestamp from current attempt. Records actual windowed start time and screenshotFresh. Existing headless output/image cannot masquerade as a newly successful capture; fresh headless runs keep current telemetry instead of inheriting prior windowed success. Validator returns FAIL for failed/thrown capture instead of inspecting a stale screenshot and possibly passing. Focused evidence tests cover stale/blank images, nonzero/null exit, timeout and optional-gate failure propagation. QA TypeScript and changed-file ESLint passed; native RTX capture session86007 exit0,26.9s,20 shots,fresh=true,nonblank=true. Evidence Recovery-Audit/gameplay-windowed-capture.json. This validates capture freshness only, not production art quality or complete acceptance.


## Player HUD visibility and layout - continuation
Normal PLAYER/RELEASE modes now retain abilities, currency and collectible counts; only QA_CAPTURE/PRESENTATION_CAPTURE suppress those labels. Fixed MarginContainer upward growth that moved the health bar above the viewport as labels appeared. Container grows downward and textured frame follows content size. Runtime smoke adds on-screen health/frame checks and explicit capture-hidden assertions, and functional labels must be visible as well as contain real state.
Actual windowed NVIDIA Godot PLAYER run exit0 with health/frame/currency/collectible checks passing; screenshot visually inspected and saved at Recovery-Audit/player-hud-checkpoint.png (health, dash, scrap, echoes visible). PRESENTATION_CAPTURE rerun exit0 with health/frame and hidden-label checks passing. Logs player-hud-runtime.log and capture-hud-runtime.log in Recovery-Audit. Player run preceded the final strengthening of label checks from text to visible+text; screenshot verifies visibility. Existing root-certificate error, music soft failure, absent optional shortcut/breakable and shutdown warnings remain. Generated capture_telemetry.json predates these manual runs and must not be used to describe them. Full application/game, production art quality, native Unity/Unreal and GitHub authentication requirements remain open.


## World editor failure rollback - continuation
World edits now snapshot both world graph copies, rooms.json and room scenes before mutation, restore existing bytes and remove newly created files after write/compile failure. Failed results omit the proposed graph and report no recompiled rooms. Rejects unsafe room identifiers and nonfinite layout positions before mutation. Compilation success=false is honored even when errors is empty. This protects ordinary failed edits; not crash-atomic or concurrent external-writer isolation.
Validation: generation TypeScript build and changed-file ESLint pass. scripts/test-world-edit-rollback.mjs passes injected reported/thrown/empty-error failures, existing runtime graph restoration, new graph/scene cleanup, invalid inputs and successful duplication using the real assembler on disposable E-temp fixture. Full project/game completion remains open.


## Preserve authored room dimensions - continuation
Reproduced with real assembler: resize to width1232/height736 followed by tile paint reset width to720. Recompilation now falls back to saved room width/height when no explicit dimension override is supplied, so painting, door recompilation and duplication retain room bounds. Extended authored-tile-persistence test verifies original and duplicated dimensions and cells; test failed before fix and passes after. World rollback regression, Godot package TypeScript and changed-file ESLint also pass. Optional native tile test skipped this run; evidence here is real scene/data assembly, not new native engine validation.


## Persist regular enemy removal - continuation
Reproduced actual assembler failure in generated enemy room: enemies=[] left Enemy node in scene. Room edit now derives explicit enemy presence from edited enemy list; assembler persists forceEnemy and consumes it during future recompiles. Removing last regular enemy remains removed after resize and world duplication; explicitly enabling again survives subsequent edits. Extended authored persistence test now selects a real enemy room (spawn room would mask bug), inspects scene nodes and room records, and passes after failing before fix. Godot/generation TypeScript and changed-file ESLint pass. This fixes regular enemy presence, not arbitrary multi-enemy/NPC roster fidelity or native engine acceptance; those remain to audit.


## Multiple authored enemy instances - continuation
Room scene generator now emits all authored regular enemy placements (first node keeps Enemy name, additional nodes Enemy_N), persists their roster and keeps per-instance authoring metadata/coordinates. Optional definitionId separates shared enemy content/assets from unique instance id. Placement normalization preserves definitionId; editor duplication assigns a unique copy id and retains source definition. Extended real assembler regression checks second node, position, identity, asset reuse, roster and definition persistence across resize. Godot TypeScript, desktop typecheck and changed-file lint passed. Native gameplay multi-enemy run and browser interaction verification remain outstanding; NPC duplication and arbitrary content roster fidelity still need implementation/audit.


## Native multi-enemy validation - continuation
Added scripts/test-native-enemy-instances.mjs: copies an existing generated game to disposable E temp, saves two authored enemy instances through the actual edit/assembler path, launches real windowed Godot with file-backed output capture, and asserts shared nonempty definition, distinct authoring IDs, 120px authored separation, walk frames and rendered viewport. Run exit0, NATIVE_ENEMY_RESULT failures=[] instances=2. Renderer reports Vulkan1.4.351 Forward+ on NVIDIA GeForce RTX5060 Laptop GPU. Evidence: Recovery-Audit/temp/metroforge-native-enemies-WLp5K2/native-enemies.log and native-enemies.png. Screenshot inspected: two distinct visible enemy sprites. Test freezes enemy physics for initial layout capture; does not certify combat behavior or modern art quality. Root certificate store diagnostic persists. Unity/Unreal and browser duplication interaction remain outstanding.


## Native duplicate enemy damage/death - continuation
Extended native-enemy-instances test to invoke actual HurtboxComponent.receive_hit for nonlethal then lethal damage. Verifies independent health, death-animation completion/removal of only the defeated instance, survivor full health and exactly one enemy_killed event with shared content definition id. Native windowed run exited0 with failures=[] on RTX5060; evidence Recovery-Audit/temp/metroforge-native-enemies-DtbWnO/native-enemies.log. This exercises hurtbox signal/controller/health/death chain directly, not player input or physics collision delivery. Physics stays frozen for deterministic instance isolation; broader combat playtest and complete product quality remain open.


## Duplicate placement save round-trip - continuation
Native multi-enemy harness now saves only duplicate coordinates through live-placement-save service, rejects stale revision, undoes and redoes position via current revisions, asserts original placement byte-equivalent data and copied definitionId retained, then reloads scene in native Godot. Run exit0 failures=[]; authored separation152px verified, shared definition/artwork and independent damage/death still pass. Evidence Recovery-Audit/temp/metroforge-native-enemies-M2wnOu/native-enemies.log. This covers persistence service and native reload; it does not substitute for browser UI or live runtime command/ack bridge interaction. Existing root certificate diagnostic remains.


## Integrated desktop rebuild and separate runtime comparison - continuation
Latest native desktop build passes: .metroforge/desktop-build/1789955534476 (387.6KB renderer,69.6KB CSS,9.1KB preload). Installed Electron33 native smoke still fails0xC0000005, report .metroforge/desktop-smoke/1789955566540/result.json. Official https://releases.electronjs.org/?channel=stable identified44.4.3; downloaded official GitHub release ZIP and SHASUMS256 to Recovery-Audit/downloads/electron-44.4.3, using existing trusted roots (no TLS bypass). ZIP158247567 bytes, verified SHA256790a355b684d5c7cc8dc3cdd8c4cca7c4b2d054685427c7554a956879a82e70b. Separate extracted runtime also fails0xC0000005 with empty startup log, .metroforge/desktop-smoke/1789955761121/result.json. No dependency upgrade applied. Runtime upgrade alone did not fix startup; cause remains unproven. smoke-desktop.mjs now accepts METROFORGE_ELECTRON_EXECUTABLE for isolated comparisons and records executable in report. All processes terminal; downloads and outputs on E. Full desktop runtime acceptance still blocked.


## Authored NPC roster persistence - continuation
Recompilation now uses saved NPC membership including empty rosters, resolves copied instances through definitionId against content definitions, and keeps instance IDs for authoring metadata while runtime npc_id and artwork use the shared definition. Room duplication can retain NPCs even when the original content definition belongs to another room. Missing definitions fail explicitly and trigger existing edit rollback. New test-npc-edit-persistence.mjs passes shared-definition duplication, geometry recompilation, room duplication, removal persistence and unknown-definition rollback using actual assembler. Godot TypeScript/lint and existing authored enemy/tile regression pass. Native NPC interaction and full editor UI verification remain outstanding; full goal still active.


## Native duplicated NPC dialogue - continuation
Added test-native-npc-instances.mjs: copies real generated project to E temp, duplicates NPC through edit service, launches windowed Godot and checks shared definition, unique copy authoring identity, same nonempty dialogue resolution, actual overlay opening/context/text, close unpauses gameplay, and original remains interactive. Exit0 failures=[] on Vulkan RTX5060. Evidence Recovery-Audit/temp/metroforge-native-npcs-LpMYRJ/native-npcs.log and native-npcs.png. Dialogue screenshot inspected: expected Ashen Reed speaker and Awakening request visible. Test invokes NPC talk method directly, not proximity/player-input delivery; camera is not settled before immediate dialogue pause, so screenshot is functional overlay evidence, not scene-composition approval. Root certificate diagnostic remains.


## Enemy placement identity selection - continuation
Place enemy no longer invents enemy_N from room count. It reuses the selected room/project existing regular enemy definition, preserves definitionId, and allocates an unused authored instance ID. Empty projects receive actionable error instead of unsupported placement. Duplicate action uses same collision-free ID helper. New test-entity-authoring.mjs passes copied definition reuse, empty-room fallback, boss exclusion and repeated ID collision cases. Desktop typecheck, changed-file lint and native build pass (.metroforge/desktop-build/1789956331549). Browser interaction still unverified; native Electron startup remains blocked as documented. Candidate definitions come from saved project room references, not a full content-catalog picker; catalog selection remains future work.


## Entity identity validation - continuation
Room edits reject unsupported entity kinds, empty/unsafe instance identifiers, malformed optional definitionId and repeated kind+id identities before filesystem mutation. This prevents ambiguous live selection metadata and invalid asset references from malformed placement requests. Expanded rollback test covers these inputs and verifies unchanged source bytes/no compilation. Generation TypeScript/lint, authored enemy/tile persistence and NPC persistence regressions pass. No new native runtime claim; application/game goal remains incomplete.


## Explicit full room regeneration - continuation
Full Regenerate Room previously sent an empty edit patch and retained authored state. It now clears only the selected stored room record inside existing rollback wrapper before real procedural recompilation, rebuilding bounds/paint/instances from world graph and game content. Ordinary edits retain authored data. Actual assembler regression proves authored flag/bounds/copied enemy reset and sibling unchanged; injected failure proves room data and scene restored. Generation TypeScript/lint and persistence/rollback tests pass. Encounter/geometry-specific regeneration semantics still need review. Git Credential Manager github list returned no account; no Unity/Unreal executables found through configured E Engines directory or PATH. Authentication/editor setup still pending, goal remains active.


## Preserve authoring mode during undo - continuation
Actual snapshot restore regression failed: generated tileCells became tileCellsAuthored=true because restore replayed them as a paint patch. Restore now reinstates saved room record inside rollback wrapper before recompilation, preserving procedural vs authored semantics and definition-bearing instance placements. Extended real assembler test restores authored snapshot after full regeneration, then original procedural snapshot; passes after failing before fix. Generation TypeScript/lint and rollback regression pass. Native editor undo interaction remains unverified.


## Geometry-only regeneration - continuation
Geometry scope no longer substitutes width800/height600. It clears stored paint/authored geometry fields inside transaction, then generates layout while retaining saved bounds, NPC membership, enemy choice and entity placements. Full regeneration still replaces complete room record. Extended real assembler checks preserve both dimensions and exact placement array while replacing authored paint; snapshot restore and rollback regressions, generation TypeScript and lint pass. Native runtime/UI geometry action remains unverified; encounter-specific regeneration still needs review.


## Encounter-only regeneration - continuation
Encounter regeneration now releases explicit enemy presence and replaces combat placements with procedural defaults while retaining noncombat placements, saved NPC roster, room bounds and authored paint. It no longer simply enables one enemy without replacing copied combatants. Unknown scopes rejected. Real assembler regression verifies painted cells/authoring flag/bounds/noncombat positions preserved, copied combatant removed and generated combatant present. Rollback injected-failure test covers full/geometry/encounter. Godot/generation TypeScript and changed-file lint pass. Native/UI scoped regeneration remains unverified.


## NPC proximity and input validation - continuation
Native NPC harness now places player body within each NPC area, waits physics frames for actual body_entered/range detection, then submits InputEventAction interact press/release through Godot input delivery. No direct talk calls. Both original/copy open correct dialogue with shared definition and distinct authoring identity, closing resumes gameplay. Exit0 failures=[] on RTX5060; evidence Recovery-Audit/temp/metroforge-native-npcs-j8hmLX/native-npcs.log. Player motion is frozen and placement is test-controlled; this validates proximity/input/overlay chain, not navigation/controller traversal to NPC.


## NPC acting sheets follow definition - continuation
Generated NPC scenes previously overrode walk only; inherited template idle/talk/listen paths remained npc_000. Assembler now overrides extra_animation_sheets for all three acting animations using shared definitionId (or legacy id). NPC persistence regression introduces a second content definition and verifies all four generated paths reference it, never instance ID. Godot TypeScript and lint pass. This proves scene wiring; alternate-definition artwork/native visual playback still requires actual assets and runtime validation.


## Full recompiled game integration - continuation
Added test-native-recompiled-game.mjs to copy generated fixture to E temp, recompile every room using current assembler/context and launch windowed PLAYER-mode RuntimeSmokeTest with file-backed logs. All8rooms recompiled; native Vulkan RTX5060 run exit0,247PASS,0FAIL,3SOFT_FAIL. Soft failures: music playback after entry, absent optional breakable wall and shortcut. Root certificate error persists. Evidence Recovery-Audit/temp/metroforge-native-recompiled-pE0LBL/native-recompiled.json and .log; checkpoint screenshot inspected, HUD visible and scene still prototype quality. Original generated validation report untouched. Functional integration does not certify production visuals, desktop startup, Unity/Unreal or complete product.


## Music loop endpoint fix - continuation
Native probe reproduced8s WAV with LOOP_FORWARD but loop_begin=loop_end=0; playing true immediately then false after0.5s. AudioManager now fills invalid loop endpoints using stream duration*mix_rate when looping requested, preserving existing valid loop points. Added music-loop-runtime.gd fixture. Native test passes beyond complete track duration and explicit stop. Full NVIDIA gameplay rerun with fixed script exit0,248PASS,0FAIL,2SOFT_FAIL (optional breakable/shortcut); original music soft failure resolved. Evidence Recovery-Audit/music-loop-runtime.log and audio-fixed-gameplay.log. Dummy audio driver verifies state, not audible mix quality; root certificate/leak diagnostics remain. Native recompiled-game runner now overlays current AudioManager template onto disposable fixture. Original generated source fixture unchanged.


## Audio during dialogue/menu pause - continuation
AudioManager now PROCESS_MODE_ALWAYS so its shared music/SFX/voice players remain active when dialogue/menu pauses scene tree. Extended music-loop-runtime verifies music processing and unpaused stream, active UI click during pause, full-duration looping and explicit stop. Actual native A/B: fixed exit0 PASS, removing process-mode line in disposable fixture exit1 FAIL pause interrupts music; fixed template restored afterward. Evidence Recovery-Audit/music-pause-runtime.log and music-pause-baseline.log. Dummy driver checks playback state, not audible mix; gameplay actors remain paused normally.


## Dedicated dialogue voice lifecycle - continuation
Dialogue voice now has a dedicated AudioStreamPlayer on SFX bus, separate from pooled effects. New voice stops prior clip, duplicates stream before disabling WAV looping, and overlay stops voice on line replacement and close. Native dialogue-voice-runtime fixture passes active playback during dialogue pause,12frames of SFX without voice theft, nonlooping WAV and close/line cleanup; log Recovery-Audit/dialogue-voice-runtime.log. Fixture uses existing music WAV as a deterministic voice surrogate, not speech quality evaluation. Dummy driver/root certificate/leak limits remain. Integrated runner overlays current AudioManager and DialogueOverlay templates.


## UI volume bus routing - continuation
play_sfx now assigns UI bus for requested ui_ sounds and SFX otherwise each time pooled slot is used. Previously every effect stayed on SFX despite separate UI setting. Native audio-bus-runtime passes UI click routing, same-slot reset to SFX for jump, and gameplay door alias remains SFX even though clip aliases ui_click. Evidence Recovery-Audit/audio-bus-runtime.log; dummy-driver routing proof, not listening/mix approval. Root certificate/resource shutdown diagnostics remain.


## Repeatable native audio suite - continuation
Added scripts/test-native-audio.mjs. Set GODOT_EXECUTABLE and invoke with generated game fixture path after E temp/cache environment; runner copies fixture to disposable temp, overlays current audio/dialogue scripts, runs all three GDScript fixtures with file-backed output, checks exit/pass marker/no script failures, and writes per-test logs plus audio-results.json including diagnostics. All3native tests passed exit0 in Recovery-Audit/temp/metroforge-native-audio-J3TuyZ. Certificate-store and shutdown resource warnings retained explicitly. Playback-state coverage only, no audible-mix approval or full release certification.


## Room editor asynchronous save handling - continuation
RoomEditor runRoomAction now uses synchronous ref guard to prevent overlapping actions, exposes saving feedback/aria-busy, clears pending state in finally and ignores result/error feedback after unmount or project change. loadRooms discards other-project results; project switch clears old room list and messages; initial loading errors caught. Empty error arrays fall back to readable failure text. Renderer typecheck, changed-file lint and desktop native build passed (.metroforge/desktop-build/1789958049127); interactive race verification still outstanding. Tile-paint own save path is separate. Native Electron startup blocker remains.


## Room save project-visit race verification

The actual RoomEditor and StudioProvider were mounted in a browser harness with delayed mock updateRoom responses. Before the fix, A -> B -> A allowed the earlier A save to show its completion message. A monotonically increasing project-visit counter now rejects those responses, including delayed listRooms and initial-load errors.

Interactive checks passed: two Place enemy clicks issue one request; switching projects discards the earlier completion; switching away and back also discards it; rejected saves show their error and permit a successful retry. Desktop TypeScript check and native bundle passed (.metroforge/desktop-build/1789959362612).

Scope: renderer behavior with mocked IPC. This does not validate native Electron startup, filesystem persistence, Unity, Unreal, or visual game quality. The local harness lives in .metroforge/live-inspector-harness/room-save.* on E:.


## Collision preview refresh and failure handling

RoomEditor now refreshes collision previews after rooms reload, including successful saves to the same selected room. It clears the previous overlay while loading and catches rejected preview requests into the existing empty-rect fallback. Effect cancellation prevents superseded responses from restoring old geometry. TypeScript and native desktop bundle passed; evidence .metroforge/desktop-build/1789959447293. Interactive delayed collision and rejection checks remain outstanding.


## Collision renderer interaction verification

Browser harness using production RoomEditor with mock IPC confirmed same-room saves increase collision request count (1 to 2). Injected rejection clears collision rects (1 to 0) and preserves editor operation. Fixed empty collision view to display the actual preview error; browser verified Collision preview unavailable: Injected collision failure. TypeScript passed. This verifies renderer behavior, not native IPC or collision correctness. Delayed response ordering remains untested interactively. GCM github list still returned no account; expected E:/Metroforge/Engines directory yielded no installations.


## Tile save refresh outcome

TilePaintEditor now awaits its async onSaved callback, holds the pending guard through refresh, and distinguishes a successful save followed by a failed room refresh from a failed save. Empty backend error lists now use the fallback error text. Browser harness with production editor and mock IPC verified the exact saved-but-refresh-failed status and re-enabled Save Tilemap button after injected listRooms rejection. TypeScript and native bundle passed (.metroforge/desktop-build/1789959623196). Native persistence was not exercised by this UI check.


## Native gameplay revalidation after editor fixes

Ran scripts/test-native-recompiled-game.mjs against the existing generated gameplay fixture with current assembler and audio/dialogue overlays. Report: E:/Metroforge/Recovery-Audit/temp/metroforge-native-recompiled-GDBxDS/native-recompiled.json. All 8 rooms compiled; native exit 0; 248 PASS, 0 FAIL, 2 SOFT_FAIL. Log confirms Vulkan 1.4.351 Forward+ on NVIDIA GeForce RTX 5060 Laptop GPU. Missing breakable-wall and shortcut fixtures leave those mechanics uncovered. Root certificate store and shutdown ObjectDB/resource diagnostics remain; missing SFX and corrupt-save warnings are exercised negative cases. This does not validate Unity/Unreal, audible mix (Dummy audio), Electron startup, or modern production visual quality.


## Verbose native shutdown investigation

Re-ran the GDBxDS native gameplay fixture with --verbose; process exited 0. Evidence: E:/Metroforge/Recovery-Audit/native-gameplay-verbose.log. Shutdown identifies res://audio/music/biome_0.wav (AudioStreamWAV) still in use, with AudioStreamPlaybackWAV and SceneTreeTimer instances also retained. This narrows the audio resource diagnostic but does not establish its root cause or prove a production memory leak. Next investigate music playback teardown separately from pending test/gameplay timers, using a baseline/candidate shutdown comparison. No runtime workaround applied.


## Audio teardown candidate comparison

In the disposable GDBxDS fixture only, added AudioManager._exit_tree to stop pooled SFX, voice and music players, clear their streams and clear the SFX cache. Native verbose run exited 0 with 248 PASS and no FAIL, but biome_0.wav and AudioStreamPlaybackWAV remained retained. Evidence: E:/Metroforge/Recovery-Audit/native-gameplay-teardown-candidate.log. Rejected the candidate as ineffective and restored fixture AudioManager from the production template. No production audio change made. Next isolate retained playback in a minimal music-only lifecycle before changing runtime ownership.


## Music lifecycle driver isolation

Minimal native scene using production AudioManager played biome_0 for 0.5s, asserted playing, stopped, cleared its stream and waited two frames. Dummy audio reproduced retained AudioStreamWAV/PlaybackWAV; WASAPI exited cleanly without those diagnostics. WASAPI log confirms active stereo 48kHz output. Evidence: E:/Metroforge/Recovery-Audit/music-lifecycle.log and music-lifecycle-wasapi.log. This narrows the resource warning to driver-dependent behavior in this reproduction; full-game timers remain a separate issue. Native gameplay runner now accepts METROFORGE_TEST_AUDIO_DRIVER (default Dummy) and records the selected driver, enabling full WASAPI comparison. Audible quality is not assessed.


## Full WASAPI gameplay comparison

METROFORGE_TEST_AUDIO_DRIVER=WASAPI full native runner completed on NVIDIA RTX 5060 Vulkan Forward+: 8 rooms, exit 0, 248 PASS, 0 FAIL, 2 SOFT_FAIL. Evidence E:/Metroforge/Recovery-Audit/temp/metroforge-native-recompiled-Bp3EIa/native-recompiled.json and .log. Unlike Dummy baseline, no resources-still-in-use error occurred. ObjectDB shutdown warning and root-certificate-store error remain. Audible mix quality was not evaluated. Runner now includes diagnostic lines and signal in JSON and rejects captured process errors or SCRIPT ERROR/Parse Error output; syntax checked, new guard not yet exercised by a fresh full run.


## Targeted mechanics regression fixture

Added --mechanics-fixture to native recompiled-game runner. It adds optional ground_slam down-edge and horizontal shortcut to a disposable copy, recompiles all rooms and requires explicit break/persistence/shortcut assertions. Run E:/Metroforge/Recovery-Audit/temp/metroforge-native-recompiled-4GWYat: WASAPI, 8 rooms, exit 1, 256 PASS, 1 FAIL, 0 SOFT_FAIL. Floor collision and breaking with ability pass; shortcut traversal passes. breakable_wall_stays_broken_after_room_reentry FAILS. Current fixture WeakFloor matches production template and uses parent node name plus target as key; root cause not established. This is an intentionally failing regression test, not a green release gate. Next instrument floor keys/state and reentry transition timing. New diagnostics/error guards executed during this run.


## Broken-floor persistence fix and native proof

Trace floor-persistence-trace.log showed first key room_006:room_007 saved true, but re-entry used @Node2D@91:room_007 and read false. Godot renamed the new root while the outgoing same-named room awaited deletion. WeakFloor now derives room identity from owning scene_file_path basename, falling back to node name only for non-scene instances. Existing generated room-id save keys remain compatible. Runner overlays current WeakFloor. Native WASAPI mechanics fixture E:/Metroforge/Recovery-Audit/temp/metroforge-native-recompiled-5jS3cK: 8 rooms, exit 0, 257 PASS, 0 FAIL, 0 SOFT_FAIL. Break, re-entry persistence and shortcut traversal all pass. Certificate-store and ObjectDB diagnostics remain. This does not prove Unity/Unreal or production visual quality.


## Broken-floor disk persistence verification

Extended native RuntimeSmokeTest to save after breaking a floor, clear in-memory broken_floors, load the save and re-enter the room. Runner now overlays current smoke-test script and requires the disk-persistence assertion in mechanics mode. Native WASAPI run E:/Metroforge/Recovery-Audit/temp/metroforge-native-recompiled-mtevbg: 8 rooms, exit 0, 260 PASS, 0 FAIL, 0 SOFT_FAIL. Save write/load and floor absence after reload all passed. This exercises actual save I/O within the same native process, not an OS process restart. Existing certificate-store/ObjectDB diagnostics remain.


## Stable decoration on room re-entry

RoomTileMap seeded architecture from runtime parent name, so two actual instances of room_000 yielded 3291913211 versus 3170656501 when Godot renamed the second @Node2D@28. Changed seed identity to owning scene filename, preserving original room-id seed. Native baseline FAIL became PASS with both seeds 3291913211. Evidence E:/Metroforge/Recovery-Audit/room-seed-baseline.log and room-seed-fixed.log. Retained fixture scripts/fixtures/room-decoration-seed-runtime.gd; full runner overlays current RoomTileMap. This proves deterministic seed across renamed instances, not visual quality approval.


## Transition detach candidate

Tested immediate remove_child before queue_free for outgoing rooms to remove stale scene groups. Native mechanics WASAPI run E:/Metroforge/Recovery-Audit/temp/metroforge-native-recompiled-U1El7Y passed 260 checks, zero failures/soft failures, but reported one retained resource in addition to ObjectDB warning. This diagnostic was absent in the prior WASAPI run; causality remains unknown. Withheld and reverted the production transition edit pending isolation. Runner now overlays current WorldManager so future comparisons use current template code. Candidate is retained only in disposable U1El7Y fixture for diagnosis.


## Preserve current room on failed destination load

WorldManager now checks destination existence and loads its PackedScene before tearing down the active room. Native missing-room fixture reproduced destruction before the fix and confirmed the original room remains attached/visible afterward. Evidence E:/Metroforge/Recovery-Audit/missing-room-baseline.log and missing-room-fixed.log; fixture scripts/fixtures/missing-room-runtime.gd. Initial room load also succeeded in this test. Full gameplay regression after this ordering change remains pending. No claim of recovery from scene-instantiation script errors.


## Full regression after destination preflight

Current WorldManager destination validation before teardown passed native mechanics run E:/Metroforge/Recovery-Audit/temp/metroforge-native-recompiled-yLcZ9Z: WASAPI, 8 recompiled rooms, exit 0, 260 PASS, 0 FAIL, 0 SOFT_FAIL. Covers existing transition/health/save tests and targeted ground-slam/shortcut/persistence checks. No retained-resource error this run; root-certificate-store and ObjectDB warnings persist. GCM github list remains empty; Unity.exe/UnrealEditor.exe not found on PATH. E: free space approximately 1.99 TB. Application and game production readiness remain incomplete.


## AI command failure recovery

CommandBar now catches executeAiCommand rejection, releases busy state in finally, and preserves typed input when execution fails. A synchronous pending guard suppresses duplicate submissions. Successful execution awaits onSuccess refresh and distinguishes applied-command/failed-refresh from execution failure. TypeScript and native desktop bundle passed (.metroforge/desktop-build/1789961112869). Interactive rejection/retry checks and cross-project response isolation remain pending; no native Electron runtime claim.


## Visible compact command outcomes

Browser checks confirmed rejected command retains input and re-enables Run, but revealed compact CSS hid all result/error messages. Compact bar now wraps status and alert text beneath controls and exposes live roles. Browser verified Injected command failure, retained input, successful retry, and separate Command applied / editor refresh failure text with mocked IPC. Cross-project response isolation remains pending.


## Honest edit-status polling

EditStatusBadge now starts CHECKING, reports UNAVAILABLE when bridge/status requests fail, ignores responses after project change/unmount, and schedules the next poll only after completion to avoid overlapping requests. Only confirmed CLEAN receives the success style. Browser with injected rejection showed status UNAVAILABLE. TypeScript and native bundle passed (.metroforge/desktop-build/1789961349489). Delayed cross-project response behavior remains untested interactively.


## Project-scoped command sessions

CommandBar now wraps an internal component keyed by projectPath. Switching projects resets command/input state; late execution responses cannot clear a new project input or invoke old refresh callbacks after unmount. Cleanup stops active speech recording, and recording/transcription continuations check mounted state. TypeScript and native bundle passed (.metroforge/desktop-build/1789961455394). Interactive delayed command and speech/project-switch checks remain pending. Existing in-flight backend commands are not cancelled and may still finish in their original project.


## Delayed command project-switch verification

Production CommandBar in browser harness with controlled executeAiCommand promise: submitted in A, switched to B, typed new project draft, resolved old command. New draft remained and no old completion appeared. Repeated B -> A -> B before resolving; returned project draft remained and Run stayed available. Both interactive cases passed. Backend mutation/IPC and actual microphone cancellation were not exercised. Harness remains on E: under .metroforge/live-inspector-harness.


## Speech cancellation and microphone cleanup

startSpeechRecording now remembers stop requests made before getUserMedia resolves and stops returned tracks without creating a recorder. A finally block releases tracks and timeout after normal stop, recorder errors, constructor failures or start failures. scripts/test-speech-recording.mjs passed with mocked media devices: pending cancellation creates no recorder, constructor/start failures each stop tracks, and normal stop produces a blob and releases tracks. Desktop TypeScript passed. These are lifecycle tests, not actual microphone/permission UI or audible capture verification.


## Foreign-engine room edit rejection without writes

Moved Godot adapter check before snapshot/rollback in applyRoomEditAndRecompile. Previously a rejected Unity/Unreal edit entered rollback and rewrote existing room data despite no mutation. scripts/test-foreign-room-edit.mjs verifies explicit rejection and unchanged bytes plus modification time for both engine manifests. Generation TypeScript build and test passed. This is adapter-boundary validation, not native Unity/Unreal compile or gameplay evidence.


## Foreign-engine edit boundary regression coverage

Expanded test-foreign-room-edit.mjs to cover room and world commands for Unity/Unreal via explicit engine manifest and native project fingerprints. Complete recursive file snapshot checks no files created, content changed or modification times touched. All four detection cases passed. Existing room rollback and world rollback suites also passed, including actual room duplication compilation. This does not provide native Unity/Unreal gameplay or compile acceptance.


## Rejected Godot edit timestamp checks

Expanded room rollback regression to assert modification times remain unchanged for invalid patches and a valid-shaped edit targeting a missing room. Missing-room rejection creates no scene. Suite passed alongside existing partial-write rollback and successful commit checks. Current rollback already compares original bytes before rewriting; this turn adds evidence, not a runtime behavior change.


## Live position redo control

Added one-step Redo position to LiveRuntimeInspector. Undo records runtime-acknowledged previous coordinates as redo target; redo creates the inverse undo entry. New apply or reinspection clears redo. Save placement refreshes inspection metadata for both history entries. TypeScript and native desktop bundle passed (.metroforge/desktop-build/1789961993693). Interactive/native apply-undo-redo verification remains pending; no claim of multi-step history.


## Native live position redo verification

Production LiveRuntimeInspector browser harness connected to actual headless Godot bridge. Selected Enemy at (92.25,73.5), applied X=120, Undo restored 92.25, Redo restored 120. Independent Inspect running scene confirmed X=120 and reset both history controls. Saved source stayed at (92.25,73.5); no persistence write requested. This validates browser UI -> harness transport -> native runtime acknowledgement, not native Electron shell or Unity/Unreal. Test tab and harness/native session stopped afterward.


### Preview control failure handling

Preview Stop now retains the live session when stopping fails or the API is unavailable. Launch, stop, pause/resume and editor-open promise rejections produce a visible alert. Successful Stop clears the runtime session identity and paused state. Confirmed the existing inspector key already isolates each project/runtime session. Desktop TypeScript check and native bundle passed (build evidence .metroforge/desktop-build/1789962562840). Interactive failure-path verification remains pending; this is not Unity, Unreal or Electron runtime evidence.


### Preview project isolation and polling

The preview content is keyed by selected project, resetting preview data, errors, selection, launch and live-session state on each project switch (including A-B-A). Old asynchronous handlers belong to the unmounted project view. Session polling schedules its next request only after the previous response, avoiding overlapping requests and stale response ordering. Missing session metadata clears prior embedding/live-edit notes. Desktop TypeScript and native bundle passed; build evidence .metroforge/desktop-build/1789962939521. Interactive project-switch and delayed-response checks remain pending.


### Preview control and session poll ordering

Play/restart, stop and pause/resume now share a synchronous pending guard and disable conflicting controls. Session polls capture a control revision and discard results overlapping any control request; rejected polls schedule the next check normally. Successful restart clears the previous inspector session identity. TypeScript and native bundle passed (.metroforge/desktop-build/1789963021793). Browser checks with actual PreviewScreen/StudioProvider and mock IPC verified: rejected Stop retains live inspector; held running poll released after successful Stop cannot restore running controls; rejected Open editor displays alert; switching to project B clears that alert and renders B. Fixture is .metroforge/preview-control-harness on E:, server stopped after checks. These are UI checks, not native-engine tests.


### Preserve inspector on transient status failures

A rejected getPlaytestSession poll no longer acts as a confirmed stopped session. The preview retains the last confirmed running state and inspector identity, displays an explicit retry warning, and retries serially. A successful current poll clears the warning and applies actual session state; stale control-overlapping failures are ignored. TypeScript and desktop native bundle passed (.metroforge/desktop-build/1789968031041). Interactive rejection/recovery verification remains pending.


### Preview punctuation repair

Corrected five malformed UTF-8 punctuation sequences in launch/loading text, room-count separator and absent metadata placeholders. Explicit UTF-8 reads/writes preserve the corrected ellipsis, middle dot and em dash. Desktop TypeScript passed. Unity installer launch is still awaiting completion of the active verification/launch command; no installer process confirmed yet.
