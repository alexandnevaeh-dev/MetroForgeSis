# MetroForge room authoring and native HUD - 2026-10-04

Rooms now owns the full authoring workspace with one scene canvas, actual saved castle background and atlas tiles, keyboard cell movement, Select/Paint/Erase, and explicit Save/Discard. Drafts stay in this app session across room/project/route changes. Select and IME input never paint; busy saves block edits. No restart recovery is promised.

The backend rejects stale tile base snapshots and malformed cells before writing. Failure retains the draft and exits COMPILING with a DIRTY failure label. Undo restores the full room record and the compiled native platform geometry; ordinary recompilation preserves saved explicit platforms/pits, while a newly authored tile edit still replaces generated surfaces. A save acknowledgement race no longer clears feedback against a previous React render.

The native HUD grows down/right, wraps human-readable ability names within a bounded health frame, and moves quests below the stack. Actual zero/one/six-ability native layouts remain on screen; debug HUD stays visible.

## Verified

- Exact final portable: 28 real room IPC/canvas/paint/save/undo/conflict checks, including preservation of all 39 sibling room records and original collision rectangles.
- Same portable: 44 real API Keys UI/Windows encryption checks with synthetic credentials and local loopback endpoints; not live provider authentication or inference.
- Same portable: 24 actual navigation/library/room/asset/modal/IME/project-switch and narrow-layout checks; separate castle and Quantum games.
- 96 unit checks, workspace TypeScript/renderer typecheck and native desktop build passed. Strict premium audit has zero findings. DESIGN lint has one pre-existing missing-frontmatter warning, no errors.
- Native Godot 4.6 on RTX 5060: 19 controlled HUD checks and a separate strict ordinary-input 40-transition victory journey through 35 unique rooms, all four bosses and all six earned abilities, plus three cleared-arena returns. Normal fades, hit-stop, attacks and damage retained; no actor/health/door mutations or ability grants in the journey. All 632 media files unchanged.

Retained before-fix evidence covers full-record Undo loss, successful save acknowledgement loss, and native platform loss after Undo. Disposable UI fixtures are not promoted as gameplay sets.

The native journey and controlled HUD have zero native/script errors but retain an ObjectDB instances-leaked exit warning. Dummy audio is not listening acceptance. Optional/ending room traversal, modern distinct guardian art, fresh provider generation, and Unity/Unreal native acceptance remain open.

The supplied level references are recorded in docs/design/stormglass-spatial-references-20261004.md. Larger connected halls and modular architecture are the next redesign; this release does not claim to have rebuilt the castle rooms.

All dependencies, proofs, backups and portable artifacts remain on E:. Canonical HEAD and dirty Git index remain untouched. Environment keys are referenced through the launcher, never copied into the release or verification material.
