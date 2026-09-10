# MetroForge Runtime Integrity Closure Report

Date: 2026-08-19
Canonical repository: `E:\Projects\MetroForge\Forged`

## 1. Executive Summary

Runtime closure is implemented around the existing MetroForge QA/runtime path. `pnpm smoke:godot` now performs deterministic generation, Godot import validation, Godot runtime launch, gameplay-ready verification, runtime checks, screenshot capture with headless-to-windowed fallback, bounded shutdown, diagnostic classification, and unified report writing.

The authoritative smoke invocation completed successfully on Windows with:

- Godot import: `PASS`
- Gameplay-ready marker: `PASS`
- Runtime checks: `184/197`, no hard failures; soft-fail checks remain explicitly represented
- Screenshot capture validity: `PASS`
- Capture strategy: `windowed_gpu` after headless dummy-renderer texture unavailability
- Shutdown: `PASS`, exit code 0
- Certification: `RUNTIME_VALIDATED`

Aesthetic screenshot scoring remains degraded because the deterministic smoke project is placeholder-heavy. This is reported separately from capture validity and runtime integrity. Godot also reports shutdown leak advisories; they are classified as warnings owned by the runtime smoke/template teardown path, not hidden or treated as fatal.

## 2. Original Runtime Discrepancy

Before this milestone:

- `scripts/smoke-godot.mjs` generated the project and ran only `godot --headless --editor --quit`, so it could certify import but never executed `RuntimeSmokeTest.tscn`.
- `packages/generation/src/pipeline.ts` called `QAValidator.validateGodotRuntime()` and then screenshot/playtest gates, so the production pipeline could report `RUNTIME_VALIDATED: 17/18` independently.
- The two paths used different orchestration and report-writing behavior.

The dedicated command now calls the built QA package’s `QAValidator.validateGodotHeadless()`, `validateGodotRuntime()`, and `validateGameplayScreenshot()` methods and writes the authoritative `metroforge-validation.json` for that invocation.

## 3. Root Causes

1. The dedicated wrapper bypassed runtime validation entirely.
2. Runtime validation used shell-composed Godot commands and did not retain successful-process stderr.
3. The Godot smoke scene treated a null headless viewport texture as a runtime capture failure even though the Node capture service already supported a windowed GPU fallback.
4. No deterministic gameplay-ready marker existed.
5. Save probes used Godot `user://` state without an explicit isolated smoke environment.
6. Runtime and aesthetic screenshot checks were conflated in the production gate message.

## 4. Runtime Architecture

The shared path is now:

```text
scripts/smoke-godot.mjs
  -> production CLI create
  -> QAValidator.validateGodotHeadless
  -> QAValidator.validateGodotRuntime
       -> RuntimeSmokeTest.tscn/GD
       -> METROFORGE_RUNTIME_READY marker
       -> SMOKE_TEST_RESULTS_BEGIN/END
  -> QAValidator.validateGameplayScreenshot
       -> headless capture attempt
       -> windowed_gpu fallback when dummy texture is unavailable
       -> capture_telemetry.json and PNG evidence
  -> diagnostic classification
  -> metroforge-validation.json
  -> certification calculation
```

The production generation pipeline continues to use the same QA validator methods. The dedicated command no longer maintains a competing import-only implementation.

## 5. Files Changed

Runtime closure changes:

- `scripts/smoke-godot.mjs`
- `packages/qa/src/validator.ts`
- `packages/qa/src/gameplay-capture.ts`
- `templates/godot-metroidvania/scripts/test/RuntimeSmokeTest.gd`
- `.github/workflows/validate.yml`
- `METROFORGE_RUNTIME_INTEGRITY_CLOSURE_REPORT.md`

The worktree also contains unrelated pre-existing user/generated modifications. They were preserved. `Forged-cursor-desktop` was not changed.

## 6. Screenshot Null-Texture Root Cause

The Godot error originated in `RuntimeSmokeTest.gd` at the viewport capture path:

```gdscript
var tex := get_viewport().get_texture()
var img: Image = tex.get_image()
```

In `--headless` mode, Godot 4.7.1 uses the dummy renderer and can return a null viewport texture. The existing capture service correctly recognized this through `texture_2d_get`/`Parameter "t" is null` and could fall back to `windowed_gpu`, but the runtime smoke scene still recorded the gameplay screenshot as a hard runtime check.

The smoke scene now treats the screenshot as capture evidence rather than runtime integrity. The external capture service owns capture validity and retries with a windowed D3D12 run. The null texture is classified as `EXPECTED_TEST_EVENT: headless_texture_unavailable`, not suppressed.

## 7. Screenshot QA Result

Capture validity now passes:

- PNG written: yes
- PNG decodable: yes
- nonblank: yes
- unique colors: 52 in the observed fallback capture
- strategy: `windowed_gpu`
- evidence: `GeneratedGames/metroforge-smoke-metroidvania/qa/screenshot_gameplay.png`
- telemetry: `qa/capture_telemetry.json`

The screenshot’s aesthetic critique remains degraded: the deterministic placeholder-heavy scene scored low contrast/occupancy quality. This is recorded as visual degradation, not capture failure. `RUNTIME_VALIDATED` does not imply `QUALITY_VALIDATED`.

## 8. SFX Warning Resolution

The missing SFX is an intentional runtime probe in `RuntimeSmokeTest.gd`:

`this_sfx_id_does_not_exist_and_should_just_warn`

It verifies that `AudioManager.play_sfx()` handles an optional missing sound without crashing. The unified smoke report classifies this narrowly as `EXPECTED_TEST_EVENT: intentional_missing_sfx_probe`. It is not treated as an unknown runtime error and is not globally silenced.

## 9. Save Probe Resolution

The corrupt-save warning is also intentional. The runtime smoke test writes a valid backup, corrupts the primary save, and verifies backup recovery. The smoke command creates a process-specific isolated runtime directory and passes its paths through Windows `APPDATA`/`LOCALAPPDATA` environment overrides so the run does not intentionally use normal user data.

The warning is classified as `EXPECTED_TEST_EVENT: intentional_corrupt_save_recovery_probe`. The recovery checks are part of the runtime result.

## 10. Resource Leak Resolution

Godot 4.7.1 still reports:

- `ObjectDB instances were leaked at exit`
- `resources still in use at exit`

These are retained in captured diagnostics as `WARNING: godot_shutdown_leak_diagnostic`. The process exits with code 0 after the smoke marker and checks complete, and no unknown fatal/error diagnostic was observed in the authoritative report.

The remaining leak advisory is not claimed as fixed. It is currently attributed to the generated runtime smoke/template teardown path, which creates and frees multiple temporary worlds, scenes, timers, audio players, and UI probes during one process. A future cleanup pass should identify the exact retained object classes with Godot verbose shutdown diagnostics. It does not invalidate the current bounded runtime certificate because mandatory runtime checks completed and shutdown returned normally, but it prevents this milestone from being treated as a zero-diagnostic engine shutdown.

## 11. Runtime Smoke Implementation

`RuntimeSmokeTest.gd` now emits:

```text
METROFORGE_RUNTIME_READY project=<...> scene=<...> player=<...> room=<...>
```

The shared validator requires both this marker and `SMOKE_TEST_RESULTS_END`. A missing marker produces `UNKNOWN`, not a pass. The Node validator now uses `spawnSync` with argument arrays, captures stdout and stderr, records exit code and timeout state, and preserves the runtime output in the unified report.

## 12. Gameplay-Ready Evidence

The authoritative smoke report records:

```json
{
  "gameplayReady": {
    "status": "PASS",
    "marker": "METROFORGE_RUNTIME_READY"
  }
}
```

The marker is emitted only after the world is instantiated, the current room is recorded, and the player lookup occurs. The runtime check set then covers autoloads, world, player, movement components, enemies, boss, ability pickup/gate, save systems, audio, UI, and related generated runtime contracts.

## 13. Godot Diagnostics

The report classifies diagnostics narrowly:

- `FATAL`: parse errors, script errors, failed loads, unhandled failures
- `ERROR`: unknown Godot error lines
- `WARNING`: known nonfatal engine advisories, including shutdown leak diagnostics
- `EXPECTED_TEST_EVENT`: headless texture unavailability, intentional missing SFX, intentional corrupt-save recovery

Unknown `ERROR:` lines are not allowlisted. The authoritative run had no unknown fatal/error diagnostic in the unified report. Headless texture diagnostics are tied to the Godot 4.7.1 dummy renderer and the capture fallback path.

## 14. Timeout/Process Handling

The runtime validator has a 90-second process bound and records `timedOut` when the subprocess reports a timeout. The capture service has bounded headless/windowed attempts and process-tree termination for timed-out capture processes. Godot runtime commands use argument arrays in the shared runtime validator. The command exits nonzero when Godot is missing, import fails, runtime readiness is absent, runtime checks fail, capture validity fails, or an unknown fatal/error diagnostic is present.

## 15. Unified Validation Report

The authoritative file is:

`GeneratedGames/metroforge-smoke-metroidvania/metroforge-validation.json`

It now records generation, assembly, structural validation, import, runtime status, gameplay-ready marker, runtime check counts, capture validity/strategy/telemetry, diagnostics, shutdown status/exit code, fallback status, provenance, duration, and certification.

The observed final report included:

- import `PASS`
- gameplay-ready `PASS`
- runtime `PASS`, state `SOFT_FAIL`
- runtime checks `184/197`, zero hard failures
- screenshot capture `PASS`
- shutdown `PASS`, exit code 0
- certification `RUNTIME_VALIDATED`

The `SOFT_FAIL` state reflects informational runtime checks and does not claim that every optional check was hard-pass. No hard runtime check failed.

## 16. Certification Result

Certification rule implemented by the dedicated command:

`RUNTIME_VALIDATED` requires current-invocation import pass, runtime pass, gameplay-ready marker, valid screenshot capture, no fatal/unknown error diagnostic, and normal shutdown.

The observed authoritative result is:

```text
Godot Validation: PASS
Gameplay Ready: PASS
Runtime Validation: PASS
Screenshot Capture: PASS
Shutdown: PASS
Certification: RUNTIME_VALIDATED
```

This is runtime integrity only. The generated project remains visually degraded and is not quality-certified.

## 17. Test Results

Baseline before modifications: typecheck passed and the complete existing suite passed with 112 test files and 614 tests.

After modifications:

- `pnpm typecheck`: PASS
- focused QA tests: PASS, 2 test files and 22 tests in the final focused run
- final complete `pnpm test`: PASS, 112 test files and 614 tests
- no tests were disabled or weakened

## 18. Build Results

- `pnpm install --frozen-lockfile`: PASS
- `pnpm typecheck`: PASS
- `pnpm build`: PASS
- `pnpm desktop:build`: PASS
- `pnpm doctor`: PASS with expected optional Ollama/FFmpeg warnings
- `pnpm validate`: PASS
- `pnpm smoke:godot`: PASS, exit code 0

The desktop build retains a nonfatal Vite chunking warning. The smoke run retains expected provider fallback and Godot diagnostic output in evidence.

## 19. Windows Validation

Validated on the current Windows environment:

- canonical path `E:\Projects\MetroForge\Forged`
- configured Godot executable path
- executable paths with spaces
- argument-array Godot runtime invocation
- Windows APPDATA/LOCALAPPDATA smoke isolation
- generated project path
- PNG evidence output
- bounded process termination/fallback
- clean exit code from authoritative smoke command

## 20. CI Status

Added `.github/workflows/validate.yml` with:

- Windows baseline job
- pinned pnpm `10.15.0`
- Node `22.14.0`
- frozen install
- typecheck
- tests
- package build
- desktop build
- separate pinned Godot 4.7.1 runtime job
- bounded smoke evidence artifact upload on failure

The workflow does not require paid providers. It uses deterministic `LOCAL_ONLY` smoke generation. CI syntax was reviewed locally; the hosted workflow itself was not executed in this environment.

## 21. Remaining P0 Issues

No mandatory runtime-integrity P0 remains for the current Windows environment: the authoritative command reaches runtime, proves readiness, captures valid evidence, and exits 0 with `RUNTIME_VALIDATED`.

The remaining shutdown leak advisory should be treated as a high-priority cleanup item if a zero-diagnostic engine shutdown becomes a release requirement.

## 22. Remaining P1 Issues

- Identify and eliminate the specific Godot object/resource leaks during smoke teardown.
- Improve the deterministic smoke scene’s aesthetic score in the later visual-quality milestone; do not conflate that with runtime integrity.
- Run the new GitHub Actions workflow and verify the pinned Godot download URL/release behavior.
- Add a richer unit-level fake-process test for runtime timeout/nonzero exit and diagnostic classification.
- Add explicit screenshot-validity tests for windowed fallback telemetry and user-data isolation.

## 23. Commands Run

From `E:\Projects\MetroForge\Forged`:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm desktop:build
pnpm doctor
pnpm smoke:godot
pnpm validate
```

Additional focused commands:

```powershell
pnpm exec vitest run packages/qa/src/validator.test.ts packages/qa/src/validation-level.test.ts packages/qa/src/playtest-output.test.ts
```

The smoke command itself performs generation, import, runtime, capture, report writing, and certification. It is the authoritative runtime path.

## 24. Git/Worktree Preservation

`Forged` remained the only modified repository. `Forged-cursor-desktop` was not deleted, copied from, reset, or modified. Existing unrelated modified and untracked files were preserved, including prior visual-slice work, generated exports, temporary images, reports, `.agents`, `.claude`, `.metroforge`, and the previous reliability/current-state reports. No destructive Git command was used.

## 25. Recommended Next Milestone

**Production Asset Foundry & Visual Coherence Gate**. Runtime integrity is now independently certified by the dedicated command. The next evidence-backed product bottleneck is the deterministic output’s visual quality: 109/111 assets remain procedural placeholders/blockouts and the screenshot aesthetic critique is degraded. The next milestone should improve asset provenance, coherence, normalization, visual inspection, and quality gating without weakening the runtime certification distinction.

# RUNTIME INTEGRITY CLOSURE PASSED
