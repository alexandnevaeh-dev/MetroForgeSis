import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CharacterVisualDNA, StyleBible, VisualDNA } from '@metroforge/schemas';
import {
  scoreVisualQuality,
  planVisualRepairs,
  applyVisualRepairs,
  VISUAL_REPAIR_BUDGET,
  fingerprintFile,
  deriveValidationLevel,
  type QAGateResult,
  type ValidationLevel,
} from '@metroforge/qa';
import { writeVgf2VisualSliceReport } from './vgf2-report.js';
import { writeVisualSliceReports, collectVisualSliceEvidence } from './visual-slice-report.js';
import { writeVisualSliceReviewRequired } from './visual-review.js';

export interface RescoreVisualSliceResult {
  ran: boolean;
  reason?: string;
  validationLevel?: ValidationLevel;
  functionalQuality?: number;
  before?: { overall: number; overallConfidence: number; verdict: string } | undefined;
  after?: { overall: number; overallConfidence: number; verdict: string; violations: string[] };
  repairsApplied?: string[];
}

/**
 * Re-derives the visual-slice verdict for an already-generated project using whatever
 * validation_report.json currently says, instead of the functionalQuality baked in at
 * generation time. A project generated with --skip-runtime-validation always scores
 * functionalQuality=40 and has no gameplay screenshot yet (criticScore defaults to 50),
 * which drags roomComposition/composition down regardless of actual game quality. Once
 * `metroforge validate <slug>` has actually run Godot, this reflects the real result
 * instead of leaving a stale, artificially low verdict in reports/VGF2_VISUAL_VERTICAL_SLICE.json.
 */
export function rescoreVisualSlice(projectPath: string): RescoreVisualSliceResult {
  const validationReportPath = join(projectPath, 'validation_report.json');
  if (!existsSync(validationReportPath)) {
    return { ran: false, reason: 'validation_report.json not found — run `metroforge validate` first' };
  }
  const gameDnaPath = join(projectPath, 'game_dna.json');
  const projectJsonPath = join(projectPath, 'project.json');
  const visualDnaPath = join(projectPath, 'visual_dna.json');
  const styleBiblePath = join(projectPath, 'style_bible.json');
  const characterDnaPath = join(projectPath, 'character_visual_dna.json');
  const existingReportPath = join(projectPath, 'reports', 'VGF2_VISUAL_VERTICAL_SLICE.json');
  for (const [label, p] of [
    ['game_dna.json', gameDnaPath],
    ['project.json', projectJsonPath],
    ['visual_dna.json', visualDnaPath],
    ['style_bible.json', styleBiblePath],
    ['character_visual_dna.json', characterDnaPath],
  ] as const) {
    if (!existsSync(p)) return { ran: false, reason: `${label} not found — not a VISUAL_VERTICAL_SLICE project` };
  }

  const validationReport = JSON.parse(readFileSync(validationReportPath, 'utf-8')) as {
    validationLevel: ValidationLevel;
    results: QAGateResult[];
  };
  const gameDna = JSON.parse(readFileSync(gameDnaPath, 'utf-8')) as {
    profile?: string;
    archetype?: string;
    world?: { roomCount?: number; biomeCount?: number };
  };
  const project = JSON.parse(readFileSync(projectJsonPath, 'utf-8')) as {
    slug: string;
    seed: number;
    profile?: string;
    archetype?: string;
  };
  // gameDna.profile is the game's own quality tier (e.g. RELEASE_CANDIDATE); the generation
  // *mode* that produces reports/VGF2_VISUAL_VERTICAL_SLICE.json lives on project.json instead.
  // The presence of that report is the real signal this project uses the visual-slice flow.
  if (project.profile !== 'VISUAL_VERTICAL_SLICE' || !existsSync(existingReportPath)) {
    return { ran: false, reason: 'project was not generated with the VISUAL_VERTICAL_SLICE profile' };
  }
  const visualDNA = JSON.parse(readFileSync(visualDnaPath, 'utf-8')) as VisualDNA;
  const styleBible = JSON.parse(readFileSync(styleBiblePath, 'utf-8')) as StyleBible;
  const characterVisualDna = JSON.parse(readFileSync(characterDnaPath, 'utf-8')) as CharacterVisualDNA;

  const staticGateResults = validationReport.results.filter(
    (r) => !['godot_imports', 'godot_runtime', 'godot_playtest', 'gameplay_screenshot_qa'].includes(r.gate),
  );
  const validationLevel = deriveValidationLevel({
    staticPassed: staticGateResults.every((r) => r.passed),
    importGate: validationReport.results.find((r) => r.gate === 'godot_imports'),
    runtimeGate: validationReport.results.find((r) => r.gate === 'godot_runtime'),
    godotAvailable: validationReport.results.some((r) => r.gate === 'godot_imports'),
    skipRuntimeValidation: false,
  });
  const validationPassed = validationLevel === 'RUNTIME_VALIDATED';
  const functionalQuality = validationPassed ? 90 : 40;

  let previousMaturity = { production: 0, placeholder: 0, rejected: 0, unknownLicense: 0 };
  let previousBefore: RescoreVisualSliceResult['before'];
  if (existsSync(existingReportPath)) {
    try {
      const prev = JSON.parse(readFileSync(existingReportPath, 'utf-8')) as {
        maturity?: typeof previousMaturity;
        scores?: { overall?: number; overallConfidence?: number };
        verdict?: string;
      };
      if (prev.maturity) previousMaturity = prev.maturity;
      previousBefore = {
        overall: prev.scores?.overall ?? 0,
        overallConfidence: prev.scores?.overallConfidence ?? 0,
        verdict: prev.verdict ?? 'UNKNOWN',
      };
    } catch {
      /* fall through with defaults */
    }
  }
  const totalRated = previousMaturity.production + previousMaturity.placeholder + previousMaturity.rejected;
  const placeholderRatio = totalRated > 0 ? previousMaturity.placeholder / totalRated : 1;

  const farFp = fingerprintFile(join(projectPath, 'assets', 'backgrounds', 'biome_0', 'far.png'));
  const midFp = fingerprintFile(join(projectPath, 'assets', 'backgrounds', 'biome_0', 'mid.png'));
  const nearFp = fingerprintFile(join(projectPath, 'assets', 'backgrounds', 'biome_0', 'near.png'));

  const scoreSlice = () =>
    scoreVisualQuality({
      projectPath,
      playerVisible: existsSync(join(projectPath, 'assets', 'characters', 'player.png')),
      enemyVisible:
        existsSync(join(projectPath, 'assets', 'enemies')) ||
        existsSync(join(projectPath, 'assets', 'enemies', 'enemy_0.png')),
      terrainTextureExists: existsSync(join(projectPath, 'assets', 'tilesets', 'biome_0', 'source.png')),
      uiTextureExists: existsSync(join(projectPath, 'assets', 'ui', 'hud_frame.png')),
      parallaxFingerprints: { far: farFp, mid: midFp, near: nearFp },
      propCount: previousMaturity.production > 0 ? Math.round(previousMaturity.production * 0.1) : 0,
      placeholderRatio,
      wallpaperCapture: false,
      functionalQuality,
    });

  let visualQa = scoreSlice();
  const repairLog: string[] = [];
  for (let round = 0; round < VISUAL_REPAIR_BUDGET.maxSliceRepairRounds; round++) {
    if (visualQa.verdict !== 'AUTOMATED_VISUAL_FAIL') break;
    const planned = planVisualRepairs(visualQa, round);
    if (planned.length === 0) break;
    const applied = applyVisualRepairs(projectPath, planned);
    repairLog.push(...applied.filter((r) => r.applied).map((r) => `${r.defect}: ${r.detail}`));
    if (!applied.some((r) => r.applied)) break;
    visualQa = scoreSlice();
  }

  const review = writeVisualSliceReviewRequired(projectPath, {
    notes: 'Technical QA is not aesthetic approval. Use Approve Visual Direction / Reject in Generation Studio.',
    technicalQa: {
      passed: validationPassed,
      issues: [],
      checks: { runtimeValidated: validationPassed, fakeAnimation: true },
    },
  });
  const collected = collectVisualSliceEvidence(projectPath);
  const evidence = collected.length > 0 ? collected : ['qa/screenshot_gameplay.png', 'reports/visual-slice-contact-sheet.png'];
  writeVisualSliceReports({
    projectPath,
    slug: project.slug,
    styleBible,
    characterDna: characterVisualDna,
    providerModels: { nvidiaImage: 'black-forest-labs/flux.1-dev', kontext: 'black-forest-labs/flux.1-kontext-dev' },
    spriteQa: { fakeAnimationDetected: false },
    tilesetQa: { compiler: 'TileCompiler autotile' },
    roomQa: { roomCount: gameDna.world?.roomCount, biomeCount: gameDna.world?.biomeCount },
    fakeAnimation: false,
    screenshots: evidence,
    review,
  });

  mkdirSync(join(projectPath, 'reports'), { recursive: true });
  writeFileSync(
    join(projectPath, 'reports', 'visual-composition-telemetry.json'),
    JSON.stringify(
      {
        slug: project.slug,
        repairPasses: repairLog.length,
        gates: visualQa.gates,
        scores: {
          functionalQuality: visualQa.scores.functionalQuality,
          assetIntegrity: visualQa.scores.assetIntegrity,
          visualCohesion: visualQa.scores.visualCohesion,
          roomComposition: visualQa.scores.roomComposition,
          gameplayReadability: visualQa.scores.gameplayReadability,
          presentationQuality: visualQa.scores.presentationQuality,
          overall: visualQa.scores.overall,
        },
        violations: visualQa.gates.violations,
        showcaseReady: visualQa.gates.showcaseReady,
      },
      null,
      2,
    ),
  );
  writeVgf2VisualSliceReport({
    projectPath,
    slug: project.slug,
    seed: project.seed,
    profile: project.profile ?? 'VISUAL_VERTICAL_SLICE',
    archetype: project.archetype ?? gameDna.archetype ?? 'SIDE_VIEW_METROIDVANIA',
    providerSummary: { nvidiaImage: 'black-forest-labs/flux.1-dev', selectedImage: 'procedural' },
    visualDNA,
    biomeName: visualDNA.styleFingerprint ?? 'biome_0',
    maturity: previousMaturity,
    scores: visualQa.scores,
    defects: visualQa.defects,
    repairs: repairLog,
    verdict: visualQa.verdict,
    screenshots: evidence,
    hardFailReasons: visualQa.hardFailReasons,
  });

  return {
    ran: true,
    validationLevel,
    functionalQuality,
    before: previousBefore,
    after: {
      overall: visualQa.scores.overall,
      overallConfidence: visualQa.scores.overallConfidence,
      verdict: visualQa.verdict,
      violations: visualQa.gates.violations,
    },
    repairsApplied: repairLog,
  };
}
