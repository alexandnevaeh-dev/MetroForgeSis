import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync, mkdirSync } from 'node:fs';

import { join } from 'node:path';

import { tmpdir } from 'node:os';

import { exportProject } from './project-export.js';



describe('exportProject', () => {

  let projectPath: string;



  beforeEach(() => {

    projectPath = mkdtempSync(join(tmpdir(), 'metroforge-export-'));

    writeFileSync(join(projectPath, 'project.godot'), 'config_version=5\n');

    writeFileSync(

      join(projectPath, 'validation_report.json'),

      JSON.stringify({ passed: true, validationLevel: 'IMPORT_VALIDATED', results: [] }),

    );

    writeFileSync(

      join(projectPath, 'generation_manifest.json'),

      JSON.stringify({

        artifacts: [

          {

            id: 'a',

            path: 'assets/characters/player.png',

            provider: 'procedural',

            commercialUse: 'allowed',

            license: 'MetroForge Procedural Generator (original work)',

          },

        ],

      }),

    );

    mkdirSync(join(projectPath, 'data', 'rooms'), { recursive: true });

    writeFileSync(

      join(projectPath, 'data', 'rooms', 'rooms.json'),

      JSON.stringify({ rooms: { room_000: { id: 'room_000' } } }),

    );

  });



  afterEach(() => {

    rmSync(projectPath, { recursive: true, force: true });

  });



  it('rejects an output directory inside the source project before creating staging files', () => {
    const outputDir = join(projectPath, 'nested-export');
    const result = exportProject({ projectPath, outputDir, zip: false });
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toContain('outside the source project');
    expect(existsSync(outputDir)).toBe(false);
  });

  it('writes export_manifest in staged output', () => {

    const result = exportProject({ projectPath, zip: false });

    expect(result.success).toBe(true);

    expect(result.manifestPath).toBeTruthy();

    expect(existsSync(result.manifestPath!)).toBe(true);

    const manifest = JSON.parse(readFileSync(result.manifestPath!, 'utf-8'));

    expect(manifest.validationPassed).toBe(true);
    expect(manifest.productionReady).toBe(false);
    expect(manifest.packaging.status).toBe('STAGING_COMPLETE');
    expect(manifest.readiness.runtimeReady).toBe(false);
    expect(manifest.readiness.packageReady).toBe(false);

    expect(manifest.roomCount).toBe(1);

    expect(manifest.completionSummary).toBeTruthy();

    expect(manifest.licenseSummary.commercialSafe).toBe(true);

    expect(existsSync(join(projectPath, 'export_manifest.json'))).toBe(true);
    expect(existsSync(join(projectPath, 'license_report.json'))).toBe(true);
    const licenseReport = JSON.parse(readFileSync(join(projectPath, 'license_report.json'), 'utf-8'));
    expect(licenseReport.commercialSafe).toBe(true);
    expect(licenseReport.artifacts.length).toBe(1);
    expect(existsSync(join(result.manifestPath!.replace(/export_manifest\.json$/, 'license_report.json')))).toBe(true);
  });

  it('never sets releaseReady=true from humanVisualApprovalGranted alone — technical gates still gate it', () => {
    // A staged-only export (no --windows) can never reach packageReady, so even an explicit
    // humanVisualApprovalGranted:true must not flip releaseReady. Human approval is necessary,
    // never sufficient — it must never substitute for a real technical gate.
    const result = exportProject({ projectPath, zip: false, humanVisualApprovalGranted: true });
    expect(result.success).toBe(true);
    const manifest = JSON.parse(readFileSync(result.manifestPath!, 'utf-8'));
    expect(manifest.readiness.packageReady).toBe(false);
    expect(manifest.readiness.technicalReleaseReady).toBe(false);
    expect(manifest.readiness.humanVisualApprovalGranted).toBe(true);
    expect(manifest.readiness.releaseReady).toBe(false);
  });

  it('defaults humanVisualApprovalGranted to false and keeps releaseReady false without it', () => {
    const result = exportProject({ projectPath, zip: false });
    const manifest = JSON.parse(readFileSync(result.manifestPath!, 'utf-8'));
    expect(manifest.readiness.humanVisualApprovalGranted).toBe(false);
    expect(manifest.readiness.releaseReady).toBe(false);
    // productionReady keeps its original, narrower meaning (technical gates only) and is
    // unaffected by the human-approval field.
    expect(manifest.productionReady).toBe(manifest.readiness.technicalReleaseReady);
  });

  it('reports Windows package blocked instead of claiming a staged project is package-ready', () => {
    const result = exportProject({
      projectPath,
      zip: false,
      packageWindows: true,
      godotExecutable: join(projectPath, 'missing-godot.exe'),
    });

    expect(result.success).toBe(false);
    expect(result.manifest?.packaging.status).toBe('WINDOWS_PACKAGE_BLOCKED');
    expect(result.manifest?.readiness.packageReady).toBe(false);
    expect(result.manifest?.readiness.releaseReady).toBe(false);
  });



  it('includes asset coverage when asset_coverage.json exists', () => {

    writeFileSync(

      join(projectPath, 'asset_coverage.json'),

      JSON.stringify({

        coveragePercent: 92,

        totalExpected: 50,

        totalPresent: 46,

        missing: ['assets/enemies/enemy_002.png'],

        completionScore: 88,

        productionReady: false,

      }),

    );

    const result = exportProject({ projectPath, zip: false });

    expect(result.success).toBe(true);

    const manifest = JSON.parse(readFileSync(result.manifestPath!, 'utf-8'));

    expect(manifest.assetCoverage.coveragePercent).toBe(92);

    expect(manifest.assetCoverage.missingCount).toBe(1);

    expect(manifest.completionSummary.completionScore).toBe(88);

    expect(manifest.completionSummary.blockers[0]).toContain('enemy_002');

  });



  it('blocks export when commercial-safe is required and artifacts are unknown', () => {

    writeFileSync(

      join(projectPath, 'project.json'),

      JSON.stringify({ mode: 'COMMERCIAL_SAFE', slug: 'demo' }),

    );

    writeFileSync(

      join(projectPath, 'generation_manifest.json'),

      JSON.stringify({

        artifacts: [{ id: 'a', path: 'assets/bosses/boss.png', provider: 'comfyui' }],

      }),

    );

    const result = exportProject({ projectPath, zip: false });

    expect(result.success).toBe(false);

    expect(result.errors[0]).toContain('commercial-safe');
    expect(existsSync(join(projectPath, 'license_report.json'))).toBe(true);
    const licenseReport = JSON.parse(readFileSync(join(projectPath, 'license_report.json'), 'utf-8'));
    expect(licenseReport.commercialSafe).toBe(false);
    expect(licenseReport.blockedArtifactCount).toBeGreaterThan(0);
  });



  it('warns but exports when commercial-safe is not required', () => {

    writeFileSync(

      join(projectPath, 'generation_manifest.json'),

      JSON.stringify({

        artifacts: [{ id: 'a', path: 'assets/bosses/boss.png', provider: 'comfyui' }],

      }),

    );

    const result = exportProject({ projectPath, zip: false, requireCommercialSafe: false });

    expect(result.success).toBe(true);

    expect(result.warnings.some((w) => w.includes('COMMERCIAL_SAFE'))).toBe(true);

    const manifest = JSON.parse(readFileSync(result.manifestPath!, 'utf-8'));

    expect(manifest.licenseSummary.commercialSafe).toBe(false);

  });



  it('blocks export when production assets are required and a PLACEHOLDER artifact exists', () => {

    writeFileSync(

      join(projectPath, 'generation_manifest.json'),

      JSON.stringify({

        artifacts: [

          {

            id: 'a',

            path: 'assets/characters/player.png',

            provider: 'procedural',

            maturity: 'PLACEHOLDER',

            commercialUse: 'allowed',

            license: 'MetroForge Procedural Generator (original work)',

          },

        ],

      }),

    );

    const result = exportProject({ projectPath, zip: false, requireProductionAssets: true });

    expect(result.success).toBe(false);

    expect(result.errors[0]).toContain('non-production-maturity');

    expect(result.errors.some((e) => e.includes('player.png') && e.includes('PLACEHOLDER'))).toBe(true);

  });



  it('exports successfully when production assets are required and all artifacts are at/above production maturity', () => {

    writeFileSync(

      join(projectPath, 'generation_manifest.json'),

      JSON.stringify({

        artifacts: [

          {

            id: 'a',

            path: 'assets/characters/player.png',

            provider: 'comfyui',

            maturity: 'PRODUCTION_READY',

            commercialUse: 'allowed',

            license: 'CC0',

          },

        ],

      }),

    );

    const result = exportProject({ projectPath, zip: false, requireProductionAssets: true });

    expect(result.success).toBe(true);

    const manifest = JSON.parse(readFileSync(result.manifestPath!, 'utf-8'));

    expect(manifest.nonProductionAssetCount).toBe(0);

  });



  it('warns but exports when production assets are not required (backward compatible default)', () => {

    writeFileSync(

      join(projectPath, 'generation_manifest.json'),

      JSON.stringify({

        artifacts: [

          {

            id: 'a',

            path: 'assets/characters/player.png',

            provider: 'procedural',

            maturity: 'PLACEHOLDER',

            commercialUse: 'allowed',

            license: 'MetroForge Procedural Generator (original work)',

          },

        ],

      }),

    );

    const result = exportProject({ projectPath, zip: false });

    expect(result.success).toBe(true);

    expect(result.warnings.some((w) => w.includes('not production-maturity'))).toBe(true);

    const manifest = JSON.parse(readFileSync(result.manifestPath!, 'utf-8'));

    expect(manifest.nonProductionAssetCount).toBe(1);

  });

});

