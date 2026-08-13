import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  isRegisteredAbilityId,
  isNonProductionMaturity,
  projectAllowsPlaceholders,
  type AssetMaturity,
} from '@metroforge/shared';
import type { LoadedProject } from './project-loader.js';

export interface CompletionChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface AssetProductionGateResult {
  passed: boolean;
  blockedAssets: Array<{ path: string; maturity: string; reason: string }>;
  allowPlaceholders: boolean;
}

export interface ProjectCompletionStatus {
  productionReady: boolean;
  victoryPathReady: boolean;
  validationPassed: boolean;
  validationLevel?: string;
  finalBossId: string;
  finalQuestId?: string;
  bossCount: number;
  questCount: number;
  abilityCount: number;
  registeredAbilityCount: number;
  missingAttackSheets: string[];
  completionScore: number;
  blockers: string[];
  warnings: string[];
  checklist: CompletionChecklistItem[];
  assetProductionGate?: AssetProductionGateResult;
}

function fileExists(projectPath: string, rel: string): boolean {
  return existsSync(join(projectPath, rel.replace(/^\//, '')));
}

function manifestHasPath(project: LoadedProject, rel: string): boolean {
  const normalized = rel.replace(/\\/g, '/');
  return (project.manifest.artifacts ?? []).some(
    (a) => String(a.path ?? '').replace(/\\/g, '/') === normalized,
  );
}

function assetPresent(project: LoadedProject, rel: string): boolean {
  return fileExists(project.projectPath, rel) || manifestHasPath(project, rel);
}

function findFinalBossId(project: LoadedProject): string {
  const bosses = project.gameContent.bosses;
  if (bosses.length === 0) return 'boss_final';
  const finalBoss = bosses.find((b) => b.id === 'boss_final') ?? bosses[bosses.length - 1];
  return finalBoss?.id ?? 'boss_final';
}

function findVictoryQuest(project: LoadedProject, finalBossId: string): {
  questId?: string;
  ready: boolean;
  detail: string;
} {
  const quests = project.gameContent.quests;
  if (quests.length === 0) {
    return { ready: false, detail: 'No quests generated' };
  }

  const finalQuest = quests[quests.length - 1]!;
  const objectives = finalQuest.objectives ?? [];
  const bossKill = objectives.find(
    (o) => o.type === 'BossKill' && String(o.target) === finalBossId,
  );

  if (bossKill) {
    return { questId: finalQuest.id, ready: true, detail: `Final quest ${finalQuest.id} targets ${finalBossId}` };
  }

  const anyBossKill = objectives.find((o) => o.type === 'BossKill');
  if (anyBossKill) {
    return {
      questId: finalQuest.id,
      ready: false,
      detail: `Final quest targets ${anyBossKill.target}, not ${finalBossId}`,
    };
  }

  return { questId: finalQuest.id, ready: false, detail: 'Final quest has no BossKill objective' };
}

function collectAttackSheetExpectations(project: LoadedProject): string[] {
  const paths = ['assets/characters/player_attack.png'];
  for (const enemy of project.gameContent.enemies) {
    paths.push(`assets/enemies/${enemy.id}_attack.png`);
  }
  for (const boss of project.gameContent.bosses) {
    paths.push(`assets/bosses/${boss.id}_attack.png`);
  }
  return paths;
}

function isVisualAssetPath(path: string): boolean {
  const p = path.replace(/\\/g, '/').toLowerCase();
  return (
    p.endsWith('.png') ||
    p.includes('/characters/') ||
    p.includes('/enemies/') ||
    p.includes('/bosses/') ||
    p.includes('/tilesets/') ||
    p.includes('/npcs/') ||
    p.includes('/vfx/')
  );
}

/**
 * Blocks productionReady when required visual assets are PLACEHOLDER / BLOCKOUT / REJECTED
 * unless the project explicitly allows placeholders (project.json allowPlaceholders).
 */
export function evaluateAssetProductionGate(project: LoadedProject): AssetProductionGateResult {
  const allowPlaceholders = projectAllowsPlaceholders(project.projectMeta);
  const blockedAssets: AssetProductionGateResult['blockedAssets'] = [];

  for (const artifact of project.manifest.artifacts ?? []) {
    const path = String(artifact.path ?? '').replace(/\\/g, '/');
    if (!path || !isVisualAssetPath(path)) continue;

    const maturityRaw =
      (typeof artifact.maturity === 'string' && artifact.maturity) ||
      (artifact.fallbackGenerated === true ? 'PLACEHOLDER' : undefined) ||
      (String(artifact.provider ?? '').toLowerCase() === 'procedural' ? 'PLACEHOLDER' : undefined);

    const maturity = (maturityRaw ?? 'GENERATED_SOURCE') as AssetMaturity | string;
    const markedNotReady = artifact.productionReady === false;
    const nonProd = isNonProductionMaturity(maturity) || (artifact.fallbackGenerated === true && maturity !== 'PRODUCTION_READY');

    if (nonProd || (markedNotReady && isNonProductionMaturity(maturity))) {
      if (isNonProductionMaturity(maturity) || artifact.fallbackGenerated === true) {
        blockedAssets.push({
          path,
          maturity: String(maturity),
          reason:
            maturity === 'REJECTED'
              ? 'Asset critique rejected this visual'
              : 'Procedural/placeholder visual cannot ship as production-ready',
        });
      }
    }
  }

  return {
    passed: allowPlaceholders || blockedAssets.length === 0,
    blockedAssets,
    allowPlaceholders,
  };
}

/** Analyze whether a generated project is shippable and has a complete victory path. */
export function analyzeProjectCompletion(project: LoadedProject): ProjectCompletionStatus {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const checklist: CompletionChecklistItem[] = [];

  const report = project.validationReport ?? {};
  const validationLevel = typeof report.validationLevel === 'string' ? report.validationLevel : undefined;
  const validationPassed =
    validationLevel === 'RUNTIME_VALIDATED' ||
    validationLevel === 'IMPORT_VALIDATED' ||
    report.passed === true;

  checklist.push({
    id: 'validation',
    label: 'QA validation',
    passed: validationPassed,
    detail: validationLevel ?? (report.passed ? 'passed' : 'unknown'),
  });
  if (!validationPassed) {
    blockers.push(`Validation not passed (${validationLevel ?? 'unknown'})`);
  }

  const finalBossId = findFinalBossId(project);
  const bossExists = project.gameContent.bosses.some((b) => b.id === finalBossId);
  checklist.push({
    id: 'final_boss',
    label: 'Final boss defined',
    passed: bossExists,
    detail: finalBossId,
  });
  if (!bossExists) blockers.push(`Final boss ${finalBossId} missing from bosses.json`);

  const victoryQuest = findVictoryQuest(project, finalBossId);
  checklist.push({
    id: 'victory_quest',
    label: 'Victory quest (BossKill)',
    passed: victoryQuest.ready,
    detail: victoryQuest.detail,
  });
  if (!victoryQuest.ready) blockers.push(victoryQuest.detail);

  const enabledAbilities = project.gameDna.abilities.filter((a) => a.enabled);
  const registered = enabledAbilities.filter((a) => isRegisteredAbilityId(a.id));
  const unknownAbilities = enabledAbilities.filter((a) => !isRegisteredAbilityId(a.id));
  checklist.push({
    id: 'abilities',
    label: 'Abilities have runtime implementations',
    passed: unknownAbilities.length === 0 && registered.length > 0,
    detail: `${registered.length}/${enabledAbilities.length} registered`,
  });
  if (unknownAbilities.length > 0) {
    blockers.push(
      `Unknown abilities (repairable=false): ${unknownAbilities.map((a) => a.id).join(', ')}. ` +
        `Remap game_dna abilities to registered runtime ids (dash, double_jump, wall_slide, wall_jump, air_dash, ground_slam, grapple, swim, phase). ` +
        `Do not invent GDScript ability stubs.`,
    );
  }

  const attackExpectations = collectAttackSheetExpectations(project);
  const missingAttackSheets = attackExpectations.filter((p) => !assetPresent(project, p));
  checklist.push({
    id: 'attack_sheets',
    label: 'Attack animation sheets',
    passed: missingAttackSheets.length === 0,
    detail:
      missingAttackSheets.length === 0
        ? `${attackExpectations.length} present`
        : `${missingAttackSheets.length} missing`,
  });
  if (missingAttackSheets.length > 0) {
    warnings.push(`Missing attack sheets: ${missingAttackSheets.slice(0, 5).join(', ')}${missingAttackSheets.length > 5 ? '…' : ''}`);
  }

  const worldGraphOk = project.worldGraph.nodes.length >= 1 && project.roomIds.length >= 1;
  checklist.push({
    id: 'world',
    label: 'Playable world graph',
    passed: worldGraphOk,
    detail: `${project.roomIds.length} rooms`,
  });
  if (!worldGraphOk) blockers.push('World graph or rooms missing');

  const assetGate = evaluateAssetProductionGate(project);
  checklist.push({
    id: 'asset_maturity',
    label: 'Visual assets production maturity',
    passed: assetGate.passed,
    detail: assetGate.allowPlaceholders
      ? 'placeholders explicitly allowed'
      : assetGate.blockedAssets.length === 0
        ? 'no placeholder/blockout/rejected visuals'
        : `${assetGate.blockedAssets.length} non-production visual(s)`,
  });
  if (!assetGate.passed) {
    blockers.push(
      `AssetProductionGate blocked: ${assetGate.blockedAssets
        .slice(0, 3)
        .map((a) => `${a.path} (${a.maturity})`)
        .join(', ')}${assetGate.blockedAssets.length > 3 ? '…' : ''}`,
    );
  }

  const victoryPathReady = bossExists && victoryQuest.ready && unknownAbilities.length === 0 && worldGraphOk;
  const productionReady =
    validationPassed &&
    victoryPathReady &&
    missingAttackSheets.length === 0 &&
    assetGate.passed;

  const passedCount = checklist.filter((c) => c.passed).length;
  const completionScore = checklist.length > 0 ? Math.round((passedCount / checklist.length) * 100) : 0;

  return {
    productionReady,
    victoryPathReady,
    validationPassed,
    validationLevel,
    finalBossId,
    finalQuestId: victoryQuest.questId,
    bossCount: project.gameContent.bosses.length,
    questCount: project.gameContent.quests.length,
    abilityCount: enabledAbilities.length,
    registeredAbilityCount: registered.length,
    missingAttackSheets,
    completionScore,
    blockers,
    warnings,
    checklist,
    assetProductionGate: assetGate,
  };
}
