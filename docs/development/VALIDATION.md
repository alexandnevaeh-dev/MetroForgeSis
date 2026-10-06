# MetroForge Validation Semantics

MetroForge keeps generation, assembly, structural validation, Godot validation, runtime validation, and quality validation distinct. A generated project is not automatically a validated or certified game.

## Certification Levels

| Level | Meaning |
|---|---|
| `GENERATED` | Project files were produced. |
| `STATIC_VALIDATED` | MetroForge static checks passed, but Godot import/runtime evidence is absent. |
| `IMPORT_VALIDATED` | Godot parsed/imported the project successfully; runtime was skipped or not required by the command. |
| `RUNTIME_VALIDATED` | Godot reached the runtime smoke-test completion marker without fatal validation failure. |
| `NEEDS_RUNTIME_VALIDATION` | Static generation completed, but Godot was unavailable or runtime evidence was not run. |
| `FAILED` | A required generation, structural, import, or runtime gate failed. |

These levels are derived by `packages/qa/src/validation-level.ts` and written into `validation_report.json` by the generation pipeline.

## Fallback and Degraded State

Reports preserve provider and asset provenance. Procedural/placeholder/blockout assets are marked as degraded and are not commercial-quality eligible. Examples of expected warning conditions include unavailable NVIDIA, local model/provider fallback, procedural asset fallback, unavailable visual QA, unavailable speech, and missing Godot.

## Required Interpretation

- `success: true` means the project was assembled; inspect `validationPassed`, `validationLevel`, and `projectStatus`.
- Missing Godot must produce `NEEDS_RUNTIME_VALIDATION`, not `RUNTIME_VALIDATED`.
- Missing Godot means export certification is `UNVERIFIED`.
- `RUNTIME_VALIDATED` proves runtime integrity only. It does not prove modern Metroidvania quality.
- Visual/playthrough quality requires the additional quality and acceptance gates; those are not implied by static or runtime validation.

## Deterministic Smoke

`pnpm smoke:generate` uses the production CLI pipeline with a fixed seed and local/deterministic fallback policy. `pnpm smoke:godot` repeats generation, discovers Godot, runs structural validation, and runs the existing Godot headless/runtime hooks when available. Both human-readable console output and `metroforge-validation.json` are produced in the smoke project directory.
