import { describe, expect, it } from 'vitest';
import { deriveProjectReadiness } from './projectReadiness.js';

describe('deriveProjectReadiness', () => {
  it('is BLOCKED when completion is missing', () => {
    const model = deriveProjectReadiness(null);
    expect(model.status).toBe('BLOCKED');
    expect(model.completionScore).toBeNull();
  });

  it('is READY when productionReady with no warnings', () => {
    const model = deriveProjectReadiness({
      productionReady: true,
      completionScore: 92,
      blockers: [],
      warnings: [],
      checklist: [{ id: 'boss', label: 'Final boss', passed: true }],
      validationPassed: true,
      validationLevel: 'FULL',
    });
    expect(model.status).toBe('READY');
    expect(model.completionScore).toBe(92);
    expect(model.checklistPassed).toBe(1);
  });

  it('is ATTENTION when productionReady with warnings', () => {
    const model = deriveProjectReadiness({
      productionReady: true,
      completionScore: 88,
      blockers: [],
      warnings: ['Soft warning'],
    });
    expect(model.status).toBe('ATTENTION');
  });

  it('is BLOCKED when asset gate fails even if productionReady flag set incorrectly', () => {
    const model = deriveProjectReadiness({
      productionReady: false,
      blockers: ['Asset gate'],
      warnings: [],
      assetProductionGate: {
        passed: false,
        allowPlaceholders: false,
        blockedAssets: [{ path: 'a.png', maturity: 'PLACEHOLDER', reason: 'placeholder' }],
      },
    });
    expect(model.status).toBe('BLOCKED');
    expect(model.blockerCount).toBeGreaterThan(0);
  });

  it('uses counts when completionScore is absent', () => {
    const model = deriveProjectReadiness({
      productionReady: true,
      blockers: [],
      warnings: [],
      checklist: [
        { id: 'a', label: 'A', passed: true },
        { id: 'b', label: 'B', passed: false },
      ],
    });
    // productionReady false path — checklist fail still BLOCKED because productionReady missing false
    expect(model.completionScore).toBeNull();
    expect(model.checklistTotal).toBe(2);
  });
});
