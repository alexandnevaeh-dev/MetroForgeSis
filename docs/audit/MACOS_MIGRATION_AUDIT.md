# macOS / Apple Silicon migration audit — final report (2026-09-04)

Baseline: commit `aae921d0` on `feature/claude-generation-runtime`, plus the pre-existing
uncommitted working tree (Godot-discovery/cross-platform work, packaging/readiness fields, a
line-ending normalization pass, and vendored skill/model files). No commits, resets, or stages
were made to that pre-existing work; this session added one source fix, evidence files under
`artifacts/macos-migration-2026-09-04/`, and this report. Full evidence index:
[`artifacts/macos-migration-2026-09-04/INDEX.md`](../../artifacts/macos-migration-2026-09-04/INDEX.md).

## What changed this session, and why

| Change | File | Why |
|---|---|---|
| Re-sign the assembled macOS `.app` bundle before verifying it | `packages/tools/src/project-export.ts` | `codesign --verify --deep --strict` was failing on every macOS package export (`code has no resources but signature indicates they must be present`). Root cause: Godot's export template ships pre-signed under its own Developer ID; that signature covers only the raw executable, not the bundle MetroForge assembles around it (icon, `.pck`, `Info.plist`). Fix: ad-hoc re-sign (`codesign --force --deep --sign -`) the whole bundle after assembly, before verifying it. |

Everything else reported below (native Godot discovery, the `ELECTRON_RUN_AS_NODE` desktop fix,
the `.debug-user-data` dashboard filter fix, the Windows-only export-selection fix, the
godot-resolver test flake fix) was already present in the working tree from earlier in this
migration and was re-verified rather than redone.

## Checks run against the final tree, with actual results

| Command | Result | Notes |
|---|---|---|
| `pnpm build` | ✅ exit 0 | |
| `pnpm typecheck` | ✅ exit 0 | 14 project references, all clean |
| `pnpm lint` | ✅ exit 0 | |
| `pnpm test` (full suite) | ✅ **153 files passed, 1 skipped, 1000/1000 tests passed** | Re-run from scratch this session after the fix; process exited cleanly with no lingering `vitest`/`esbuild` workers (see "Test-runner shutdown" below) |
| `pnpm desktop:build` | ✅ exit 0 | Electron main + preload + renderer all build |
| `node apps/cli/dist/index.js export metroforge-macos-arm64-audit --macos --force` | ✅ `PACKAGE_SUCCEEDED`, `binaryVerified: true`, `launchVerified: true` | Real end-to-end run through the fixed code, not a unit-test mock |
| Export failure paths (bad preset, missing Godot, nested output dir, conflicting `--windows --macos`) | ✅ all fail with real non-zero exit and no output artifact | Re-verified live this session for the nested-output and conflicting-flags cases |

**Test-runner shutdown:** the earlier concern about `pnpm test` needing a manual kill did not
reproduce in this session. The full suite (started fresh, PATH fixed) exited on its own after
printing the summary, and `ps aux` immediately after showed no orphaned `vitest`/`esbuild`
processes. If the shutdown hang recurs, it correlates with the previously-failing
`godot-resolver.test.ts` run, not a general vitest/teardown defect — worth watching if it comes
back on a *passing* run specifically.

## Desktop, generated-game, and packaged-game evidence

- **Desktop app**: real Electron window confirmed twice — once via the existing screenshot
  (`desktop-before-fix.png`, shows the actual UI, including the `Invalid project path` regression
  live in the renderer console), and once this session by relaunching the rebuilt app: the IPC
  error is gone, only the generic Electron CSP warning remains
  (`desktop-launch-after-fix.log`). The app registers as a normal macOS foreground GUI process
  (`lsappinfo`).
- **Generated game (dev launch via Godot)**: real windowed Godot process, Metal renderer on
  Apple A18 Pro, screenshots show both the title screen and live gameplay
  (`generated-visible.png`, `generated-gameplay-visible.png`).
- **Packaged `.app`**: universal arm64+x86_64 binary confirmed (`packaged-architecture.txt`).
  Launched (non-headless) from both the NTFS-formatted `/Volumes/DevDrive` volume and a copy on
  the boot APFS volume; both register with the WindowServer as foreground GUI apps (`lsappinfo`,
  checked-in timestamps), and both accumulate real CPU time over the ~50+ minutes they've been
  running. A fresh `sample` of the NTFS-hosted instance (PID 3000, `packaged-process-sample-2.txt`)
  shows physical footprint has grown to 106.6M (peak 169.9M, up from 112K at first launch) and the
  call graph is a genuine Cocoa/Godot event loop (`-[NSApplication run]` →
  `_CFRunLoopRunSpecificWithOptions` → Godot's own frame-pacing `nanosleep`), not a stall — this
  supersedes the earlier ambiguous "all samples in `_dyld_start`" reading, which was just an
  early snapshot taken before the process finished initializing.

  **I still could not capture a pixel screenshot of either window this session, and did not
  attempt to work around it.** `screencapture -x` was re-tried (no other method attempted, no
  permission changes attempted) and fails identically: `could not create image from display`.
  This is the macOS Screen Recording TCC permission, not granted to this tool's process chain
  (VSCode → its terminal helper → this shell) — a separate, narrower grant than whatever allowed
  the desktop/generated-game screenshots earlier in the original session. I will not attempt to
  weaken this permission boundary or fabricate pixel evidence. A human should either open one of
  the two still-running instances directly (PIDs live at report time — see
  `packaged-visible-process.json` / `packaged-apfs-process.json`) or grant the host terminal/IDE
  Screen Recording access in System Settings → Privacy & Security → Screen Recording (the app
  hosting the terminal must be restarted afterward for the grant to take effect), then re-run the
  capture.

## Platform support: verified vs. still untested

| Platform / path | Status |
|---|---|
| macOS arm64, native toolchain (Node/pnpm/Godot/Electron) | ✅ Verified locally, this session |
| macOS arm64, packaged `.app` — architecture, launch, **and codesign** | ✅ Verified locally, this session (codesign was the newly-fixed gap) |
| macOS arm64, packaged `.app` — **visual** confirmation | ⚠️ Process/window-registration evidence only; screenshot blocked by local tool permissions (see above) |
| Windows / Apple Silicon CI (`.github/workflows/validate.yml`, `baseline` matrix on `windows-latest`+`macos-15`, plus dedicated `godot-runtime` and `godot-runtime-macos-arm64` jobs) | ❌ **Not executed anywhere.** The workflow file is staged in the local git index but has never been committed to a reachable commit or pushed (`git show HEAD:.github/workflows/validate.yml` → *"exists on disk, but not in HEAD"*). `GET /repos/alexandnevaeh-dev/MetroForgeSis/actions/runs` correctly returns zero runs — there is nothing to verify yet, not a flaky pipeline. |
| Windows native (this machine) | Untested — no Windows host in this environment; only cross-export target coverage exists (`ensureWindowsExportPreset`, `exportGodotWindowsBinary`, all unit-tested) |
| Linux | Untested; not currently a stated target |

## Remaining blockers, ranked by impact

1. **CI has never actually run**, and needs a decision from you (see approval request below) —
   this session confirmed it's not just "unpushed," the local git *index* itself currently holds a
   stale, Windows-only version, distinct from the Windows+Apple Silicon version in the working
   tree. Nothing about real CI execution can be verified until the right version is committed and
   pushed.
2. **Packaged-app visual confirmation is indirect only.** Strong and now stronger process-level
   evidence (real Cocoa/Godot event-loop call stack, realistic and growing memory footprint) that
   it renders a live window; still no pixel proof, because Screen Recording permission isn't
   granted to this tool's host app. See the approval request for what a human needs to do.
3. **Production art is not release-ready, by design, and that has not changed.** Every readiness
   check this session (`readiness.visualReady: false`, `readiness.assetReady: false`,
   `readiness.releaseReady: false`, `humanVisualApprovalGranted: false`) matches the locked
   asset spec's requirement that only a human can set `HUMAN_APPROVED`/`HUMAN_REJECTED`
   (`reports/VGF2_VISUAL_VERTICAL_SLICE.json`). Image-generation workers (Diffusers/OpenVINO/
   ComfyUI/Qwen/DreamO/PuLID) remain genuinely unavailable on this hardware/software
   configuration (`models-doctor.log`, `providers-image-doctor.log`) — this is a real capability
   gap, not a regression from the migration, and nothing here fabricates approval or flips
   production-readiness.
4. Windows has no native test host in this environment — only cross-export from macOS is
   verified. Low impact right now since the CI matrix (once it actually runs) is what's meant to
   cover real Windows execution.

## Approval request: publishing the CI workflow

No commit, `git add`, push, reset, clean, or normalization was performed. I need your explicit
go-ahead before any of that happens, because it's a shared, visible, and only-partly-reversible
action (it triggers real GitHub Actions runs on `origin`).

**The file has three different states right now**, which matters for what "just commit it" would
actually do:

| State | Content |
|---|---|
| `HEAD` (`aae921d0`) | File does not exist |
| **Git index (staged)** | An older, **Windows-only** single-job version: Node 22.14.0, Godot 4.7.1, no `pnpm lint` step, no macOS coverage at all |
| **Working tree (current)** | The intended version: `baseline` matrix on `windows-latest` + `macos-15` (adds `pnpm lint`), a `godot-runtime` job on Windows, and a new `godot-runtime-macos-arm64` job that downloads the official universal Godot 4.7.2 build and runs `pnpm smoke:godot` on Apple Silicon; Node bumped to 22.23.0 throughout |

**Consequence:** a bare `git commit` right now, without first re-staging the file, would publish
the stale Windows-only version and silently miss the entire point of this migration's CI work. Full
diff between the staged and working-tree versions is in
[`artifacts/macos-migration-2026-09-04/INDEX.md`](../../artifacts/macos-migration-2026-09-04/INDEX.md);
the working-tree version in full is reproduced in `artifacts/macos-migration-2026-09-04/relevant-diffs.patch`
and was quoted verbatim in the prior session's evidence.

**What committing + pushing would change:**
- Adds one new file to the repo, `.github/workflows/validate.yml` (the working-tree version above).
- On push to `origin` (`alexandnevaeh-dev/MetroForgeSis`), GitHub Actions will start running it on
  every push to `main`/`master`/`develop` and on every pull request — that's real, metered CI
  minutes on `windows-latest` and `macos-15` runners, including a from-scratch Godot 4.7.2 download
  on each `godot-runtime*` job.
- It is the only remaining way to verify "Windows and Apple Silicon CI coverage" as more than a
  local simulation — everything else in this audit ran on this one Mac.

**What I need from you:** confirm (a) whether to proceed at all, and if so (b) `git add
.github/workflows/validate.yml` (the working-tree version) before committing — not the currently
staged one — and (c) whether to push just this file or the full staged migration set alongside it.
I will not take any of these steps without that confirmation.

## Next milestone

Once the CI workflow is committed and pushed (per the approval above), come back and read the
actual Windows-runner and macOS-runner results instead of the local simulation this audit relied
on — that closes the one item this audit cannot verify by itself. In parallel, a human confirming
the packaged-app screenshot (either by granting Screen Recording to the terminal/IDE host, or by
looking directly at one of the still-running instances) closes the other.
