import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DiffusersProvider } from './diffusers.js';
import {
  APPLE_NATIVE_MPS_PROFILE, APPLE_NATIVE_MPS_PROFILE_V2, CURATED_STYLE_V2,
  CURATED_NEGATIVE_PROMPT_V2, APPLE_NATIVE_MPS_V2_SUBJECTS,
} from './apple-native-mps-profile.js';

/**
 * Regressions against the REAL CLIP tokenizer for the Apple-native MPS model — not the fast
 * word-count stub used by diffusers.test.ts. Requires the machine-specific
 * `.venv-diffusers-mps/` + downloaded model this repo cannot assume exists (same reason the real
 * generation fixtures are gated) — skipped, not failed, when absent. Where it CAN run, it proves
 * the actual token-budget behavior this milestone is about, using the same worker code path a
 * real generation would use (`checkPromptBudget()` -> `check_prompt` action), not a
 * reimplementation.
 */
const VENV_PRESENT = existsSync(APPLE_NATIVE_MPS_PROFILE.pythonPath) && existsSync(APPLE_NATIVE_MPS_PROFILE.workerPath);

// Verbatim locked-profile STYLE text (packages/assets/src/pipeline-v2/modern-cohesion.evidence.test.ts)
// — copied here only to prove, against the real tokenizer, that it overflows; never used to
// compose an actual request.
const LOCKED_STYLE_116_TOKENS = `Modern premium 2D side-view industrial sci-fi game asset. Futuristic underground metro. Orthographic side view. Crisp hard-edged silhouette, restrained graphite and gunmetal materials, cool overhead-left lighting, compact shadows, controlled detail, consistent 16px grid density. Semantic accents only: cyan for player and interaction, orange for hostile, amber for hazard. Contemporary clean production art, not retro pixel art. No text, photorealism, painterly scenery, bloom, random neon, noise, watermark, perspective view, or cropped subject.`;

describe.skipIf(!VENV_PRESENT)('prompt budget — real CLIP tokenizer for the Apple-native MPS model', () => {
  const provider = new DiffusersProvider({
    pythonPath: APPLE_NATIVE_MPS_PROFILE_V2.pythonPath,
    workerPath: APPLE_NATIVE_MPS_PROFILE_V2.workerPath,
    modelId: APPLE_NATIVE_MPS_PROFILE_V2.modelId,
    device: 'mps',
  });

  it('reproduces the diagnosed defect: the locked STYLE text alone overflows CLIP (real tokenizer, not assumed)', async () => {
    const result = await provider.checkPromptBudget(LOCKED_STYLE_116_TOKENS, '');
    expect(result.ok).toBe(true);
    expect(result.tokenizerClass).toBe('CLIPTokenizer');
    expect(result.positive?.maxTokens).toBe(77);
    expect(result.positive?.overflow).toBe(true);
    expect(result.positive?.tokenCount).toBeGreaterThan(77);
  }, { timeout: 30_000, retry: 1 });

  it('the locked STYLE + a real category runtimeUse discards the entire subject text (the actual failure mode found this session)', async () => {
    const combined = `${LOCKED_STYLE_116_TOKENS} — metro power terminal isolated side-view prop`;
    const result = await provider.checkPromptBudget(combined, '');
    expect(result.positive?.overflow).toBe(true);
    // The whole point of the defect: overflow is large enough that essentially all
    // category-specific text after the style preamble is guaranteed to be dropped.
    expect(result.positive!.overflowBy).toBeGreaterThan(20);
  }, { timeout: 30_000, retry: 1 });

  it('every curated v2 subject fits within budget IN FULL alongside the shortened style — verified, not assumed', async () => {
    for (const [category, subject] of Object.entries(APPLE_NATIVE_MPS_V2_SUBJECTS)) {
      const combined = `${CURATED_STYLE_V2} — ${subject}`;
      const result = await provider.checkPromptBudget(combined, CURATED_NEGATIVE_PROMPT_V2);
      expect(result.ok, `check failed for ${category}`).toBe(true);
      expect(result.positive?.overflow, `${category} positive prompt overflowed: ${JSON.stringify(result.positive)}`).toBe(false);
      expect(result.negative?.overflow, `${category} negative prompt overflowed: ${JSON.stringify(result.negative)}`).toBe(false);
    }
    // This loop spawns one real worker subprocess per subject in APPLE_NATIVE_MPS_V2_SUBJECTS --
    // the eighth session added two more entries (prop_power_terminal_v2/_v3), pushing 4 sequential
    // real subprocess round-trips over the original 30s budget under load. Timeout scaled to the
    // now-larger loop, not tightened logic.
  }, { timeout: 60_000, retry: 1 });

  it('checks positive and negative conditioning independently — a long positive prompt does not affect the negative prompt result', async () => {
    const result = await provider.checkPromptBudget(LOCKED_STYLE_116_TOKENS, CURATED_NEGATIVE_PROMPT_V2);
    expect(result.positive?.overflow).toBe(true);
    expect(result.negative?.overflow).toBe(false);
  }, { timeout: 30_000, retry: 1 });

  it('real tokenizer boundary: a prompt engineered to exactly 77 tokens does not overflow, and one token more does', async () => {
    // metro_power_terminal_v3's exact prompt from the prior session — measured at exactly 77
    // tokens including special tokens (<|startoftext|>/<|endoftext|>).
    const exactly77 = `${CURATED_STYLE_V2} — a single freestanding rectangular control panel object, front face with screen and buttons, isolated on plain background, centered, not a repeating pattern or tile`;
    const atBoundary = await provider.checkPromptBudget(exactly77, '');
    expect(atBoundary.positive?.tokenCount).toBe(77);
    expect(atBoundary.positive?.overflow).toBe(false);

    const oneOver = `${exactly77} extra`;
    const overBoundary = await provider.checkPromptBudget(oneOver, '');
    expect(overBoundary.positive!.tokenCount).toBeGreaterThan(77);
    expect(overBoundary.positive?.overflow).toBe(true);
    expect(overBoundary.positive?.overflowBy).toBeGreaterThan(0);
  }, { timeout: 30_000, retry: 1 });
});
