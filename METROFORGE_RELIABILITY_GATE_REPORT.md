# MetroForge Reliability Gate Report

Date: 2026-08-19
Canonical repository: `E:\Projects\MetroForge\Forged`

## 1. Executive Summary

The canonical MetroForge repository now has a reproducible local TypeScript/package baseline. A frozen pnpm install succeeds, root typecheck succeeds across all workspace projects, the full Vitest suite passes, the TypeScript build passes, the Electron desktop build passes, the CLI doctor command runs, deterministic smoke generation uses the production pipeline, and configured Godot 4 import validation passes.

The reliability gate is **PARTIAL**, not fully passed. Runtime smoke evidence was reached by the existing generation pipeline, but the explicit smoke wrapper currently certifies import only and reports runtime as not run. The generated smoke project also has a failed screenshot QA gate, emits Godot warnings/errors during screenshot/save probes, and uses 109/111 procedural placeholder/blockout assets. These are correctly reported as degraded and are not hidden behind a quality certification.

## 2. Canonical Repository

- Absolute path: `E:\Projects\MetroForge\Forged`
- Git root: `E:/Projects/MetroForge/Forged`
- Branch: `feature/claude-generation-runtime`
- Current commit: `aae921d0a2f8c2f08bb60f4300bb8a5cec6a34f8`
- Short commit: `aae921d`
- Last commit: `fix(godot): hash cell_y into RoomTileMap variant selection so vertical runs vary`
- The root workspace is not the Git root; `Forged` is.
- `Forged-cursor-desktop` was preserved and not modified.
- `Forged-cursor-desktop` is not independently Git-backed and remains a stale/parallel copy.

The worktree contained substantial unrelated pre-existing modifications and untracked/generated artifacts before this task. They were preserved. No reset, clean, delete, rename, or destructive Git operation was performed.

## 3. Parallel Tree Comparison

Created [docs/audits/FORGED_PARALLEL_TREE_COMPARISON.md](docs/audits/FORGED_PARALLEL_TREE_COMPARISON.md).

The canonical tree is materially newer: approximately 618 source/config files in the comparison scope versus 195 in the sibling. Canonical-only families include asset foundry/provenance, expanded providers, speech adapters, licensing/routing, project memory, generation lineage/history, visual QA, gameplay capture, readiness, desktop queue/edit history, and visual review. The sibling contributes only a small number of uncertain runtime/config files: `config/models.default.json`, `AssetSprite.gd`, and `AbilityGate.gd`. Nothing was copied from the sibling.

## 4. Dependency Repairs

Completed targeted repairs:

- Added root `vite` dev dependency because root `vitest.config.ts` imports `vitest/config` and Vitest requires Vite at runtime.
- Added `packageManager: pnpm@10.15.0`.
- Updated `pnpm-lock.yaml` intentionally with pnpm.
- Removed the desktop package-local Electron postinstall hook that failed under pnpm hoisting.
- Added root-resolved build/typecheck scripts so workspace package-local broken TypeScript shims are not used.
- Added root-resolved desktop and CLI build scripts for the same reason.
- Added explicit test/provider health isolation through `skipHealthChecks` in `bootstrapProviders`; production behavior remains live by default.

## 5. Toolchain Versions

Validated in this environment:

- Node.js: `v24.19.0` (repository requires `>=22.5.0`)
- pnpm: `10.15.0`
- TypeScript: `5.9.3`
- Vite: `6.4.3`
- Vitest: `2.1.9`
- Electron: `33.2.1` manifest dependency
- React: `18.3.1` manifest dependency
- Godot: `4.7.1.stable.official.a13da4feb`
- Python: `3.11.9`
- Git: `2.55.0.windows.3`
- Ollama: not installed/detected
- FFmpeg: not installed/detected

## 6. Typecheck Results

`pnpm typecheck` passes all 14 applicable projects through `scripts/typecheck.mjs`:

- 11 package projects
- CLI renderer/project
- desktop renderer project
- desktop Electron project

Strictness was not disabled and no new `skipLibCheck` workaround was introduced. The root script invokes the declared root TypeScript binary directly because pnpm’s package-local generated shims were broken in this Windows install.

## 7. Test Results

Final command: `pnpm test`

- Test files: 112 passed
- Tests: 614 passed
- Failed: 0
- Skipped: 0 reported by Vitest
- Flaky: none observed in the final run
- Duration: approximately 73 seconds in the final run

The first post-repair umbrella run exposed one real environment-isolation defect: the NVIDIA bootstrap test contacted the real NIM endpoint when `.env` contained a credential and timed out. The test now opts into `skipHealthChecks: true`; normal runtime bootstrap remains live and unchanged by default. The suite was rerun after the fix and passed completely.

Expected non-failing warnings remain in tests for intentionally unavailable local asset services such as an A1111 endpoint at `127.0.0.1:9`.

## 8. Build Results

- `pnpm build`: PASS
- `pnpm desktop:build`: PASS
- CLI build: PASS
- Desktop renderer Vite build: PASS
- Electron main/preload build: PASS

The desktop build emits a non-fatal Vite chunking warning for a module that is both dynamically and statically imported.

## 9. Godot Discovery

The existing canonical resolver and doctor detect the configured Godot path from `.env`:

`C:/Users/alexa/AppData/Local/MetroForge/Godot/Godot_v4.7.1-stable_win64.exe`

Discovery order in the implementation is explicit preference/project/env, PATH, and known installation paths. The smoke wrapper was aligned to load `.env` and to resolve Windows PATH commands with `where.exe`. Godot 4 was accepted; no Godot 3 executable was treated as valid.

`pnpm doctor` output was PASS for Node, pnpm, Godot, Python, Git, NVIDIA reachability, and generated-games directory. Ollama and FFmpeg were reported as warnings, not failures.

## 10. Smoke Generation

Command: `pnpm smoke:generate`

The fixed smoke identifier is `metroforge-smoke-metroidvania`, seed `424242`, profile `TINY_TEST`, mode `LOCAL_ONLY`. It uses the production CLI and generation pipeline, not a fake standalone project.

Observed output included:

- deterministic Game DNA
- design bible
- 8-room topology
- progression proof with 10 steps
- 2 enemies
- 1 boss
- 1 quest
- 1 NPC
- 17 audio files including MIDI/tracker interchange
- 111 assets
- project assembly pass
- generated Godot project files

The generated project exists at `GeneratedGames/metroforge-smoke-metroidvania`.

## 11. Godot Validation

Command: `pnpm smoke:godot`

Observed:

- Godot discovery: PASS
- Godot headless import/editor quit: PASS
- Certification from the explicit wrapper: `IMPORT_VALIDATED`
- Runtime validation from the explicit wrapper: `NOT_RUN`

This is intentionally not reported as runtime certification. The production generation pipeline did invoke its own Godot runtime path during smoke generation and reported `RUNTIME_VALIDATED`, but its output also showed a failed `gameplay_screenshot_qa` repair gate. The two paths are kept distinct in this report.

## 12. Runtime Validation

The existing production pipeline reached its runtime smoke completion path and reported `RUNTIME_VALIDATED: 17/18 gates passed`. That is useful runtime-integrity evidence, but not a clean certification because:

- automated repair reported `gameplay_screenshot_qa` still failing;
- Godot emitted repeated `Parameter "t" is null` errors during screenshot capture;
- the runtime deliberately logged a missing SFX warning;
- save recovery logged a corrupt/unreadable test save warning;
- Godot reported leaked objects/resources at exit.

The explicit `scripts/smoke-godot.mjs` wrapper therefore reports runtime as `NOT_RUN` and certification as `IMPORT_VALIDATED` until runtime capture/reporting is made clean and bounded.

## 13. Certification Model

The repository now documents and preserves these states in [docs/development/VALIDATION.md](docs/development/VALIDATION.md):

- `GENERATED`
- `STATIC_VALIDATED`
- `IMPORT_VALIDATED`
- `RUNTIME_VALIDATED`
- `NEEDS_RUNTIME_VALIDATION`
- `FAILED`

`GenerateResult` already separates assembly success from validation status. Missing Godot is represented as `NEEDS_RUNTIME_VALIDATION`; it is not converted into a full validation pass. Runtime validation does not imply quality validation.

The smoke machine report is `GeneratedGames/metroforge-smoke-metroidvania/metroforge-validation.json`. The pipeline report remains `validation_report.json`.

## 14. Provider/Fallback Behavior

Provider and asset degradation are visible in generation output. The smoke run recorded:

- ComfyUI unavailable
- Diffusers unavailable
- procedural asset fallback used
- no AI-generated player reference
- environment assets degraded
- 109/111 assets classified as procedural placeholders/blockout

The generation pipeline reported this as `DEGRADED`, not production-ready. NVIDIA is not required for local tests or smoke generation. The NVIDIA provider’s live behavior remains covered by unit tests; bootstrap tests no longer require network access.

## 15. Windows Compatibility

Validated or repaired:

- Windows pnpm frozen install
- Windows root-resolved Node tool invocation
- Windows Electron build
- configured Godot path with spaces/canonical Windows path handling
- Godot PATH resolution through `where.exe`
- `.env`-configured executable discovery

Remaining risk areas include long paths, external drives, symlink restrictions, and shell-string subprocess construction in older download/tool paths. These were not broadly refactored in this gate.

## 16. Security Fixes

No broad security rewrite was attempted. Existing positive controls remain: NVIDIA key redaction, context-isolated Electron preload, environment-based credentials, Zod validation, and explicit download approval intent.

This gate did not remove all identified risks. Remaining review items include shell-string construction in some model-download commands, generated-code execution without a strong sandbox, and continued path/symlink hardening for generated projects and external tools. No API secret was printed in diagnostics or reports.

## 17. CI Status

No existing GitHub Actions workflow was found in the inspected canonical root. A CI workflow was not added during this gate because the local baseline needed to be repaired and verified first. The documented CI-safe baseline is now:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Godot and paid-provider credentials are not required for this baseline. Adding a pinned Godot CI job is a remaining P1 reliability task.

## 18. Remaining Failures

1. Explicit smoke runtime certification remains `NOT_RUN`; only Godot import certification is clean in the new wrapper.
2. Existing production runtime smoke reaches `RUNTIME_VALIDATED` but logs screenshot texture errors, a missing SFX warning, save-recovery warning, and leaked resources.
3. `gameplay_screenshot_qa` fails in the smoke generation path.
4. Smoke assets are overwhelmingly procedural placeholders/blockouts.
5. Ollama and FFmpeg are unavailable in the current environment, though both are optional for the baseline.
6. NVIDIA is reachable in this environment but external provider access remains environment-dependent and is not required for unit tests.

## 19. Remaining P0 Issues

- Make the explicit smoke command run and report a clean bounded runtime test, not import-only evidence.
- Fix the screenshot capture null-texture errors and decide whether missing test audio should be a warning or fixture.
- Ensure runtime warnings/leaks are classified and gated consistently.
- Add a clean-install CI job to prevent dependency-shim regressions.

## 20. Remaining P1 Issues

- Add a pinned Godot 4 headless CI validation job.
- Add runtime smoke results to `metroforge-validation.json` from the same command that executes them.
- Resolve the failed screenshot QA gate for the deterministic smoke project.
- Keep placeholder assets explicitly ineligible for commercial-quality certification.
- Add safe subprocess argument handling to legacy download/tool paths.
- Add a true automated gameplay smoke route if existing playtest infrastructure can drive it without a new architecture.

## 21. Files Changed

Reliability-gate changes made by this task:

- `README.md`
- `package.json`
- `pnpm-lock.yaml`
- `apps/desktop/package.json`
- `apps/cli/package.json`
- `packages/ai/src/bootstrap.ts`
- `packages/ai/src/bootstrap.test.ts`
- `scripts/typecheck.mjs`
- `scripts/build.mjs`
- `scripts/desktop-build.mjs`
- `scripts/cli-build.mjs`
- `scripts/smoke-generate.mjs`
- `scripts/smoke-godot.mjs`
- `docs/audits/FORGED_PARALLEL_TREE_COMPARISON.md`
- `docs/development/SETUP.md`
- `docs/development/VALIDATION.md`
- `METROFORGE_RELIABILITY_GATE_REPORT.md`

The worktree also contains unrelated pre-existing modified/untracked files, including visual-slice work, asset/godot changes, `.agents`, `.claude`, `.metroforge`, `Exports`, temporary images, reports, and the prior current-state audit. Those were preserved and are not attributed to this gate.

## 22. Commands to Reproduce

Run from `E:\Projects\MetroForge\Forged`:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm desktop:build
pnpm doctor
pnpm smoke:generate
pnpm smoke:godot
pnpm validate
```

`pnpm smoke:godot` exits nonzero when Godot is unavailable or import validation fails. It reports `Godot Validation: NOT RUN` and `Certification: NEEDS_RUNTIME_VALIDATION` when no supported Godot 4 executable is found.

## 23. Definition-of-Done Checklist

- [x] `Forged` is documented as canonical.
- [x] Parallel tree differences are recorded.
- [x] Sibling tree was preserved and not modified.
- [x] Frozen dependency installation succeeds.
- [x] Root TypeScript command executes successfully.
- [x] Root test runner starts and existing tests execute.
- [x] Full final suite passes: 112 files, 614 tests.
- [x] TypeScript build passes.
- [x] Desktop build passes.
- [x] CLI doctor builds and runs.
- [x] Deterministic smoke generation creates the expected project.
- [x] Godot 4 discovery works from configured Windows path.
- [x] Godot headless import validation passes.
- [x] Missing/unrun runtime is represented distinctly from import validation.
- [x] Fallback/degraded asset usage is visible.
- [x] Machine-readable smoke report exists.
- [x] Human-readable setup and validation documentation exists.
- [ ] Clean runtime smoke certification with no fatal screenshot/runtime diagnostics.
- [ ] Clean gameplay screenshot QA.
- [ ] CI workflow with pinned Godot validation.

## 24. Recommended Next Milestone

**Runtime Integrity Closure**: fix the screenshot capture null-texture path, make the explicit smoke wrapper invoke and parse the existing runtime smoke test, classify expected fixture warnings, verify clean bounded shutdown, and add the resulting command to CI with a pinned Godot 4 release. Do not expand genres, providers, UI, or generation capability before this runtime evidence is clean.

### Repository Verdict

# RELIABILITY GATE PARTIAL

The package/toolchain baseline is reliable: frozen install, typecheck, tests, build, desktop build, doctor, deterministic generation, and Godot import all work from the canonical repository. The gate remains partial because runtime certification is not yet cleanly reproduced by the dedicated smoke command, screenshot QA fails, and the generated smoke project remains heavily degraded by placeholder assets. The repository is ready for focused runtime-integrity closure, not for claiming full reliability certification.
