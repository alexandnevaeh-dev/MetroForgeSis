# Windows recovery and live-edit development snapshot

This branch continues integration/metroforge-unified at d126bd26b695f788110d3ec74b9d621506297743. The downloaded recovery archive matched all 2,679 Git blobs in that commit before the recovered overlay was applied. This is a development snapshot, not a completed application/game release.

## Included work
- Recovered source and runtime assets from the isolated Windows continuation, retaining upstream history.
- Portable native-engine acceptance reporting that distinguishes unavailable editors from successful tests.
- Engine-neutral live-edit transactions and a development-only authenticated loopback Godot bridge.
- Live object inspection, acknowledged positioning, temporary undo, explicit source saves, conflict checks, and saved-placement undo/redo.
- Stable authored placement identity, fractional coordinate preservation, and foreign-engine guards on Godot-only editing routes.

## Verification and limits
- Generation dependency TypeScript build, Electron TypeScript build and renderer typecheck passed on Windows.
- Native Godot smoke exercised request correlation, instance/project/session isolation, authored identities, fractional moves, save/restart, source-conflict rejection, I/O rollback, and multi-step saved undo/redo.
- Browser harness exercised the production inspector against actual native Godot and the save coordinator: keyboard selection, apply/save/temporary undo, conflict recovery, and disconnect states. Full Electron IPC/history UI verification remains open.
- Earlier local NVIDIA CUDA/inference checks passed; this does not approve generated assets for production visual quality.
- Unity/Unreal assembly/static checks exist, but native editor compile/play/build acceptance remains incomplete because those editors were not detected.
- Normal Vite/Vitest startup remains affected by Windows child-process spawn EPERM. Native esbuild CLI bundling was used diagnostically, not claimed as a completed production build.
- Existing whitespace conventions are mixed in the recovered source; whitespace-only review findings remain. Source-save rollback does not provide crash-safe atomicity across two files.

Local screenshots/capture sequences, dependency trees, caches, test sessions and machine-specific engine reports are excluded from this upload. Complete-game gameplay, asset quality, integrated editor acceptance and release packaging remain required work.

## Native desktop build path
`pnpm desktop:build:native` invokes the installed native esbuild executable directly, includes renderer/Electron typechecks, writes file-relative renderer URLs, and bundles a CommonJS preload. The default Vite path remains available. Electron's sandbox stays enabled; see https://www.electronjs.org/docs/latest/tutorial/esm for preload module requirements.

`pnpm smoke:desktop` launches the actual production application hidden with isolated local app data and records its exit code and startup evidence under .metroforge/desktop-smoke. It requires renderer-load and the real application's normal version IPC before passing. It does not certify all screens, gameplay or GPU rendering. Native build succeeds on this Windows host; Electron 33.4.11 currently crashes with 0xC0000005 before app readiness. A minimal app without MetroForge reproduces this, including with GPU rendering disabled; Electron Node-only bootstrap succeeds. Full native desktop execution remains unverified.
