import { describe, expect, it } from 'vitest';
import { latestPhases } from './latest-phases.js';
describe('restored phase history', () => {
  it('replaces starts with completion without hiding degraded or failed results', () => {
    expect(latestPhases([
      {phase:'dna',status:'RUNNING'}, {phase:'dna',status:'PASSED'},
      {phase:'assets',status:'RUNNING'}, {phase:'assets',status:'DEGRADED'},
      {phase:'qa',status:'RUNNING'}, {phase:'qa',status:'FAILED'},
    ])).toEqual([{phase:'dna',status:'PASSED'},{phase:'assets',status:'DEGRADED'},{phase:'qa',status:'FAILED'}]);
  });
  it('keeps a later retry running instead of forcing completion', () => {
    expect(latestPhases([{phase:'qa',status:'FAILED'},{phase:'qa',status:'RUNNING'}]))
      .toEqual([{phase:'qa',status:'RUNNING'}]);
  });
});