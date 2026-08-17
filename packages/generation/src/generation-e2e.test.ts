import { describe, it, expect } from 'vitest';
import { rmSync, existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GenerationPipeline } from './pipeline.js';
import { loadProjectContext } from './project-loader.js';
import { analyzeProjectCompletion } from './project-completion.js';

describe('generation e2e — TINY_TEST pipeline', () => {
  it(
    'generates a complete project folder with victory path and completion analysis',
    async () => {
      const slug = `e2e-tiny-${Date.now()}`;
      const dataDir = mkdtempSync(join(tmpdir(), 'mf-e2e-'));
      const prevDataDir = process.env.METROFORGE_DATA_DIR;
      process.env.METROFORGE_DATA_DIR = dataDir;

      const pipeline = new GenerationPipeline();
      let result: Awaited<ReturnType<GenerationPipeline['run']>>;
      try {
        result = await pipeline.run({
          prompt: 'E2E tiny test metroidvania',
          profile: 'TINY_TEST',
          mode: 'LOCAL_ONLY',
          seed: 4242,
          slug,
          skipRuntimeValidation: true,
        });
      } finally {
        if (prevDataDir === undefined) delete process.env.METROFORGE_DATA_DIR;
        else process.env.METROFORGE_DATA_DIR = prevDataDir;
        rmSync(dataDir, { recursive: true, force: true });
      }

      expect(result.success).toBe(true);
      expect(result.outputPath).toBeTruthy();
      expect(existsSync(join(result.outputPath!, 'project.godot'))).toBe(true);
      expect(existsSync(join(result.outputPath!, 'game_dna.json'))).toBe(true);
      expect(existsSync(join(result.outputPath!, 'validation_report.json'))).toBe(true);

      const project = loadProjectContext(result.outputPath!);
      expect(project.gameContent.bosses.length).toBeGreaterThan(0);
      expect(project.gameContent.quests.length).toBeGreaterThan(0);

      const completion = analyzeProjectCompletion(project);
      expect(completion.victoryPathReady).toBe(true);
      expect(completion.finalBossId).toBe('boss_final');
      expect(completion.checklist.length).toBeGreaterThan(3);

      expect(result.phases.some((p) => p.phase === 'export' && p.status === 'PASSED')).toBe(true);
      expect(existsSync(join(result.outputPath!, 'export_manifest.json'))).toBe(true);
      expect(existsSync(join(result.outputPath!, 'license_report.json'))).toBe(true);

      const exportRoot = join(result.outputPath!, '..', '..', 'Exports', slug);
      if (existsSync(exportRoot)) {
        rmSync(exportRoot, { recursive: true, force: true });
      }
      rmSync(result.outputPath!, { recursive: true, force: true });
    },
    300_000,
  );
});
