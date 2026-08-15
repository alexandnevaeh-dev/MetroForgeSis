import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { captureGameplayScreenshots } from './gameplay-capture.js';
import { QualityDirector } from './quality-director.js';
import { QualityRepairEngine, QUALITY_TEMPLATE_FILES } from './quality-repair-engine.js';
import { QAValidator } from './validator.js';
import type { QualityPassOptions, QualityPlan, QualityReport } from './quality-types.js';

const SNAPSHOT_RELS = [
  'project.godot',
  'scenes/world/World.tscn',
  'scenes/player/Player.tscn',
  'scripts/core/AudioManager.gd',
  'scripts/core/SettingsManager.gd',
  'scripts/core/VFXManager.gd',
  'scripts/combat/HealthComponent.gd',
  'scripts/world/WorldManager.gd',
  'scripts/UI/GameHUD.gd',
  ...QUALITY_TEMPLATE_FILES,
];

function snapshotDir(projectPath: string): string {
  return join(projectPath, '.metroforge', 'quality-rollback');
}

function takeSnapshot(projectPath: string): void {
  const destRoot = snapshotDir(projectPath);
  rmSync(destRoot, { recursive: true, force: true });
  mkdirSync(destRoot, { recursive: true });
  for (const rel of SNAPSHOT_RELS) {
    const src = join(projectPath, rel);
    if (!existsSync(src)) continue;
    const dest = join(destRoot, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
}

function restoreSnapshot(projectPath: string): void {
  const srcRoot = snapshotDir(projectPath);
  if (!existsSync(srcRoot)) return;
  for (const rel of SNAPSHOT_RELS) {
    const snap = join(srcRoot, rel);
    const dest = join(projectPath, rel);
    if (existsSync(snap)) {
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(snap, dest);
    } else if (existsSync(dest) && QUALITY_TEMPLATE_FILES.includes(rel as (typeof QUALITY_TEMPLATE_FILES)[number])) {
      rmSync(dest, { force: true });
    }
  }
}

function persistPlan(projectPath: string, plan: QualityPlan): void {
  mkdirSync(join(projectPath, 'data', 'quality'), { recursive: true });
  writeFileSync(join(projectPath, 'data', 'quality', 'quality_plan.json'), JSON.stringify(plan, null, 2));
}

function persistReport(projectPath: string, report: QualityReport): void {
  mkdirSync(join(projectPath, 'data', 'quality'), { recursive: true });
  writeFileSync(join(projectPath, 'data', 'quality', 'quality_report.json'), JSON.stringify(report, null, 2));
}

export function runQualityPass(options: QualityPassOptions): QualityReport {
  const director = new QualityDirector();
  const engine = new QualityRepairEngine();
  const plan = director.analyze(options.projectPath, { tier: options.tier, budgets: options.budgets });
  persistPlan(options.projectPath, plan);

  const notes: string[] = [
    `baseline critic ${plan.snapshot.criticScore} lumaStdDev ${plan.snapshot.lumaStdDev.toFixed(2)}`,
    `commercialSafe ${plan.provenance.commercialSafe} placeholders ${plan.provenance.placeholderCount}`,
    `${plan.provenance.rejectedDeathSheets} REJECTED death sheets remain excluded`,
  ];

  if (options.apply === false) {
    const report: QualityReport = {
      projectPath: options.projectPath,
      createdAt: new Date().toISOString(),
      tier: plan.tier,
      qualityScore: plan.before.qualityScore,
      technicalScore: plan.before.technicalScore,
      presentationScore: plan.before.presentationScore,
      before: plan.before,
      after: plan.before,
      snapshotBefore: plan.snapshot,
      snapshotAfter: plan.snapshot,
      issues: plan.issues,
      actions: plan.actions,
      applied: [],
      rolledBack: false,
      cycles: 0,
      assetsRegenerated: [],
      commercialSafe: plan.provenance.commercialSafe,
      placeholderCount: plan.provenance.placeholderCount,
      criticTargetPreferred: 70,
      notes: [...notes, 'plan-only; no project mutation'],
    };
    persistReport(options.projectPath, report);
    return report;
  }

  takeSnapshot(options.projectPath);
  const applied = engine.apply(plan);
  notes.push(`applied ${applied.filter((a) => a.ok).length}/${applied.length} typed repairs`);

  if (options.recapture && options.godotPath && existsSync(options.godotPath)) {
      try {
        captureGameplayScreenshots({
          godotPath: options.godotPath,
          projectPath: options.projectPath,
          // Intel UHD headless dummy-renderer cannot read the viewport; force the P6.5
          // windowed_gpu path so quality-after shots are comparable to the P6.5 baseline.
          headlessOutput: 'CAPTURE_STRATEGY_HEADLESS_TEXTURE_NULL texture_2d_get Parameter "t" is null',
        });
        notes.push('windowed_gpu screenshot recapture attempted');
    } catch (err) {
      notes.push(`recapture error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const afterPlan = director.analyze(options.projectPath, { tier: options.tier, budgets: options.budgets });
  const margin = plan.budgets.rollbackMargin;
  const dropped = afterPlan.before.qualityScore + margin < plan.before.qualityScore;
  let rolledBack = false;
  let rollbackReason: string | undefined;
  let finalCard = afterPlan.before;
  let finalSnap = afterPlan.snapshot;

  if (dropped) {
    restoreSnapshot(options.projectPath);
    rolledBack = true;
    rollbackReason = `afterScore ${afterPlan.before.qualityScore} < beforeScore ${plan.before.qualityScore} by more than ${margin}`;
    const restored = director.analyze(options.projectPath, { tier: options.tier, budgets: options.budgets });
    finalCard = restored.before;
    finalSnap = restored.snapshot;
    notes.push(`ROLLBACK: ${rollbackReason}`);
  }

  if (options.playtest && options.godotPath && existsSync(options.godotPath) && !rolledBack) {
    try {
      const gate = new QAValidator().validateGodotPlaytest(options.godotPath, options.projectPath);
      notes.push(`playtest gate: ${gate.message}`);
      if (!gate.passed) {
        restoreSnapshot(options.projectPath);
        rolledBack = true;
        rollbackReason = `playtest regression: ${gate.message}`;
        notes.push(`ROLLBACK: ${rollbackReason}`);
      }
    } catch (err) {
      notes.push(`playtest error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const report: QualityReport = {
    projectPath: options.projectPath,
    createdAt: new Date().toISOString(),
    tier: plan.tier,
    qualityScore: finalCard.qualityScore,
    technicalScore: finalCard.technicalScore,
    presentationScore: finalCard.presentationScore,
    before: plan.before,
    after: finalCard,
    snapshotBefore: plan.snapshot,
    snapshotAfter: finalSnap,
    issues: afterPlan.issues,
    actions: plan.actions,
    applied,
    rolledBack,
    rollbackReason,
    cycles: 1,
    assetsRegenerated: [],
    commercialSafe: afterPlan.provenance.commercialSafe,
    placeholderCount: afterPlan.provenance.placeholderCount,
    criticTargetPreferred: 70,
    notes,
  };
  persistReport(options.projectPath, report);
  return report;
}

export { takeSnapshot, restoreSnapshot };
