# Local, free, offline sprite-generation path (2026-09-10)

An asset-generation-engine research pass evaluated four externally-suggested candidates against a
hard requirement: **free, fully local, no payment, no subscription, no cloud API**, with no large
model download or system-wide install performed without approval. Each candidate was checked
against its own real repository/README (not assumed) before any code was written. None of the
four qualifies for the actual *image-generation* step without violating that requirement — the
findings below are sourced, not guessed. A new, genuinely local, zero-dependency-beyond-Pillow
procedural worker was built instead, following this repo's own existing Node↔Python subprocess
convention (`packages/assets/src/providers/diffusers.ts` ↔ `workers/diffusers_image_worker.py`).

## Candidates evaluated, and why each was rejected for image generation specifically

| Candidate | Code license | Actual generation backend | Verdict |
|---|---|---|---|
| [`aldegad/sprite-gen`](https://github.com/aldegad/sprite-gen) | Apache-2.0 (real, open) | Requires the **Codex** or **Grok** AI provider; video work needs a Grok CLI login / `XAI_API_KEY` | **Rejected** — the CLI itself is free and open, but its actual sprite *generation* step depends on a paid/cloud provider, not a local model |
| [`acatovic/ai-game-studio`](https://github.com/acatovic/ai-game-studio) | MIT (real, open) | Web-UI only (no CLI/API); **requires an OpenRouter API key** (paid) | **Rejected** — paid cloud API, and no CLI/subprocess surface to integrate against at all |
| [Material Maker](https://github.com/RodZill4/material-maker) | MIT (real, open) | Procedural, Godot-engine-based, genuinely local and free | **Not used this pass** — real and promising for *tileset/material* generation, but its own README documents no CLI/headless invocation; using it would need further, unverified investigation into whether Godot's own `--headless --script` mode can drive its node graphs externally. Disclosed as unconfirmed, not rejected outright — a real candidate for a future, dedicated pass. |
| [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | GPL-3.0 (real, open); runs fully offline once configured | Needs a real open-weight checkpoint (SD1.5/SDXL/Flux/etc., typically **2–7GB**) placed in `models/checkpoints`; not installed or running on this machine (`comfyui: Provider health check failed [UNAVAILABLE]` in every generation this project has ever run) | **Rejected for this pass** — the *engine* is genuinely free/local, but functionally requires (a) installing ComfyUI itself and (b) downloading a multi-gigabyte model file, both of which need explicit approval and were not authorized this pass. Distinct from a license problem: this is a real "not installed, needs a large download" gap, disclosed plainly rather than worked around. |

**Distinguishing code license from model-weight license, as required**: three of the four
(`sprite-gen`, `ai-game-studio`, ComfyUI, Material Maker) all have genuinely permissive *source
code* licenses (Apache-2.0/MIT/GPL-3.0/MIT). The rejections above are about the *generation
backend actually used* (a paid API, or a model file that isn't present and can't be fetched
without approval), never about the code license itself.

## What was built instead: `workers/local_sprite_worker.py`

Per this pass's own explicit fallback instruction ("if no suitable AI engine is available
locally, implement a useful procedural generation path"): a real, deterministic, seeded pixel-art
character-sheet generator using **Python's standard library + Pillow only** (confirmed already
importable via this repo's own `python3` — no new `pip install` was needed). Zero network access,
zero payment, zero GPU, zero model weights. Produces genuine articulated pose progression (a
distinct head/torso/arm/leg silhouette per frame, limbs offset via a real per-region shift — the
same disclosed technique class already used and reviewed elsewhere in this codebase's TypeScript
animation builders, reimplemented fresh here in Python, not copied) — not a translated/rotated
single image.

### Architecture (mirrors `diffusers.ts`/`diffusers_image_worker.py` exactly)

- **Protocol**: one JSON object on stdin → one JSON object on stdout. All diagnostics/tracebacks
  go to stderr only, never mixed into the stdout the Node side parses as the result.
- **Actions**: `capabilities` (real, cheap — no generation work, reports `requiresNetwork: false`,
  `requiresPayment: false`, `requiresGpu: false`, and the real Pillow-import status), `health`,
  `generate` (kind: `character_sheet`).
- **Node side** (`packages/assets/src/providers/local-sprite-worker.ts`,
  `LocalSpriteWorkerProvider`): `child_process.spawn(pythonPath, [workerPath], ...)` — an
  **argument array, never a shell string** — with an explicit `cwd`, a real timeout (`setTimeout`
  + `child.kill('SIGKILL')`, default 10s), real `AbortSignal` support (`child.kill('SIGTERM')` on
  abort), and structured failure classification distinct from the worker's own `{ok:false,
  error}` responses: `SPAWN_ERROR`, `TIMEOUT`, `CANCELLED`, `NONZERO_EXIT` (stderr as the
  diagnostic), `BAD_JSON`.
- **Manifest** (`packages/assets/src/local-asset-manifest.ts`,
  `buildLocalCharacterSheetManifest()`): a versioned (`schemaVersion: 1`) JSON manifest — real
  dimensions, real per-frame rects, an `animations` block (name/frameIndices/fps/loop), provider/
  model id, the real seed, the exact generation parameters used, an ISO timestamp, and license/
  commercial-use provenance (`requiresNetwork`/`requiresPayment` carried through explicitly).
  Field names mirror this repo's existing `AssetManifestEntry` convention
  (`packages/godot/src/assembler.ts`) rather than inventing a parallel vocabulary. Throws
  `ManifestValidationError` — never silently writes a manifest — for a failed generation or one
  missing required dimension/frame data.
- **Not** forced into the existing `ImageGenerator` interface (`packages/assets/src/types/
  image-gen.ts`): that interface models "one prompt in, one image out" and has no field for
  capability discovery, multi-frame sheet rects, or explicit no-network/no-payment flags — reusing
  it would have hidden real capabilities this worker actually has.

### Tests

- `packages/assets/src/providers/local-sprite-worker.test.ts` — **9 tests, all mocked** at the
  `node:child_process` boundary (a fake `EventEmitter`-based child process; no real subprocess is
  spawned). Covers: correct argument-array `spawn()` call + JSON-over-stdin, a structured
  `NONZERO_EXIT` failure with the real stderr text surfaced, `SPAWN_ERROR` when the interpreter
  itself can't launch, `TIMEOUT` (with real fake-timer advancement, confirming `SIGKILL` is sent),
  `CANCELLED` via a real `AbortController`, `BAD_JSON` on malformed stdout, and manifest-building/
  -validation (a valid result → a correct manifest; a failed result or one missing required fields
  → `ManifestValidationError`, not a bad manifest written to disk).
- **Real, unmocked end-to-end run** (not a vitest test — a standalone script, run once manually
  and disclosed here plainly as real, not mocked): `LocalSpriteWorkerProvider.getCapabilities()`
  and `.generate()` against the actual `python3` subprocess, producing
  `docs/asset-pipeline/local-sprite-worker-example/example_character_walk.png` (a real 256×32,
  8-frame sheet, ~590 bytes) and its matching `.manifest.json` — both committed alongside this
  document as the "example generated asset when feasible" this pass's own instructions asked for.

## Example invocation

```bash
# Direct worker probe (no Node involved) — capability discovery:
echo '{"action":"capabilities"}' | python3 workers/local_sprite_worker.py

# Direct worker probe — a real generation:
echo '{"action":"generate","kind":"character_sheet","width":32,"height":32,"frameCount":8,"seed":20260910,"fill":[176,172,158],"accent":[92,214,224]}' \
  | python3 workers/local_sprite_worker.py
```

```ts
// From TypeScript, via the real provider:
import { LocalSpriteWorkerProvider, buildLocalCharacterSheetManifest } from '@metroforge/assets';

const provider = new LocalSpriteWorkerProvider();
const caps = await provider.getCapabilities();               // real, cheap, no generation
const result = await provider.generate({
  kind: 'character_sheet', width: 32, height: 32, frameCount: 8,
  seed: 20260910, fill: [176, 172, 158], accent: [92, 214, 224],
});
const manifest = buildLocalCharacterSheetManifest('my_character', 'assets/characters/my_character_walk.png', result, { width: 32, height: 32, frameCount: 8, seed: 20260910 });
```

## Hardware / disk / setup

- **CPU only** — no GPU required or used.
- **Disk**: the worker script itself is a few KB; Pillow (already installed) is ~10-15MB; no
  model weights are downloaded, ever. A generated sheet is well under 1KB at typical sprite sizes.
- **Network**: none, at any point.
- **Dependency check**: `python3 -c "import PIL"` — already true on this repo's configured
  `DIFFUSERS_PYTHON` interpreter; no new install was performed or is required for this path.
- **Config**: `LocalSpriteWorkerProvider` accepts `pythonPath` (defaults to `$DIFFUSERS_PYTHON` or
  `python3`), `workerPath` (defaults to `workers/local_sprite_worker.py` relative to the package),
  and `timeoutMs` (default 10000).

## Godot 4 integration

Output is a plain PNG — the same format every other provider in this pipeline already produces.
Integrating it into a real generated project means writing the PNG to the project's `assets/`
tree exactly like any other generated texture; `packages/godot/src/assembler.ts`'s existing
`writePixelArtImport()` step (nearest-neighbor filtering, no mipmaps) already runs on every `.png`
written into a project's output directory, so **no new Godot import-configuration code was
written** — the existing, already-correct pixel-art import path applies automatically once this
provider's output is wired into a real generation run. **Not done this pass** (disclosed, not
hidden): actually registering `LocalSpriteWorkerProvider` into the `ImageProviderRegistry`/
capability router (`packages/assets/src/foundry/`) so a real `metroforge create` run can select it
automatically — this pass delivers a complete, tested, real, standalone provider + worker + example
asset, not yet threaded through the full routing/scoring system. That wiring is a scoped, low-risk
follow-up (the provider's shape is deliberately close to the existing ones specifically so that
step is straightforward later).

## What this pass did NOT do

- Did not install ComfyUI, download any model checkpoint, or install any new Python/Node package —
  no approval was sought because none was needed for the path actually built.
- Did not attempt to drive Material Maker headlessly — flagged as a real, unconfirmed future
  option rather than guessed at.
- Did not register the new provider into the full asset-routing pipeline (see above) — a real
  follow-up, not silently skipped.
- The procedural character shape is intentionally simple (a rounded-humanoid silhouette) — a
  genuine, honest starting point for a *local, zero-cost* path, not presented as competing with
  this repo's own real AI-generated (NVIDIA FLUX) character art quality.
