import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CandidateReviewPack {
  candidateId: string;
  projectSlug: string;
  seed: number;
  buildHash: string;
  generatedAt: string;
  capturePaths: Record<string, string>;
  assetPaths: {
    repairedThisPass: Array<{ id: string; path: string; oldMaturity?: string; newMaturity?: string }>;
    stillPlaceholder: string[];
  };
  automatedVisualScore: number;
  automatedVisualVerdict: string;
  runtimeReady: boolean;
  assetReady: boolean;
  packageReady: boolean;
  visualSliceApproved: boolean;
}

/** Named capture files a human reviewer should look at, resolved against what actually exists on disk. */
const REVIEW_CAPTURES: Record<string, string> = {
  gameplay_screenshot: 'qa/screenshot_gameplay.png',
  player_idle: 'reports/player_idle.png',
  player_run: 'reports/player_run.png',
  player_jump: 'reports/player_jump.png',
  player_dash: 'reports/player_dash.png',
  player_combat: 'reports/player_combat.png',
  player_land_pose_asset: 'assets/characters/player_land_pose.png',
  player_swim_pose_asset: 'assets/characters/player_swim_pose.png',
  enemy_A: 'reports/enemy_A.png',
  enemy_B: 'reports/enemy_B.png',
  enemy_C: 'reports/enemy_C.png',
  boss_phase_1: 'reports/boss_phase_1.png',
  boss_phase_2: 'reports/boss_phase_2.png',
  boss_death: 'reports/boss_death.png',
  victory: 'reports/victory.png',
  biome_0: 'reports/biome_0.png',
  biome_1: 'reports/biome_1.png',
  biome_2: 'reports/biome_2.png',
  hud: 'reports/hud.png',
  ability_icon_wall_slide: 'assets/ui/icons/ability_wall_slide.png',
  ability_icon_air_dash: 'assets/ui/icons/ability_air_dash.png',
  ability_icon_wall_jump: 'assets/ui/icons/ability_wall_jump.png',
  ability_icon_swim: 'assets/ui/icons/ability_swim.png',
  ability_icon_phase: 'assets/ui/icons/ability_phase.png',
  ability_icon_quest: 'assets/ui/icons/quest.png',
  portrait_quest_giver: 'assets/ui/portraits/quest_giver.png',
  contact_sheet: 'reports/visual-slice-contact-sheet.png',
};

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return undefined;
  }
}

/**
 * Deterministic hash over exactly the evidence a human approval should be tied to: the automated
 * visual verdict/scores and which artifacts are still non-production. If either changes, a
 * previously recorded approval no longer describes the candidate currently on disk.
 */
export function computeVisualEvidenceHash(projectPath: string): string {
  const vgf2 = readJson<{ scores?: Record<string, unknown>; verdict?: string; maturity?: Record<string, unknown> }>(
    join(projectPath, 'reports', 'VGF2_VISUAL_VERTICAL_SLICE.json'),
  );
  const coverage = readJson<{ missing?: string[]; productionReady?: boolean }>(join(projectPath, 'asset_coverage.json'));
  const snapshot = {
    verdict: vgf2?.verdict ?? null,
    overall: vgf2?.scores?.overall ?? null,
    overallConfidence: vgf2?.scores?.overallConfidence ?? null,
    maturity: vgf2?.maturity ?? null,
    coverageMissing: coverage?.missing ?? null,
    coverageProductionReady: coverage?.productionReady ?? null,
  };
  return sha256(JSON.stringify(snapshot));
}

/**
 * Assembles the evidence a human needs to approve or reject Candidate visual direction without
 * hunting through build directories: named capture paths (resolved to only those that actually
 * exist), which artifacts this pass genuinely repaired vs. which remain PLACEHOLDER, and every
 * independent readiness field. Never sets visualSliceApproved — that remains a human's decision,
 * recorded separately via the approval workflow.
 */
export function buildCandidateVisualReviewPack(
  projectPath: string,
  opts: {
    reclassifyChanges?: Array<{ id: string; path: string; oldMaturity: string; newMaturity: string }>;
    stillPlaceholder?: string[];
    runtimeReady: boolean;
    assetReady: boolean;
    packageReady: boolean;
  },
): CandidateReviewPack {
  const project = readJson<{ slug: string; seed: number }>(join(projectPath, 'project.json'));
  const vgf2 = readJson<{ scores?: { overall?: number }; verdict?: string }>(
    join(projectPath, 'reports', 'VGF2_VISUAL_VERTICAL_SLICE.json'),
  );

  const capturePaths: Record<string, string> = {};
  for (const [label, rel] of Object.entries(REVIEW_CAPTURES)) {
    if (existsSync(join(projectPath, rel))) capturePaths[label] = rel;
  }

  return {
    candidateId: project?.slug ?? 'unknown',
    projectSlug: project?.slug ?? 'unknown',
    seed: project?.seed ?? 0,
    buildHash: computeVisualEvidenceHash(projectPath),
    generatedAt: new Date().toISOString(),
    capturePaths,
    assetPaths: {
      repairedThisPass: (opts.reclassifyChanges ?? []).map((c) => ({
        id: c.id,
        path: c.path,
        oldMaturity: c.oldMaturity,
        newMaturity: c.newMaturity,
      })),
      stillPlaceholder: opts.stillPlaceholder ?? [],
    },
    automatedVisualScore: vgf2?.scores?.overall ?? 0,
    automatedVisualVerdict: vgf2?.verdict ?? 'UNKNOWN',
    runtimeReady: opts.runtimeReady,
    assetReady: opts.assetReady,
    packageReady: opts.packageReady,
    visualSliceApproved: false,
  };
}

export function writeCandidateVisualReviewPack(
  projectPath: string,
  opts: Parameters<typeof buildCandidateVisualReviewPack>[1],
): { path: string; pack: CandidateReviewPack } {
  const pack = buildCandidateVisualReviewPack(projectPath, opts);
  const dir = join(projectPath, 'reports');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'candidate-visual-review-pack.json');
  writeFileSync(path, JSON.stringify(pack, null, 2));
  return { path, pack };
}
