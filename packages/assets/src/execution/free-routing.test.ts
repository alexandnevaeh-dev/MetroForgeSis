import { describe, expect, it } from 'vitest';
import { selectFreeExecutionRoute } from './free-routing.js';
import type { FreeRoutableBackend } from './free-routing.js';

function backend(overrides: Partial<FreeRoutableBackend> & { id: string; provider: string; costTier: FreeRoutableBackend['costTier']; readiness: string }): FreeRoutableBackend {
  return {
    id: overrides.id,
    readiness: overrides.readiness,
    costTier: overrides.costTier,
    target: { id: overrides.id, type: 'HF_ZEROGPU_SPACE', location: 'remote', provider: overrides.provider, capabilities: [], health: 'UNKNOWN' },
  };
}

describe('selectFreeExecutionRoute', () => {
  it('prefers Hugging Face ZeroGPU over Lightning and local when both are ready', () => {
    const decision = selectFreeExecutionRoute([
      backend({ id: 'lightning', provider: 'lightning-ai', costTier: 'FREE_CREDIT', readiness: 'REFERENCE_CAPABLE' }),
      backend({ id: 'hf', provider: 'huggingface-zerogpu', costTier: 'FREE_QUOTA', readiness: 'REFERENCE_CAPABLE' }),
      backend({ id: 'local', provider: 'local', costTier: 'FREE', readiness: 'REFERENCE_CAPABLE' }),
    ]);
    expect(decision.selected?.id).toBe('hf');
  });

  it('falls back to Lightning when Hugging Face is not ready', () => {
    const decision = selectFreeExecutionRoute([
      backend({ id: 'hf', provider: 'huggingface-zerogpu', costTier: 'FREE_QUOTA', readiness: 'QUOTA_EXHAUSTED' }),
      backend({ id: 'lightning', provider: 'lightning-ai', costTier: 'FREE_CREDIT', readiness: 'REFERENCE_CAPABLE' }),
    ]);
    expect(decision.selected?.id).toBe('lightning');
  });

  it('never silently selects a PAID backend under FREE_ONLY, even if it is the only ready one', () => {
    const decision = selectFreeExecutionRoute([
      backend({ id: 'runpod', provider: 'runpod', costTier: 'PAID', readiness: 'REFERENCE_CAPABLE' }),
    ]);
    expect(decision.selected).toBeUndefined();
    expect(decision.rejectedPaid).toHaveLength(1);
    expect(decision.reason).toContain('REFERENCE_GENERATION_UNAVAILABLE');
  });

  it('reports REFERENCE_GENERATION_UNAVAILABLE when nothing free is ready', () => {
    const decision = selectFreeExecutionRoute([
      backend({ id: 'hf', provider: 'huggingface-zerogpu', costTier: 'FREE_QUOTA', readiness: 'QUOTA_EXHAUSTED' }),
    ]);
    expect(decision.selected).toBeUndefined();
    expect(decision.reason).toContain('REFERENCE_GENERATION_UNAVAILABLE');
  });

  it('allows PAID backends only when explicitly permitted', () => {
    const decision = selectFreeExecutionRoute(
      [backend({ id: 'runpod', provider: 'runpod', costTier: 'PAID', readiness: 'REFERENCE_CAPABLE' })],
      { allowPaid: true },
    );
    expect(decision.selected?.id).toBe('runpod');
    expect(decision.rejectedPaid).toHaveLength(0);
  });
});
