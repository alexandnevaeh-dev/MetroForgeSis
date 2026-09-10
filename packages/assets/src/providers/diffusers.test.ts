import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DiffusersProvider } from './diffusers.js';
import { generationRequestHash, buildGenerationSpecification } from '../pipeline-v2/production-capacity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Dependency-free (stdlib-only) stub worker — no torch, no model, no real tokenizer — so these
// regressions run fast and unconditionally in the normal suite. See its own header comment for
// why it must never be pointed at by a real generation path.
const STUB_WORKER = join(__dirname, '__fixtures__', 'stub_diffusers_worker.py');

function stubProvider(overrides: { generationTimeoutMs?: number } = {}) {
  return new DiffusersProvider({
    pythonPath: 'python3', workerPath: STUB_WORKER, modelId: 'stub-model', device: 'mps',
    generationTimeoutMs: overrides.generationTimeoutMs ?? 10_000,
  });
}

describe('DiffusersProvider — inferenceSteps precedence (regression for the fixed provenance bug)', () => {
  it('sends a per-request inferenceSteps to the worker instead of the process-wide default', async () => {
    const provider = stubProvider();
    const result = await provider.generateImage({ profile: 'CHARACTER', prompt: 'p', width: 8, height: 8, seed: 1, inferenceSteps: 17 });
    expect(result.executionMetadata?.effectiveSteps).toBe(17);
  });

  it('falls back to the existing default (6) when inferenceSteps is not set — unchanged prior behavior', async () => {
    const provider = stubProvider();
    const result = await provider.generateImage({ profile: 'CHARACTER', prompt: 'p', width: 8, height: 8, seed: 1 });
    expect(result.executionMetadata?.effectiveSteps).toBe(6);
  });

  it('rejects a discrepancy: the worker-reported effective steps must be inspectable against what was requested', async () => {
    const provider = stubProvider();
    const requested = 23;
    const result = await provider.generateImage({ profile: 'CHARACTER', prompt: 'p', width: 8, height: 8, seed: 1, inferenceSteps: requested });
    // This is the actual discrepancy check a caller should run: compare requested vs effective
    // and fail loudly rather than silently trust either side.
    expect(result.executionMetadata?.effectiveSteps).toBe(requested);
  });
});

describe('DiffusersProvider — effective conditioning provenance', () => {
  it('echoes the exact prompt/negative prompt/dimensions actually sent, for provenance', async () => {
    const provider = stubProvider();
    const result = await provider.generateImage({
      profile: 'ITEM', prompt: 'a curated prompt', negativePrompt: 'a curated negative', width: 32, height: 32, seed: 5, inferenceSteps: 20,
    });
    expect(result.executionMetadata?.effectivePrompt).toBe('a curated prompt');
    expect(result.executionMetadata?.effectiveNegativePrompt).toBe('a curated negative');
    expect(result.executionMetadata?.effectiveWidth).toBe(32);
    expect(result.executionMetadata?.effectiveHeight).toBe(32);
    expect(result.executionMetadata?.effectiveSteps).toBe(20);
  });
});

describe('DiffusersProvider — prompt-budget check plumbing', () => {
  it('checkPromptBudget() reaches the worker and returns a structured positive/negative result', async () => {
    const provider = stubProvider();
    const result = await provider.checkPromptBudget('a short prompt', 'a short negative');
    expect(result.ok).toBe(true);
    expect(result.positive?.overflow).toBe(false);
    expect(result.negative?.overflow).toBe(false);
    expect(result.anyOverflow).toBe(false);
  });

  it('reports overflow for a request the stub tokenizer counts as too long', async () => {
    const provider = stubProvider();
    const longPrompt = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
    const result = await provider.checkPromptBudget(longPrompt, '');
    expect(result.ok).toBe(true);
    expect(result.positive?.overflow).toBe(true);
    expect(result.positive?.overflowBy).toBeGreaterThan(0);
    expect(result.anyOverflow).toBe(true);
  });

  it('checks positive and negative prompts independently — one overflowing does not mask the other status', async () => {
    const provider = stubProvider();
    const longPrompt = Array.from({ length: 90 }, (_, i) => `word${i}`).join(' ');
    const result = await provider.checkPromptBudget(longPrompt, 'short negative');
    expect(result.positive?.overflow).toBe(true);
    expect(result.negative?.overflow).toBe(false);
  });
});

describe('DiffusersProvider — segmentForeground() plumbing', () => {
  it('sends the image and decodes the returned matte', async () => {
    const provider = stubProvider();
    const input = Buffer.from('fake-png-bytes');
    const result = await provider.segmentForeground(input);
    expect(result.ok).toBe(true);
    expect(result.buffer?.equals(input)).toBe(true);
    expect(result.model).toBe('stub-u2net');
    expect(result.modelVersion).toBe('stub-v1');
    expect(result.occupancy).toBe(0.5);
  });
});

describe('changed conditioning produces a distinct request identity (generationRequestHash)', () => {
  it('a different composed prompt changes the hash even with every other field identical', () => {
    const base = { id: 'x', category: 'player' as const, seed: 1, runtimeUse: 'u', artDirection: 'a' };
    const specA = buildGenerationSpecification(base, { model: 'm', prompt: 'original long style — subject', width: 8, height: 8 });
    const specB = buildGenerationSpecification(base, { model: 'm', prompt: 'curated short style — subject', width: 8, height: 8 });
    expect(generationRequestHash(specA)).not.toBe(generationRequestHash(specB));
  });

  it('a different model identity (v1 vs v2 profile) changes the hash even with an identical prompt', () => {
    const base = { id: 'x', category: 'prop' as const, seed: 1, runtimeUse: 'u', artDirection: 'a' };
    const specV1 = buildGenerationSpecification(base, { model: 'sd-1.5-apple-mps', prompt: 'same prompt', width: 8, height: 8 });
    const specV2 = buildGenerationSpecification(base, { model: 'sd-1.5-apple-mps-v2', prompt: 'same prompt', width: 8, height: 8 });
    expect(generationRequestHash(specV1)).not.toBe(generationRequestHash(specV2));
  });

  it('an identical request reproduces an identical hash (determinism, not just distinctness)', () => {
    const base = { id: 'x', category: 'player' as const, seed: 1, runtimeUse: 'u', artDirection: 'a' };
    const specA = buildGenerationSpecification(base, { model: 'm', prompt: 'p', width: 8, height: 8 });
    const specB = buildGenerationSpecification(base, { model: 'm', prompt: 'p', width: 8, height: 8 });
    expect(generationRequestHash(specA)).toBe(generationRequestHash(specB));
  });
});
