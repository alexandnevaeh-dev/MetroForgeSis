import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertPhaseArtifacts, phaseCompleteStatus } from './phase-contract.js';

describe('phase COMPLETE contract', () => {
  it('fails when declared artifacts are missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-phase-'));
    const check = assertPhaseArtifacts(dir, ['game_dna.json', 'design_bible.json']);
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual(['game_dna.json', 'design_bible.json']);
    expect(phaseCompleteStatus(check)).toBe('FAILED');
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes only after artifacts persist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-phase-'));
    writeFileSync(join(dir, 'game_dna.json'), '{}');
    writeFileSync(join(dir, 'design_bible.json'), '{}');
    const check = assertPhaseArtifacts(dir, ['game_dna.json', 'design_bible.json']);
    expect(check.ok).toBe(true);
    expect(phaseCompleteStatus(check, true)).toBe('PASSED');
    expect(phaseCompleteStatus(check, false)).toBe('FAILED');
    rmSync(dir, { recursive: true, force: true });
  });
});
