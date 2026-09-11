# Excluded-branch inspection

Both branches named for exclusion from `integration/metroforge-unified` were re-inspected commit
by commit (not just re-summarized) before writing this. Neither is deleted; both remain exactly
as they were on the remote.

## `cursor/local-asset-worker-acbb` — superseded, safe to leave

One commit ahead of the merge base: `97a3af0c feat(assets): add local Python worker that writes
Godot-ready PNG and .tres files`. It adds:

- `workers/asset_gen.py` + `packages/assets/workflows/comfyui-txt2img.json` — a ComfyUI txt2img
  client and workflow graph.
- `packages/assets/src/local-asset-worker.ts`, `packages/generation/src/local-game-asset.ts` — a
  thin wrapper pipeline around that worker.
- `packages/godot/src/ui-stylebox.ts` — a 19-line helper that compiles a `StyleBoxTexture .tres`
  from a texture path for 9-slice UI.

**Verified superseded, not merely conflicting:** `integration/metroforge-unified` already has a
materially more complete ComfyUI integration — `packages/assets/src/providers/comfyui.ts`,
`comfyui-workflows.ts`, and `comfyui-workflow-contract.ts`, each with its own test file — built
independently after this branch split off. `ui-stylebox.ts` has no caller anywhere in the current
tree once its only consumer (`local-game-asset.ts`) is gone; nothing in the current milestone
needs 9-slice `StyleBoxTexture` compilation (generated HUD wires PNGs directly, per
`c876cf33`-style fixes on other branches). Confirmed by grep, not assumed: no
`local-asset-worker`, `local-game-asset`, or `ui-stylebox` symbol exists outside this one branch.

**Disposition:** obsolete relative to the current pipeline. Left on its branch; not integrated.

## `cursor/setup-dev-environment-a6d9` — one feature integrated, rest intentionally not

Five commits ahead of the merge base:

| Commit | Content | Disposition |
|---|---|---|
| `ff6f39e3` `feat(qa): add first-class MODERN_METROIDVANIA_GATE` | 817-line presentation-readiness gate + tests | **Integrated** — copied into `packages/qa/src/modern-metroidvania-gate.ts`, exported, wired into `packages/generation/src/pipeline.ts` (commit `ad965cd1`), then fixed twice more this session (`131abf8c` top-down N/A handling, `1c36834f` report field). `git cherry-pick` itself failed on 8 months of divergence in `pipeline.ts`; the gate's own file had no such conflict, so it was ported by hand plus the pipeline wiring re-authored fresh. |
| `c13e71a8` `fix(topdown): remove orphaned PhaseBarrier.tscn` | Deletes a top-down scene left dangling after its script was deleted elsewhere on that branch | **Not applicable here.** Verified: on `integration/metroforge-unified`, `templates/godot-topdown-adventure/scripts/world/PhaseBarrier.gd` was never deleted, so `PhaseBarrier.tscn` is not orphaned — `asset_references_valid` already passes on every top-down generation checked this session. This fix targets a defect that only exists on that branch's own history. |
| `182eb6b2` `test: make godot-resolver, project-export and nvidia routing tests hermetic` | Fixes PATH-precedence, shallow-`/tmp` (Linux), and NVIDIA default-health assumptions in 3 test files | **Not integrated.** Verified by running `packages/tools/src/godot-resolver.test.ts`, `packages/tools/src/project-export.test.ts`, `packages/ai/src/providers/nvidia.test.ts` here: all 39 tests pass as-is in this environment. The hermeticity gaps it fixes are real but don't reproduce on this machine/OS; nothing in the current milestone depends on them. |
| `524e6911`, `fd2532c5`, `a10d5331` `chore(env): ...` | Cloud Agent environment config, Python+Pillow provisioning, pnpm build-allowlist pin | **Not integrated.** Specific to Cursor's cloud sandbox provisioning; this session runs locally with its own already-working Python/Pillow and pnpm setup. |

**Disposition:** the one functional capability (MODERN_METROIDVANIA_GATE) is integrated and now
running in every generation. The rest is either inapplicable to this branch's actual state
(PhaseBarrier), unneeded here because nothing is failing (hermetic test fixes), or environment
provisioning for a sandbox this session doesn't run in (chore/env). None of it was discarded for
merge-conflict convenience — each line above is a verified reason, not an assumption carried over
from an earlier pass.

Both branches are untouched on the remote (`origin/cursor/local-asset-worker-acbb`,
`origin/cursor/setup-dev-environment-a6d9`) if the "not integrated" calls above should be revisited.
