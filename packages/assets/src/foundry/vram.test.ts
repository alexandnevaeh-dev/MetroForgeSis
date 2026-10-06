import { describe, expect, it } from 'vitest';
import { effectiveVramBudgetMb, evaluateVramFit, usableVramMb } from './vram.js';

describe('usableVramMb', () => {
  it('applies the safety margin to total VRAM', () => {
    expect(usableVramMb({ vramMb: 8192 })).toBe(Math.floor(8192 * 0.85));
  });

  it('caps by free VRAM minus workflow overhead when free VRAM is known', () => {
    expect(usableVramMb({ vramMb: 8192, freeVramMb: 2000 })).toBe(2000 - 512);
  });
});

describe('evaluateVramFit', () => {
  it('allows remote providers regardless of footprint', () => {
    expect(evaluateVramFit({ local: false, estimatedVramMb: 24000 }, { hardware: { vramMb: 8192 } }).ok).toBe(
      true,
    );
  });

  it('rejects a local workflow larger than total VRAM', () => {
    const result = evaluateVramFit(
      { local: true, estimatedVramMb: 16384 },
      { hardware: { vramMb: 8151 } },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/exceeds total VRAM/i);
  });

  it('allows CPU-offload providers that exceed the free-VRAM budget but fit in total VRAM', () => {
    const result = evaluateVramFit(
      { local: true, estimatedVramMb: 7000, supportsCpuOffload: true },
      { hardware: { vramMb: 8151, freeVramMb: 1500 }, qualityProfile: 'DRAFT' },
    );
    expect(result.ok).toBe(true);
  });

  it('does not block when VRAM is unknown', () => {
    expect(evaluateVramFit({ local: true, estimatedVramMb: 16384 }, {}).ok).toBe(true);
  });
});

describe('effectiveVramBudgetMb', () => {
  it('LOW_VRAM caps the budget at 8 GB', () => {
    const budget = effectiveVramBudgetMb({
      mode: 'LOW_VRAM',
      hardware: { vramMb: 24576, freeVramMb: 24000 },
    });
    expect(budget).toBeLessThanOrEqual(8192);
  });
});
