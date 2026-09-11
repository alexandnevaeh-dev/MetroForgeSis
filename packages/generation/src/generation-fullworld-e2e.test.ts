import { describe, it, expect } from 'vitest';
import { rmSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GenerationPipeline } from './pipeline.js';

// These tests exist to answer a single question the graph-level vitest suite
// (packages/procedural/src/world-design.test.ts) cannot: does a completely normal `create` run —
// no worldOverride.biomeCount, no test-only knobs — actually reach generateFullMetroidvaniaWorld
// and the world_design_metroidvania QA gate, for the profiles that are supposed to? worldOverride
// is used ONLY to cap roomCount for test speed (never biomeCount) — the whole point here is
// proving the profile's own PROFILE_DEFAULTS.biomes is what decides the path, not an override.
describe('generation e2e — normal full-world path (no biomeCount override)', () => {
  async function run(profile: 'SMALL' | 'MEDIUM' | 'RELEASE_CANDIDATE' | 'VISUAL_VERTICAL_SLICE', roomCount?: number) {
    const slug = `e2e-fullworld-${profile.toLowerCase()}-${Date.now()}`;
    const dataDir = mkdtempSync(join(tmpdir(), 'mf-e2e-fw-'));
    const prevDataDir = process.env.METROFORGE_DATA_DIR;
    process.env.METROFORGE_DATA_DIR = dataDir;
    const pipeline = new GenerationPipeline();
    try {
      const result = await pipeline.run({
        prompt: `Normal full-world path check: ${profile}`,
        profile,
        mode: 'LOCAL_ONLY',
        seed: 900001,
        slug,
        skipRuntimeValidation: true,
        skipExport: true,
        ...(roomCount ? { worldOverride: { roomCount } } : {}),
      });
      return result;
    } finally {
      if (prevDataDir === undefined) delete process.env.METROFORGE_DATA_DIR;
      else process.env.METROFORGE_DATA_DIR = prevDataDir;
      rmSync(dataDir, { recursive: true, force: true });
    }
  }

  it(
    'SMALL reaches the full-world generator/gate on its own default biome count (4)',
    async () => {
      const result = await run('SMALL', 40);
      expect(result.outputPath).toBeTruthy();
      try {
        const worldGraph = JSON.parse(readFileSync(join(result.outputPath!, 'world_graph.json'), 'utf-8'));
        expect(worldGraph.regions.length).toBeGreaterThanOrEqual(4);
        const validation = JSON.parse(readFileSync(join(result.outputPath!, 'validation_report.json'), 'utf-8'));
        const gate = validation.results.find((r: { gate: string }) => r.gate === 'world_design_metroidvania');
        expect(gate).toBeTruthy();
        expect(gate.state).not.toBe('SKIPPED');
        expect(gate.passed).toBe(true);
        const report = readFileSync(join(result.outputPath!, 'world_design_report.txt'), 'utf-8');
        expect(report).toContain('=== ZONE BREAKDOWN ===');
      } finally {
        rmSync(result.outputPath!, { recursive: true, force: true });
      }
    },
    300_000,
  );

  it(
    'MEDIUM reaches the full-world generator/gate on its own default biome count (5)',
    async () => {
      const result = await run('MEDIUM', 50);
      expect(result.outputPath).toBeTruthy();
      try {
        const worldGraph = JSON.parse(readFileSync(join(result.outputPath!, 'world_graph.json'), 'utf-8'));
        expect(worldGraph.regions.length).toBeGreaterThanOrEqual(4);
        const validation = JSON.parse(readFileSync(join(result.outputPath!, 'validation_report.json'), 'utf-8'));
        const gate = validation.results.find((r: { gate: string }) => r.gate === 'world_design_metroidvania');
        expect(gate).toBeTruthy();
        expect(gate.state).not.toBe('SKIPPED');
        expect(gate.passed).toBe(true);
      } finally {
        rmSync(result.outputPath!, { recursive: true, force: true });
      }
    },
    600_000,
  );

  it(
    'RELEASE_CANDIDATE reaches full-world topology before being correctly blocked by the MASS gate',
    async () => {
      // RC is MASS-gated (isMassVisualProfile) — a fresh slug has no approved visual slice, so
      // this run MUST fail at environment_assets. That gate check happens strictly after
      // world_topology/progression_graph/world_design_report already ran (see pipeline.ts), so a
      // failure here is the MASS gate correctly blocking, not a defect — the assertions below
      // only look at what was written *before* that phase to prove the normal path reached
      // full-world generation for a MASS-gated profile too, without this test bypassing the gate.
      const result = await run('RELEASE_CANDIDATE', 60);
      expect(result.outputPath).toBeTruthy();
      try {
        expect(result.success).toBe(false);
        const worldGraph = JSON.parse(readFileSync(join(result.outputPath!, 'world_graph.json'), 'utf-8'));
        expect(worldGraph.regions.length).toBeGreaterThanOrEqual(4);
        expect(existsSync(join(result.outputPath!, 'world_design_report.txt'))).toBe(true);
        const massBlocked = result.errors.some((e) => /visual|approv|mass/i.test(e));
        expect(massBlocked).toBe(true);
      } finally {
        rmSync(result.outputPath!, { recursive: true, force: true });
      }
    },
    300_000,
  );

  it(
    'VISUAL_VERTICAL_SLICE stays exempt (small slice, not a full 4-zone world) on a normal run',
    async () => {
      const result = await run('VISUAL_VERTICAL_SLICE');
      expect(result.outputPath).toBeTruthy();
      try {
        const worldGraph = JSON.parse(readFileSync(join(result.outputPath!, 'world_graph.json'), 'utf-8'));
        expect(worldGraph.regions.length).toBeLessThan(4);
        const validation = JSON.parse(readFileSync(join(result.outputPath!, 'validation_report.json'), 'utf-8'));
        const gate = validation.results.find((r: { gate: string }) => r.gate === 'world_design_metroidvania');
        expect(gate).toBeTruthy();
        expect(gate.state).toBe('SKIPPED');
      } finally {
        rmSync(result.outputPath!, { recursive: true, force: true });
      }
    },
    300_000,
  );
});
