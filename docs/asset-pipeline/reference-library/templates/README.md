# Structured templates

`library.json` — one `VisualReferenceLibrary` (schema: `packages/schemas/src/visual-reference-template.ts`,
`VisualReferenceLibrarySchema`), built and zod-validated by
`artifacts/visual-reference-library-20260907/build_templates.mjs`. 24 `VisualReferenceTemplate`
entries across 3 `BiomeVisualTemplate` entries (`foundry`, `flooded_utility`, `overgrown_reactor`).

Rebuild after editing the generator script:

```bash
export PATH="$HOME/.local/lib/nodejs/node-v22.23.2-darwin-arm64/bin:$PATH"   # or your node
pnpm --filter @metroforge/schemas build   # compile the schema first
node artifacts/visual-reference-library-20260907/build_templates.mjs
```

The script fails loudly (non-zero exit, printed zod issues) if a template doesn't validate, and a
separate check (run as part of the fourteenth-session verification, not yet a standing script)
confirms every `referencePaths` entry resolves to a real file under `reference-library/` — the
same "no manufactured fallback" discipline `loadExternalVisualPack()` uses for external packs.

## Environment features (fifteenth session)

Terrain/background/prop templates carry an `environmentFeatures` array — a machine-checked list
(distinct from the prose `allowedVariation`) naming concrete material dressing the live renderer
should express: `panel_grates`, `corrosion`, `stains`, `damaged_modules`, `vegetation`. Each
renderer (`generateTilesetSource` in `packages/assets/src/png.ts`, `generateParallaxStrip` in
`parallax-strip.ts`, `generatePropSprite` in `prop-art.ts`) declares its own supported subset and
partitions a template's request into supported/unsupported — an unsupported feature is disclosed
in `reports/visual-template-provenance.json`'s `unsupportedFeatures`, never silently dropped. See
`packages/assets/src/visual-templates/README.md` for the full wiring.

## Fixed identity vs. allowed variation

Every template separates:

- **`forbiddenChanges`** (required, non-empty) — what a seed must never alter: anatomy/proportions,
  anchor points, gameplay-meaning accent colors, silhouette family, tile size/role set.
- **`allowedVariation`** — what a seed may alter: surface wear, panel pattern, growth coverage,
  minor decorative decal.

A template that has forbidden identity fields listed in `allowedVariation` (or vice versa) is a
template-authoring defect, not something the loader currently catches automatically — see the
fourteenth-session audit entry's "remaining limitations" for this gap.

## Adding a new asset role or biome

See [`../../VISUAL_STYLE_GUIDE.md`](../../VISUAL_STYLE_GUIDE.md)'s "Adding a fourth biome" section.
To add a new **asset role** to an existing biome: add a `VisualReferenceAssetRoleSchema` enum value
if the role doesn't already exist, add a reference image under the matching `reference-library/`
subdirectory, add a template object in `build_templates.mjs`, rerun it, and add the new template's
id to that biome's `templateIds`.

## Consumption

`packages/assets/src/visual-templates/` loads and resolves this file — see that package's own
README for the runtime API (`loadVisualReferenceLibrary`, `resolveVisualReferenceTemplate`,
`buildTemplatePrompt`, `checkTemplateTokenBudget`, `resolveConditioning`).
