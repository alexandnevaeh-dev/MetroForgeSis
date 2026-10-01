import { describe, it, expect } from 'vitest';
import { rmSync, existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GenerationPipeline } from './pipeline.js';
import {
  resolveGodotExecutableCanonical,
  windowsExportTemplatesInstalled,
} from '@metroforge/tools';

/**
 * Proves the production packaging path: TINY_TEST → Godot runtime validate →
 * Windows Desktop export → MZ+PCK → headless launch verify.
 * Skips when Godot 4 or matching export templates are unavailable on this machine.
 */
describe('generation e2e — Windows package launch (RUNTIME_VALIDATED)', () => {
  const godot = resolveGodotExecutableCanonical();
  const hasGodot4 = Boolean(godot.path && godot.version && /^4\./.test(godot.version));
  const hasTemplates = windowsExportTemplatesInstalled('4.6.stable');
  const canPackage = process.platform === 'win32' && hasGodot4 && hasTemplates;

  it.skipIf(!canPackage)(
    'TINY_TEST packages a Windows exe that launches headless after RUNTIME_VALIDATED',
    async () => {
      const slug = `e2e-winpkg-${Date.now()}`;
      const dataDir = mkdtempSync(join(tmpdir(), 'mf-e2e-winpkg-'));
      const prevDataDir = process.env.METROFORGE_DATA_DIR;
      process.env.METROFORGE_DATA_DIR = dataDir;

      const pipeline = new GenerationPipeline();
      let result: Awaited<ReturnType<GenerationPipeline['run']>>;
      try {
        result = await pipeline.run({
          prompt: 'Windows packaging proof: tiny metroidvania',
          profile: 'TINY_TEST',
          mode: 'LOCAL_ONLY',
          seed: 424242,
          slug,
          // Must run Godot runtime validation so packaging is gated on RUNTIME_VALIDATED.
          skipRuntimeValidation: false,
        });
      } finally {
        if (prevDataDir === undefined) delete process.env.METROFORGE_DATA_DIR;
        else process.env.METROFORGE_DATA_DIR = prevDataDir;
        rmSync(dataDir, { recursive: true, force: true });
      }

      expect(result.success).toBe(true);
      expect(result.outputPath).toBeTruthy();
      expect(result.phases.some((p) => p.phase === 'export' && p.status === 'PASSED')).toBe(true);

      const projectManifestPath = join(result.outputPath!, 'export_manifest.json');
      expect(existsSync(projectManifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(projectManifestPath, 'utf-8')) as {
        packaging?: {
          packageAttempted?: boolean;
          packageSucceeded?: boolean;
          binaryVerified?: boolean;
          launchVerified?: boolean;
          status?: string;
          exePath?: string;
          pckPath?: string;
        };
      };

      expect(manifest.packaging?.packageAttempted).toBe(true);
      expect(manifest.packaging?.binaryVerified).toBe(true);
      expect(manifest.packaging?.launchVerified).toBe(true);
      expect(manifest.packaging?.packageSucceeded).toBe(true);
      expect(manifest.packaging?.status).toBe('PACKAGE_SUCCEEDED');

      const exePath = manifest.packaging?.exePath;
      expect(exePath && existsSync(exePath)).toBe(true);
      if (exePath) {
        const header = readFileSync(exePath).subarray(0, 2);
        expect(header.equals(Buffer.from('MZ'))).toBe(true);
      }
      const pckPath = manifest.packaging?.pckPath ?? exePath?.replace(/\.exe$/i, '.pck');
      expect(pckPath && existsSync(pckPath)).toBe(true);

      const exportRoot = join(result.outputPath!, '..', '..', 'Exports', slug);
      if (existsSync(exportRoot)) {
        const staging = readdirSync(exportRoot).filter((name) => name.includes('-staging-'));
        expect(staging.length).toBeGreaterThan(0);
        rmSync(exportRoot, { recursive: true, force: true });
      }
      rmSync(result.outputPath!, { recursive: true, force: true });
    },
    900_000,
  );
});
