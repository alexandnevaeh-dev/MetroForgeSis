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



  it('writes export_manifest in staged output', () => {

    const result = exportProject({ projectPath, zip: false });

    expect(result.success).toBe(true);

    expect(result.manifestPath).toBeTruthy();

    expect(existsSync(result.manifestPath!)).toBe(true);

    const manifest = JSON.parse(readFileSync(result.manifestPath!, 'utf-8'));

    expect(manifest.validationPassed).toBe(true);

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

});

