import { existsSync, readFileSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PRODUCT } from '@metroforge/shared';
import { auditExportLicense } from '@metroforge/ai';
import type { LicenseStatus } from '@metroforge/ai';

export interface ExportManifest {
  version: string;
  exportedAt: string;
  projectSlug: string;
  projectPath: string;
  generatorVersion: string;
  validationPassed: boolean;
  validationLevel?: string;
  productionReady: boolean;
  roomCount: number;
  artifactCount: number;
  licenseSummary: {
    providers: string[];
    fallbackArtifactCount: number;
    manualArtifactCount: number;
    commercialSafe: boolean;
    blockedArtifactCount: number;
    generationMode?: string;
    artifactClassifications?: Array<{
      path: string;
      provider: string;
      status: LicenseStatus;
      reason: string;
    }>;
  };
  archivePath?: string;
  qaGates?: Array<{ gate: string; passed: boolean; message: string }>;
  assetCoverage?: {
    coveragePercent: number;
    totalExpected: number;
    totalPresent: number;
    missingCount: number;
    completionScore: number;
    productionReady: boolean;
  };
  completionSummary?: {
    productionReady: boolean;
    victoryPathReady?: boolean;
    completionScore: number;
    blockers: string[];
  };
}

export interface ExportProjectOptions {
  projectPath: string;
  outputDir?: string;
  zip?: boolean;
  requireValidation?: boolean;
  /** When true, block export if any artifact fails LicenseRouter COMMERCIAL_SAFE check. */
  requireCommercialSafe?: boolean;
}

export interface ExportProjectResult {
  success: boolean;
  manifest?: ExportManifest;
  manifestPath?: string;
  archivePath?: string;
  errors: string[];
  warnings: string[];
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function copyDirRecursive(src: string, dest: string, skipDirs: Set<string>): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(from, to, skipDirs);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    }
  }
}

function zipDirectory(sourceDir: string, zipPath: string): boolean {
  const result = spawnSync('tar', ['-a', '-cf', zipPath, '-C', sourceDir, '.'], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });
  return result.status === 0;
}

function writeLicenseReport(
  destDir: string,
  licenseAudit: ReturnType<typeof auditExportLicense>,
  extras: {
    generationMode?: string;
    providers: string[];
    fallbackArtifactCount: number;
    manualArtifactCount: number;
  },
): string {
  const report = {
    generatedAt: new Date().toISOString(),
    generationMode: extras.generationMode,
    commercialSafe: licenseAudit.commercialSafe,
    blockedArtifactCount: licenseAudit.blockedArtifacts.length,
    providers: extras.providers,
    fallbackArtifactCount: extras.fallbackArtifactCount,
    manualArtifactCount: extras.manualArtifactCount,
    artifacts: licenseAudit.artifactAudits.map((a) => ({
      path: a.path,
      provider: a.provider,
      status: a.status,
      reason: a.reason,
    })),
  };
  const licenseReportPath = join(destDir, 'license_report.json');
  writeFileSync(licenseReportPath, JSON.stringify(report, null, 2));
  return licenseReportPath;
}

export function exportProject(options: ExportProjectOptions): ExportProjectResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { projectPath } = options;

  if (!existsSync(join(projectPath, 'project.godot'))) {
    return { success: false, errors: ['Invalid project: project.godot not found'], warnings };
  }

  const slug = basename(projectPath);
  const validationReport = readJson(join(projectPath, 'validation_report.json'));
  const generationManifest = readJson(join(projectPath, 'generation_manifest.json'));
  const projectMeta = readJson(join(projectPath, 'project.json'));
  const assetCoverageJson = readJson(join(projectPath, 'asset_coverage.json'));
  const roomsJson = readJson(join(projectPath, 'data', 'rooms', 'rooms.json'));

  const generationMode =
    typeof projectMeta?.mode === 'string' ? projectMeta.mode : undefined;
  const requireCommercialSafe =
    options.requireCommercialSafe ?? generationMode === 'COMMERCIAL_SAFE';

  const validationPassed = validationReport?.passed === true;
  const validationLevel =
    typeof validationReport?.validationLevel === 'string' ? validationReport.validationLevel : undefined;

  if (options.requireValidation && !validationPassed) {
    return {
      success: false,
      errors: ['Export blocked: project has not passed validation (use --force to override)'],
      warnings,
    };
  }

  const artifacts = (generationManifest?.artifacts as Array<Record<string, unknown>> | undefined) ?? [];
  const providers = [
    ...new Set(
      artifacts
        .map((a) => String(a.provider ?? ''))
        .filter(Boolean),
    ),
  ];
  const fallbackArtifactCount = artifacts.filter((a) => a.fallbackGenerated === true).length;
  const manualArtifactCount = artifacts.filter((a) => a.manual === true).length;
  const licenseAudit = auditExportLicense(artifacts);

  if (requireCommercialSafe && !licenseAudit.commercialSafe) {
    writeLicenseReport(projectPath, licenseAudit, {
      generationMode,
      providers,
      fallbackArtifactCount,
      manualArtifactCount,
    });
    const sample = licenseAudit.blockedArtifacts
      .slice(0, 5)
      .map((a) => `${a.path || a.id} (${a.status}: ${a.reason})`);
    return {
      success: false,
      errors: [
        'Export blocked: project is not commercial-safe',
        ...sample,
        ...(licenseAudit.blockedArtifacts.length > 5
          ? [`…and ${licenseAudit.blockedArtifacts.length - 5} more artifact(s)`]
          : []),
      ],
      warnings,
    };
  }

  if (!licenseAudit.commercialSafe) {
    warnings.push(
      `${licenseAudit.blockedArtifacts.length} artifact(s) are not COMMERCIAL_SAFE — use --commercial-safe to block export`,
    );
  }
  const roomCount = roomsJson?.rooms
    ? Object.keys(roomsJson.rooms as Record<string, unknown>).length
    : 0;

  const productionReady =
    validationLevel === 'RUNTIME_VALIDATED' || (validationPassed && validationLevel === 'IMPORT_VALIDATED');

  const missingAssets = Array.isArray(assetCoverageJson?.missing)
    ? (assetCoverageJson!.missing as string[])
    : [];
  const assetCoverage =
    assetCoverageJson && typeof assetCoverageJson.coveragePercent === 'number'
      ? {
          coveragePercent: Number(assetCoverageJson.coveragePercent),
          totalExpected: Number(assetCoverageJson.totalExpected ?? 0),
          totalPresent: Number(assetCoverageJson.totalPresent ?? 0),
          missingCount: missingAssets.length,
          completionScore: Number(assetCoverageJson.completionScore ?? 0),
          productionReady: Boolean(assetCoverageJson.productionReady),
        }
      : undefined;

  const completionSummary = assetCoverage
    ? {
        productionReady: assetCoverage.productionReady || productionReady,
        completionScore: assetCoverage.completionScore,
        blockers: missingAssets.slice(0, 10).map((path) => `Missing asset: ${path}`),
      }
    : {
        productionReady,
        completionScore: productionReady ? 100 : validationPassed ? 75 : 0,
        blockers: validationPassed ? [] : ['Validation has not passed'],
      };

  const manifest: ExportManifest = {
    version: '1',
    exportedAt: new Date().toISOString(),
    projectSlug: slug,
    projectPath,
    generatorVersion: PRODUCT.generatorVersion,
    validationPassed,
    validationLevel,
    productionReady,
    roomCount,
    artifactCount: artifacts.length,
    licenseSummary: {
      providers,
      fallbackArtifactCount,
      manualArtifactCount,
      commercialSafe: licenseAudit.commercialSafe,
      blockedArtifactCount: licenseAudit.blockedArtifacts.length,
      generationMode,
      artifactClassifications: licenseAudit.artifactAudits.map((a) => ({
        path: a.path,
        provider: a.provider,
        status: a.status,
        reason: a.reason,
      })),
    },
    qaGates: ((validationReport?.results as Array<Record<string, unknown>> | undefined) ?? []).map((r) => ({
      gate: String(r.gate ?? ''),
      passed: Boolean(r.passed),
      message: String(r.message ?? ''),
    })),
    assetCoverage,
    completionSummary,
  };

  writeFileSync(join(projectPath, 'export_manifest.json'), JSON.stringify(manifest, null, 2));
  writeLicenseReport(projectPath, licenseAudit, {
    generationMode,
    providers,
    fallbackArtifactCount,
    manualArtifactCount,
  });

  const exportRoot =
    options.outputDir ?? join(projectPath, '..', '..', 'Exports', slug);
  mkdirSync(exportRoot, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingDir = join(exportRoot, `${slug}-staging-${stamp}`);
  const skip = new Set(['.godot', 'node_modules', '.metroforge', 'Exports']);
  copyDirRecursive(projectPath, stagingDir, skip);

  const manifestPath = join(stagingDir, 'export_manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  let archivePath: string | undefined;
  if (options.zip !== false) {
    archivePath = join(exportRoot, `${slug}-${stamp}.zip`);
    if (!zipDirectory(stagingDir, archivePath)) {
      warnings.push('Could not create zip archive (tar unavailable); staged folder exported instead');
      archivePath = undefined;
    } else {
      manifest.archivePath = archivePath;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      writeFileSync(join(exportRoot, `${slug}-${stamp}.export_manifest.json`), JSON.stringify(manifest, null, 2));
    }
  }

  return {
    success: true,
    manifest,
    manifestPath,
    archivePath: archivePath ?? stagingDir,
    errors,
    warnings,
  };
}
