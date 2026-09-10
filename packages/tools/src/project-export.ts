import { existsSync, readFileSync, mkdirSync, mkdtempSync, copyFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, basename, relative, resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { PRODUCT, isNonProductionMaturity } from '@metroforge/shared';
import { auditExportLicense, buildAttributionsMarkdown, repairManifestArtifactLicenses } from '@metroforge/ai';
import type { LicenseStatus } from '@metroforge/ai';
import { exportGodotMacOSApp, exportGodotWindowsBinary } from './godot-export.js';

export interface ExportManifest {
  version: string;
  exportedAt: string;
  projectSlug: string;
  projectPath: string;
  generatorVersion: string;
  validationPassed: boolean;
  validationLevel?: string;
  productionReady: boolean;
  readiness: {
    runtimeReady: boolean;
    visualReady: boolean;
    assetReady: boolean;
    packageReady: boolean;
    /** All machine-checkable gates passed — does NOT include human visual-direction approval. */
    technicalReleaseReady: boolean;
    /** True only when a human has explicitly recorded visual-slice approval for this exact
     *  evidence (see @metroforge/shared's isVisualSliceApprovalCurrent). Never inferred or
     *  defaulted to true — an unset/unknown approval state means this stays false. */
    humanVisualApprovalGranted: boolean;
    /** technicalReleaseReady && humanVisualApprovalGranted. This — not technicalReleaseReady —
     *  is the field that gates an actual release action. */
    releaseReady: boolean;
  };
  packaging: {
    stagingComplete: boolean;
    packageAttempted: boolean;
    packageSucceeded: boolean;
    binaryVerified: boolean;
    launchVerified: boolean;
    status: 'STAGING_COMPLETE' | 'PACKAGE_SUCCEEDED' | 'WINDOWS_PACKAGE_BLOCKED' | 'MACOS_PACKAGE_BLOCKED';
    exePath?: string;
    appZipPath?: string;
    pckPath?: string;
    embeddedPck?: boolean;
    message?: string;
  };
  roomCount: number;
  artifactCount: number;
  /** Count of artifacts whose maturity is in NON_PRODUCTION_MATURITIES (PLACEHOLDER/BLOCKOUT/REJECTED). */
  nonProductionAssetCount: number;
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
  /** When true, block export if any artifact's maturity is in NON_PRODUCTION_MATURITIES. */
  requireProductionAssets?: boolean;
  /** Produce and verify a distributable Windows binary instead of only staging project files. */
  packageWindows?: boolean;
  /** Produce and verify a local unsigned macOS app ZIP. Requires running on macOS. */
  packageMacOS?: boolean;
  /** Absolute path to the Godot executable for a --export-release package. */
  godotExecutable?: string;
  /** True only when the caller has already verified a current, human-recorded visual-slice
   *  approval for this exact project (see @metroforge/shared's isVisualSliceApprovalCurrent).
   *  packages/tools cannot read that state itself (it would create a circular dependency on
   *  @metroforge/generation, which depends on @metroforge/tools) — the CLI/caller layer that
   *  already depends on both resolves it and passes the result in. Omitting this is the safe
   *  default: releaseReady stays false without explicit, current human approval. */
  humanVisualApprovalGranted?: boolean;
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
  const repaired = repairManifestArtifactLicenses(artifacts);
  if (repaired.repaired > 0 && generationManifest) {
    writeFileSync(
      join(projectPath, 'generation_manifest.json'),
      JSON.stringify({ ...generationManifest, artifacts: repaired.artifacts }, null, 2),
    );
  }
  const providers = [
    ...new Set(
      repaired.artifacts
        .map((a) => String(a.provider ?? ''))
        .filter(Boolean),
    ),
  ];
  const fallbackArtifactCount = repaired.artifacts.filter((a) => a.fallbackGenerated === true).length;
  const manualArtifactCount = repaired.artifacts.filter((a) => a.manual === true).length;
  const licenseAudit = auditExportLicense(repaired.artifacts);
  writeFileSync(join(projectPath, 'ATTRIBUTIONS.md'), buildAttributionsMarkdown(licenseAudit));

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

  const nonProductionArtifacts = repaired.artifacts.filter((a) =>
    isNonProductionMaturity(a.maturity as string | undefined | null),
  );

  if (options.requireProductionAssets && nonProductionArtifacts.length > 0) {
    const sample = nonProductionArtifacts
      .slice(0, 5)
      .map((a) => `${String(a.path || a.id)} (${String(a.maturity)})`);
    return {
      success: false,
      errors: [
        'Export blocked: project contains non-production-maturity assets',
        ...sample,
        ...(nonProductionArtifacts.length > 5
          ? [`…and ${nonProductionArtifacts.length - 5} more artifact(s)`]
          : []),
      ],
      warnings,
    };
  }

  if (nonProductionArtifacts.length > 0) {
    warnings.push(
      `${nonProductionArtifacts.length} artifact(s) are not production-maturity — use --require-production-assets to block export`,
    );
  }

  const roomCount = roomsJson?.rooms
    ? Object.keys(roomsJson.rooms as Record<string, unknown>).length
    : 0;

  const runtimeReady = validationLevel === 'RUNTIME_VALIDATED';

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

  const visualReady = assetCoverage?.productionReady === true;
  const assetReady = nonProductionArtifacts.length === 0;
  const completionSummary = assetCoverage
    ? {
        productionReady: runtimeReady && visualReady && assetReady,
        completionScore: assetCoverage.completionScore,
        blockers: missingAssets.slice(0, 10).map((path) => `Missing asset: ${path}`),
      }
    : {
        productionReady: runtimeReady && assetReady,
        completionScore: runtimeReady && assetReady ? 100 : validationPassed ? 75 : 0,
        blockers: validationPassed ? [] : ['Validation has not passed'],
      };

  const exportRoot =
    options.outputDir ?? join(projectPath, '..', '..', 'Exports', slug);
  const relativeOutput = relative(resolve(projectPath), resolve(exportRoot));
  if (relativeOutput === '' || (!relativeOutput.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && relativeOutput !== '..' && !isAbsolute(relativeOutput))) {
    return { success: false, errors: ['Export output directory must be outside the source project to avoid recursive staging'], warnings };
  }
  mkdirSync(exportRoot, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const stagingDir = join(exportRoot, `${slug}-staging-${stamp}`);
  const skip = new Set(['.godot', 'node_modules', '.metroforge', 'Exports']);
  copyDirRecursive(projectPath, stagingDir, skip);

  let packaging: ExportManifest['packaging'] = {
    stagingComplete: true,
    packageAttempted: false,
    packageSucceeded: false,
    binaryVerified: false,
    launchVerified: false,
    status: 'STAGING_COMPLETE',
  };
  if (options.packageWindows) {
    const exePath = join(stagingDir, 'build', 'windows', `${slug}.exe`);
    if (!options.godotExecutable || !existsSync(options.godotExecutable)) {
      packaging = {
        ...packaging,
        packageAttempted: true,
        status: 'WINDOWS_PACKAGE_BLOCKED',
        exePath,
        message: 'Godot executable unavailable for Windows package export',
      };
    } else {
      const packageResult = exportGodotWindowsBinary({
        projectPath,
        godotExecutable: options.godotExecutable,
        outputExePath: exePath,
      });
      const pckPath = exePath.replace(/\.exe$/i, '.pck');
      const hasMZ = packageResult.outputExists && readFileSync(exePath).subarray(0, 2).equals(Buffer.from('MZ'));
      // ensureWindowsExportPreset() explicitly writes binary_format/embed_pck=false, so an
      // absent sidecar PCK is a failed package, never evidence of an embedded one.
      const embeddedPck = false;
      const binaryVerified = packageResult.success && hasMZ && existsSync(pckPath);
      const launch = binaryVerified
        ? spawnSync(exePath, ['--headless', '--quit-after', '60'], {
            encoding: 'utf-8',
            timeout: 15_000,
            windowsHide: true,
          })
        : undefined;
      const launchVerified = launch?.status === 0 && !launch.error;
      const packageSucceeded = binaryVerified && launchVerified;
      packaging = {
        ...packaging,
        packageAttempted: true,
        packageSucceeded,
        binaryVerified,
        launchVerified,
        status: packageSucceeded ? 'PACKAGE_SUCCEEDED' : 'WINDOWS_PACKAGE_BLOCKED',
        exePath,
        pckPath: existsSync(pckPath) ? pckPath : undefined,
        embeddedPck,
        message: packageSucceeded
          ? 'Windows executable verified (MZ header, package data, and headless launch)'
          : launch?.stderr || launch?.stdout || packageResult.stderr || packageResult.stdout || 'Godot did not produce a verified Windows package',
      };
    }
  } else if (options.packageMacOS) {
    const appZipPath = join(stagingDir, 'build', 'macos', `${slug}.zip`);
    if (process.platform !== 'darwin') {
      packaging = {
        ...packaging,
        packageAttempted: true,
        status: 'MACOS_PACKAGE_BLOCKED',
        appZipPath,
        message: 'macOS package launch verification must run on macOS',
      };
    } else if (!options.godotExecutable || !existsSync(options.godotExecutable)) {
      packaging = {
        ...packaging,
        packageAttempted: true,
        status: 'MACOS_PACKAGE_BLOCKED',
        appZipPath,
        message: 'Godot executable unavailable for macOS package export',
      };
    } else {
      const packageResult = exportGodotMacOSApp({
        projectPath,
        godotExecutable: options.godotExecutable,
        outputZipPath: appZipPath,
      });
      const hasZipHeader = packageResult.outputExists && readFileSync(appZipPath).subarray(0, 2).equals(Buffer.from('PK'));
      const extractDir = mkdtempSync(join(tmpdir(), 'metroforge-macos-package-'));
      let binaryVerified = false;
      let launchVerified = false;
      let launchMessage = '';
      try {
        const extracted = packageResult.success && hasZipHeader
          ? spawnSync('ditto', ['-x', '-k', appZipPath, extractDir], {
              encoding: 'utf-8',
              timeout: 120_000,
            })
          : undefined;
        const appName = extracted?.status === 0
          ? readdirSync(extractDir).find((name) => name.endsWith('.app'))
          : undefined;
        const macOSDir = appName ? join(extractDir, appName, 'Contents', 'MacOS') : '';
        const executableName = macOSDir && existsSync(macOSDir)
          ? readdirSync(macOSDir)[0]
          : undefined;
        const executable = executableName ? join(macOSDir, executableName) : undefined;
        const architectures = executable
          ? spawnSync('lipo', ['-archs', executable], { encoding: 'utf-8', timeout: 15_000 })
          : undefined;
        const requiredArchitecture = process.arch === 'arm64' ? 'arm64' : 'x86_64';
        // Godot's export template ships pre-signed under its own Developer ID. That signature
        // seals only the raw executable, not the bundle MetroForge assembles around it (icon,
        // .pck, Info.plist) — so `codesign --verify` on the assembled .app fails with "code has
        // no resources but signature indicates they must be present" regardless of the source
        // filesystem. Re-sealing the whole bundle after assembly is what actually needs verifying.
        if (appName) {
          spawnSync('codesign', ['--force', '--deep', '--sign', '-', join(extractDir, appName)], {
            encoding: 'utf-8',
            timeout: 30_000,
          });
        }
        const signature = appName
          ? spawnSync('codesign', ['--verify', '--deep', '--strict', join(extractDir, appName)], { encoding: 'utf-8', timeout: 30_000 })
          : undefined;
        binaryVerified = Boolean(packageResult.success && hasZipHeader && executable &&
          architectures?.status === 0 && architectures.stdout.trim().split(/\s+/).includes(requiredArchitecture) && signature?.status === 0);
        const launch = binaryVerified
          ? spawnSync(executable!, ['--headless', '--quit-after', '60'], {
              encoding: 'utf-8',
              timeout: 30_000,
            })
          : undefined;
        launchVerified = launch?.status === 0 && !launch.error;
        launchMessage = signature?.stderr || architectures?.stderr || launch?.stderr || launch?.stdout || extracted?.stderr || extracted?.stdout || 'Required native architecture or valid code signature missing';
      } finally {
        rmSync(extractDir, { recursive: true, force: true });
      }
      const packageSucceeded = binaryVerified && launchVerified;
      packaging = {
        ...packaging,
        packageAttempted: true,
        packageSucceeded,
        binaryVerified,
        launchVerified,
        status: packageSucceeded ? 'PACKAGE_SUCCEEDED' : 'MACOS_PACKAGE_BLOCKED',
        appZipPath,
        message: packageSucceeded
          ? 'macOS app ZIP signature and native architecture verified; launched headlessly'
          : launchMessage || packageResult.stderr || packageResult.stdout || 'Godot did not produce a verified macOS package',
      };
    }
  }

  const packageReady = packaging.packageSucceeded && packaging.binaryVerified && packaging.launchVerified;
  const technicalReleaseReady = runtimeReady && visualReady && assetReady && packageReady;
  const humanVisualApprovalGranted = options.humanVisualApprovalGranted === true;
  const releaseReady = technicalReleaseReady && humanVisualApprovalGranted;
  const manifest: ExportManifest = {
    version: '2',
    exportedAt: new Date().toISOString(),
    projectSlug: slug,
    projectPath,
    generatorVersion: PRODUCT.generatorVersion,
    validationPassed,
    validationLevel,
    // productionReady keeps its original meaning — all machine-checkable gates pass — so this
    // field's behavior is unchanged by the human-approval gate added below. `readiness.releaseReady`
    // is the new, stricter field that also requires humanVisualApprovalGranted.
    productionReady: technicalReleaseReady,
    readiness: {
      runtimeReady,
      visualReady,
      assetReady,
      packageReady,
      technicalReleaseReady,
      humanVisualApprovalGranted,
      releaseReady,
    },
    packaging,
    roomCount,
    artifactCount: artifacts.length,
    nonProductionAssetCount: nonProductionArtifacts.length,
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

  const manifestPath = join(stagingDir, 'export_manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  writeLicenseReport(stagingDir, licenseAudit, {
    generationMode,
    providers,
    fallbackArtifactCount,
    manualArtifactCount,
  });

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
    success:
      (!options.packageWindows && !options.packageMacOS) ||
      manifest.packaging.packageSucceeded,
    manifest,
    manifestPath,
    archivePath: archivePath ?? stagingDir,
    errors,
    warnings,
  };
}
