import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DiffusersProvider } from './diffusers.js';
import type { ImageProviderRegistration } from '../image-router.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = join(__dirname, '..', '..', '..', '..');

/**
 * Apple-native local-profile selection: PyTorch MPS (Metal Performance Shaders), NOT the locked
 * production OpenVINO/FP32 profile. This exists because that profile's 12 GB admission floor and
 * `openvino_gpu` device target are unreachable on Apple Silicon (OpenVINO's GPU plugin does not
 * support Apple GPUs at all, independent of memory) — see
 * docs/audit/MODERN_COHESION_TEST_PROJECT.md for the full investigation trail. This profile is
 * additive: it does not change, weaken, or reinterpret the locked production profile in any way.
 *
 * Model identity is `sd-1.5-apple-mps`, deliberately distinct from the locked `sd-1.5` identity,
 * so a `generationRequestHash()` for this profile can never collide with, or be mistaken for, a
 * locked-profile result — even though both start from the same public stable-diffusion-v1-5
 * checkpoint. Precision is float16 for the UNet/text-encoder and float32 for the VAE only (a
 * documented, verified fix for a real fp16-VAE NaN defect in the base diffusers SD1.5 pipeline on
 * MPS — see the comment above the same fix in workers/apple_mps_worker.py); it is not float32
 * throughout, which was tested this session and found to exhaust swap on an 8 GB Mac.
 */
export const APPLE_NATIVE_MPS_PROFILE = {
  modelId: 'sd-1.5-apple-mps',
  device: 'mps' as const,
  precisionDescription: 'float16(unet/text_encoder)+float32(vae)',
  scheduler: 'PNDMScheduler',
  pythonPath: join(REPOSITORY_ROOT, '.venv-diffusers-mps', 'bin', 'python'),
  workerPath: join(REPOSITORY_ROOT, 'workers', 'apple_mps_worker.py'),
} as const;

/** Constructs the DiffusersProvider instance for the Apple-native MPS local profile. Reuses the
 *  existing DiffusersProvider transport (stdin/stdout JSON to a worker script) unmodified — the
 *  only difference from the locked OpenVINO profile's instantiation is which python/worker/model
 *  it points at. */
export function createAppleNativeMpsProvider(overrides: { generationTimeoutMs?: number } = {}): DiffusersProvider {
  return new DiffusersProvider({
    pythonPath: APPLE_NATIVE_MPS_PROFILE.pythonPath,
    workerPath: APPLE_NATIVE_MPS_PROFILE.workerPath,
    modelId: APPLE_NATIVE_MPS_PROFILE.modelId,
    device: APPLE_NATIVE_MPS_PROFILE.device,
    generationTimeoutMs: overrides.generationTimeoutMs ?? 900_000,
    // 'mps' is not the 'openvino_gpu' backend, so DiffusersProvider.generateImage() actually
    // times the real worker call via gpuTimeoutMs (default 420_000ms/7min), NOT
    // generationTimeoutMs (that field only governs the OpenVINO persistent-server path) -- a
    // real bug found this session when a slower-than-usual real generation was killed by the
    // 7-minute default well before the intended 15-minute budget above was ever reached.
    gpuTimeoutMs: overrides.generationTimeoutMs ?? 900_000,
  });
}

/** Registration for this profile: `local: true` (it genuinely runs on this machine, no network)
 *  but `useProductionCapacityGate: false` — this backend's admission is evidence-based inside
 *  the worker's own `health`/`generate` handlers (measured against ITS actual memory behavior),
 *  not the locked OpenVINO/FP32 gate's fixed 12 GB floor, which was never measured against this
 *  backend and must not be applied to it. */
export function appleNativeMpsRegistration(provider: DiffusersProvider): ImageProviderRegistration {
  return { provider, local: true, priority: 100, costClass: 'local', useProductionCapacityGate: false };
}

/**
 * Versioned quality profile v2 — corrected prompt composition, additive to (never replacing)
 * `APPLE_NATIVE_MPS_PROFILE` above. The v1 profile and every one of its results
 * (`test-artifacts/asset-pipeline-v2-apple-native-mps-fixture-2026-09-05/`,
 * `...-quality-2026-09-05/`) are reproducible exactly as before — nothing here changes what
 * `createAppleNativeMpsProvider()`/`appleNativeMpsRegistration()` do.
 *
 * Root cause being corrected (measured with the real CLIP tokenizer, not assumed — see
 * docs/audit/MODERN_COHESION_TEST_PROJECT.md): the locked-profile-shared `STYLE` text used by
 * `modern-cohesion.evidence.test.ts` and the v1 Apple-native fixture is 116 tokens on its own —
 * 39 over CLIP's 77-token limit — so `planner.ts`'s `providerPrompt = artDirection + ' — ' +
 * runtimeUse` composition (shared, LOCKED, unmodified production code — not touched here or
 * anywhere in this file) silently discards every category's subject-specific text before it ever
 * reaches the text encoder. `CURATED_STYLE_V2` below is a deliberately short style summary that
 * preserves the same industrial/metro/palette/non-photorealistic anchors in ~47 tokens, verified
 * with the real tokenizer to leave enough budget for each category's full subject description to
 * survive alongside it (see `APPLE_NATIVE_MPS_V2_SUBJECTS` — every entry was checked against the
 * real tokenizer before this file was written, not after).
 *
 * Model identity is `sd-1.5-apple-mps-v2` — distinct from both the locked `sd-1.5` and the v1
 * Apple-native `sd-1.5-apple-mps` — so a v2 result's `generationRequestHash()` can never collide
 * with, or be silently mistaken for, either prior profile's identity.
 */
export const CURATED_STYLE_V2 =
  'Modern 2D industrial sci-fi game asset, orthographic side view, hard-edged silhouette, graphite and gunmetal materials, cool lighting, cyan and orange and amber accents, clean production art, not photorealistic.';

/** Reinforces the same anti-tiling requirement in the negative prompt too (cheap — the negative
 *  prompt has its own separate 77-token budget, and reinforcing there costs nothing against the
 *  positive prompt's budget). Verified at 28 tokens against the real tokenizer, well under 77. */
export const CURATED_NEGATIVE_PROMPT_V2 =
  'no text, no watermark, no UI chrome, no repeating pattern, no seamless tile, no grid layout, no wall texture';

/** Per-category subject text for the v2 profile. Each entry, combined with `CURATED_STYLE_V2`
 *  via the same `style — subject` join `planner.ts` already uses, was verified with the real
 *  tokenizer to fit within 77 tokens *in full* (not merely "less bad than before") before this
 *  file was written — see docs/audit/MODERN_COHESION_TEST_PROJECT.md for the exact token counts
 *  (player: 70/77; power terminal: 77/77 exactly). Adding a new category here without re-checking
 *  its combined token count against the real tokenizer is exactly the mistake this profile exists
 *  to prevent — always verify with `checkPromptBudget`/the worker's `check_prompt` action first.
 */
export const APPLE_NATIVE_MPS_V2_SUBJECTS = {
  player: 'a single humanoid game character standing idle, full body visible facing right, clear silhouette, isolated on plain background',
  prop_power_terminal: 'a single freestanding rectangular control panel object, front face with screen and buttons, isolated on plain background, centered, not a repeating pattern or tile',
  /**
   * Eighth-session follow-up to `prop_power_terminal`: fixing the negative-prompt plumbing gap
   * (see planner.ts's `negativePrompt` field) eliminated the repeating-grid tiling defect, but
   * direct segmentation-model inspection of that result (foreground-isolation.real-model.evidence.test.ts)
   * found essentially no coherent single-object silhouette to isolate at all -- confirming the
   * remaining "loose/abstract" composition is a GENERATION defect, not a downstream-processing
   * one. This variant anchors on a well-known, strongly-represented real-world object archetype
   * (a tall rectangular cabinet with a screen and keypad on its front face) for geometric
   * coherence, rather than abstract "sci-fi control panel" language, which the model appears to
   * render as diffuse circuitry/gear texture instead of a bounded object. Verified against the
   * real tokenizer before use: 76/77 tokens combined with CURATED_STYLE_V2, 0 overflow.
   */
  prop_power_terminal_v2: 'a single ATM machine, rectangular metal cabinet, screen and keypad on front, front view, studio product photo, plain background, no scenery',
  /**
   * Second and final real-generation-budget follow-up: `prop_power_terminal_v2` fixed object
   * geometry completely (a clearly recognizable cabinet with screen/keypad, confirmed by direct
   * segmentation-model inspection finding a real, substantial foreground component for the first
   * time), but the generation rendered TWO duplicate instances side by side rather than one --
   * likely encouraged by the "studio product photo" framing, a known SD1.5 tendency toward
   * multi-item/comparison layouts for that phrasing. This variant drops that phrasing and adds
   * explicit single-instance emphasis ("one single ... alone"). Verified: 72/77 tokens combined
   * with CURATED_STYLE_V2, 0 overflow.
   */
  prop_power_terminal_v3: 'one single ATM machine alone, rectangular metal cabinet, screen and keypad on front, front view, plain background, centered',
} as const;

/** Reinforces the same anti-tiling requirement as CURATED_NEGATIVE_PROMPT_V2, plus explicit
 *  anti-scenery language for the geometry-focused terminal follow-up above. Verified at 34 tokens
 *  against the real tokenizer, well under 77. */
export const CURATED_NEGATIVE_PROMPT_V2_NO_SCENERY =
  'no text, no watermark, no UI chrome, no repeating pattern, no seamless tile, no grid layout, no wall texture, no scenery, no background';

/** Adds explicit anti-duplication language on top of CURATED_NEGATIVE_PROMPT_V2_NO_SCENERY, for
 *  the `prop_power_terminal_v3` duplication follow-up. Verified at 45 tokens, 0 overflow. */
export const CURATED_NEGATIVE_PROMPT_V2_NO_DUPLICATE =
  'no text, no watermark, no repeating pattern, no seamless tile, no grid layout, no scenery, no background, no duplicate, no multiple objects, no pair, no two, no side by side';

export const APPLE_NATIVE_MPS_PROFILE_V2 = {
  profileVersion: 'apple-native-mps-v2-curated-prompts',
  modelId: 'sd-1.5-apple-mps-v2',
  device: 'mps' as const,
  precisionDescription: APPLE_NATIVE_MPS_PROFILE.precisionDescription,
  scheduler: APPLE_NATIVE_MPS_PROFILE.scheduler,
  pythonPath: APPLE_NATIVE_MPS_PROFILE.pythonPath,
  workerPath: APPLE_NATIVE_MPS_PROFILE.workerPath,
} as const;

/** Same provider class, same transport, same worker — only `modelId` differs, which is what
 *  gives v2 requests a distinct `generationRequestHash()` identity from v1/locked results. */
export function createAppleNativeMpsProviderV2(overrides: { generationTimeoutMs?: number } = {}): DiffusersProvider {
  return new DiffusersProvider({
    pythonPath: APPLE_NATIVE_MPS_PROFILE_V2.pythonPath,
    workerPath: APPLE_NATIVE_MPS_PROFILE_V2.workerPath,
    modelId: APPLE_NATIVE_MPS_PROFILE_V2.modelId,
    device: APPLE_NATIVE_MPS_PROFILE_V2.device,
    generationTimeoutMs: overrides.generationTimeoutMs ?? 900_000,
    // 'mps' is not the 'openvino_gpu' backend, so DiffusersProvider.generateImage() actually
    // times the real worker call via gpuTimeoutMs (default 420_000ms/7min), NOT
    // generationTimeoutMs (that field only governs the OpenVINO persistent-server path) -- a
    // real bug found this session when a slower-than-usual real generation was killed by the
    // 7-minute default well before the intended 15-minute budget above was ever reached.
    gpuTimeoutMs: overrides.generationTimeoutMs ?? 900_000,
  });
}

/** Composes the final `artDirection` (the field `planner.ts` will join with a request's
 *  `runtimeUse`) for a v2-profile request. Callers still supply their own `runtimeUse` per
 *  request (from `APPLE_NATIVE_MPS_V2_SUBJECTS` or otherwise) — this only swaps in the curated,
 *  budget-verified style summary in place of the locked profile's 116-token `STYLE` text. */
export function curatedArtDirectionV2(): string {
  return CURATED_STYLE_V2;
}

/**
 * Foreground/background isolation provider (U^2-Net, see workers/u2net_model.py) for the
 * pipeline-v2 isolation stage (packages/assets/src/pipeline-v2/isolate.ts) — fixes subject-loss
 * found in the eighth session: diffusion providers emit fully-opaque RGB with no alpha channel at
 * all, so `pixel-art-processor.ts`'s existing character-framing logic had nothing real to isolate
 * and silently downscaled the whole scene into the sprite frame instead of the actual subject.
 *
 * This is a fixed local ML utility, not a versioned prompt profile — it reuses v1's
 * pythonPath/workerPath (the same worker apple_mps_worker.py handles `generate`, `check_prompt`,
 * and `segment_foreground` — one process type, one already-established transport) regardless of
 * which prompt profile (v1/v2/future) generated the source being isolated.
 */
export function createForegroundIsolationProvider(): DiffusersProvider {
  return new DiffusersProvider({
    pythonPath: APPLE_NATIVE_MPS_PROFILE.pythonPath,
    workerPath: APPLE_NATIVE_MPS_PROFILE.workerPath,
    modelId: APPLE_NATIVE_MPS_PROFILE.modelId,
    device: APPLE_NATIVE_MPS_PROFILE.device,
  });
}
