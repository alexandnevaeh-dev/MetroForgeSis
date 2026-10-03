import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { quantumRuntimeFailures } from './quantum-runtime.js';
const [before, after] = JSON.parse(readFileSync(new URL('./fixtures/quantum-release-evidence.json', import.meta.url), 'utf8'));

describe('Quantum source and standalone gameplay evidence', () => {
  it('rejects the actual release run whose assertion-only setup removed enemies and objectives', () => {
    expect(quantumRuntimeFailures(before.runtime, before.expected, true)).toEqual(expect.arrayContaining(['route', 'extraction', 'enemies', 'boss', 'animations']));
  });
  it('accepts the corrected native release route including package, combat and animations', () => {
    expect(quantumRuntimeFailures(after.runtime, after.expected, true)).toEqual([]);
  });
  it('cannot substitute an editor run for standalone release evidence', () => {
    const source = structuredClone(after.runtime);
    source.generation.package.standalone = false;
    source.generation.package.release = false;
    expect(quantumRuntimeFailures(source, after.expected)).toEqual([]);
    expect(quantumRuntimeFailures(source, after.expected, true)).toContain('standalone');
  });
  it('rejects configuration drift, missing animation states and incomplete contacts', () => {
    const altered = structuredClone(after.runtime);
    altered.generation.configuration_sha256 = 'different';
    altered.art.actorStates.golem.death = false;
    altered.art.propChecks = 0;
    expect(quantumRuntimeFailures(altered, after.expected, true)).toEqual(expect.arrayContaining(['configuration', 'animations', 'contacts']));
  });
});
