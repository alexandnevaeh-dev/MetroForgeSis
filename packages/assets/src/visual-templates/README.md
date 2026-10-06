# `@metroforge/assets` visual-templates

Runtime consumption of `docs/asset-pipeline/reference-library/templates/library.json` — the
fourteenth-session visual reference & asset-template library. See that directory's own README for
the template schema and how to add a role/biome; this covers the integration API.

## API

- `loadVisualReferenceLibrary(root)` — loads + zod-validates `library.json`, and confirms every
  template's `referencePaths` resolve to a real file on disk (throws otherwise — no manufactured
  fallback, matching `loadExternalVisualPack()`'s convention in `@metroforge/godot`).
- `resolveVisualReferenceTemplate(library, {assetRole, biome})` — exact match only; returns
  `undefined` (not a nearest guess) when nothing matches.
- `templatesForRole(library, assetRole)` — every biome's template for one role.
- `buildTemplatePrompt(template, {styleBible?})` — the provider-compatible prompt, composed
  through the same `sanitizeStyleLanguage()` pass `packages/assets/src/foundry/prompts.ts` uses.
- `checkTemplateTokenBudget(prompt, negativePrompt, checker?)` — real tokenizer check when a
  `PromptBudgetChecker` (e.g. `DiffusersProvider`) is passed; otherwise a disclosed
  (`estimated: true`) character-count heuristic against a 77-token CLIP-family budget.
- `resolveConditioning(root, template, registration)` — attaches real `ip_adapter` conditioning
  only when the provider registration declares `supportsReferenceImages` or a
  `REFERENCE_IMAGE`/`IMAGE_TO_IMAGE`/`IDENTITY_CONDITIONING` capability; otherwise returns a
  `disclosure` string explaining why text-only constraints were used instead.
- `archetypeForTemplate` / `roleForArchetype` — bridges template asset roles onto
  `packages/assets/src/png.ts`'s existing procedural-fallback archetype geometry
  (`enemy_flying` -> `'flying'`, `enemy_armored_heavy` -> `'armored'`, `enemy_melee` -> `'beast'`,
  `enemy_ranged` -> `'caster'`) instead of duplicating body-part shape functions.
- `templateFillAccent` / `hexToRgb` — a template's palette as RGBA tuples for `SpriteSpec.fill`/`.accent`.

## Where it's wired in

`packages/assets/src/asset-pipeline.ts` resolves a template at four call sites, each through its
own thin wrapper around the shared `resolveTemplateCore()` (private helper, same file):

- **Enemies** (`resolveEnemyVisualTemplate`) — the enemy-generation loop, keyed by the archetype
  `pickEnemyArchetype()` already chose (via `roleForArchetype`). Overrides the generic
  `BIOME_PALETTES` fill/accent with `templateFillAccent()`'s gameplay-meaning colors.
- **Terrain** (`resolveTerrainVisualTemplate`) — the per-biome tileset loop, keyed by biome index
  `b`. Feeds `templateTilesetStyle()`'s ground/wall/shadow/accent colors and
  `environmentFeatures` into `generateTilesetSource(seed, size, style)` (see
  `TILESET_SUPPORTED_FEATURES` in `../png.ts`).
- **Backgrounds** (`resolveBackgroundVisualTemplate`) — the per-biome/per-layer parallax loop.
  Feeds `templateBackgroundPalette()` and the biome's supported features into
  `generateParallaxStrip(layer, seed, w, h, palette, features)` (see
  `BACKGROUND_SUPPORTED_FEATURES` in `../parallax-strip.ts`).
- **Props** (`resolvePropVisualTemplate`) — the `environmentKits` prop-family loop, keyed by
  `biomeIndexFromId(kit.biomeId)` (kits use the real `biome_<N>` id convention from
  `packages/procedural/src/{bibles,content,world}.ts`). Feeds `templatePropFillAccent()` and
  features into `generatePropSprite(..., features)` (see `PROP_SUPPORTED_FEATURES` in
  `../prop-art.ts`).

Every call site appends a `VisualTemplateProvenanceEntry` (assetId/assetRole/templateId/
styleVersion/biome/seed/prompt/negativePrompt/tokenBudget/conditioningDisclosure/
conditioningAttached/conditioningMode/appliedFeatures/unsupportedFeatures) at resolution time, then
calls `finalizeVisualTemplateProvenance()` once the real generation call completes to fill in the
actual `provider`/`modelId` — every entry always ends with a real provider, never left `'pending'`.
The whole run's entries flush to `<outputDir>/reports/visual-template-provenance.json`.

`packages/generation/src/pipeline.ts`'s `GenerationPipeline.run()` loads the library (via
`GenerateOptions.useVisualReferenceLibrary`, off by default) and passes it through — wired to the
CLI as `metroforge create --visual-reference-library`.

**Biome selection is index-rotation, not semantic matching**: every resolver picks
`library.biomes[index % library.biomes.length]`, the same convention the pre-existing
`BIOME_PALETTES[i % BIOME_PALETTES.length]` array already used. It does not try to match a real
generated biome's theme/name to one of the library's three named biomes — that's a disclosed
follow-up, not implemented in this pass (see the fourteenth/fifteenth-session audit entries).

**Coverage as of the fifteenth session**: enemy, terrain, background, and prop call sites are
wired. Player, boss, and traversal templates exist in the library and are validated/tested, but no
call site resolves them yet — extending coverage follows the identical pattern and is listed as a
scoped follow-up, not attempted here to keep blast radius on the extensively-tested
`asset-pipeline.ts` bounded.

**Declared-unsupported features**: `partitionTilesetFeatures` / `partitionBackgroundFeatures` /
`partitionPropFeatures` each split a template's `environmentFeatures` into what that specific
renderer actually supports vs. not — an unsupported request is recorded in the provenance entry's
`unsupportedFeatures` array rather than silently dropped. As of this session every feature the
library's own templates declare is genuinely supported (see the three renderers' `*_SUPPORTED_FEATURES`
constants), so `unsupportedFeatures` is empty in practice today — the mechanism is real and tested
(see each renderer's own test file), ready for a future template that asks for something not yet
implemented.
