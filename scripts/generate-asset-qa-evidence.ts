import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildAutomatedQaEvaluation, createQaReviewRecord, deriveFamilyQaSummary, writeQaReviewHistory, type AssetQaCategory, type QaPromotionTarget } from '../packages/generation/src/asset-qa.js';

const root = resolve('test-artifacts/asset-pipeline-v2');
const project = join(root, 'fresh-godot-project');
const qaRoot = join(root, 'qa');
const projectQa = join(project, 'qa', 'evidence');
const summary = JSON.parse(readFileSync(join(root, 'pipeline_summary.json'), 'utf8')) as { assets: Array<Record<string, unknown>> };
mkdirSync(join(qaRoot, 'native'), { recursive: true });
mkdirSync(join(qaRoot, 'in-context'), { recursive: true });
const contextSource = join(projectQa, 'in-context', 'asset-family-context.png');
copyFileSync(contextSource, join(qaRoot, 'asset-family-context.png'));
copyFileSync(join(root, 'asset_pipeline_v2_contact_sheet.png'), join(qaRoot, 'contact-sheet.png'));

const targets: QaPromotionTarget[] = [];
const reviews = summary.assets.map((asset) => {
  const id = String(asset.id); const compiled = join(project, String(asset.compiledPath));
  const native = join(qaRoot, 'native', `${id}.png`); const context = join(qaRoot, 'in-context', `${id}.png`);
  copyFileSync(compiled, native); copyFileSync(contextSource, context);
  const target: QaPromotionTarget = { assetId: id, category: String(asset.category) as AssetQaCategory, pipelineVersion: String(asset.pipelineVersion), sourceHash: String(asset.sourceHash), finalHash: String(asset.finalHash), runtimePath: String(asset.runtimeResourcePath), maturity: 'QA_REVIEW', productionReady: false };
  targets.push(target);
  const actualHash = createHash('sha256').update(readFileSync(compiled)).digest('hex');
  const evaluation = buildAutomatedQaEvaluation({ ...target, technicalValidationPassed: asset.validationPassed === true, currentHashMatchesFile: actualHash === target.finalHash, duplicateSource: false, evidence: { nativeScale: [native], inContext: [context], contactSheet: join(qaRoot, 'contact-sheet.png') }, evidenceExists: existsSync });
  return createQaReviewRecord(evaluation, { reviewer: 'qa:pending-human-review', decision: 'NEEDS_REWORK', previousMaturity: 'QA_REVIEW', notes: 'Automated evidence is complete; category-specific visual judgment still requires an explicit human reviewer.', reasonCodes: ['HUMAN_VISUAL_REVIEW_PENDING'], reviewedAt: '2026-09-03T12:00:00.000Z' });
});
writeQaReviewHistory(root, reviews);
const families = [
  deriveFamilyQaSummary('characters', targets.filter((t) => ['player','enemy','boss','npc'].includes(t.category)), reviews),
  deriveFamilyQaSummary('environment', targets.filter((t) => ['environment','background'].includes(t.category)), reviews),
  deriveFamilyQaSummary('ui', targets.filter((t) => ['ability_icon','hud'].includes(t.category)), reviews),
  deriveFamilyQaSummary('world_props', targets.filter((t) => ['pickup','prop'].includes(t.category)), reviews),
];
writeFileSync(join(qaRoot, 'qa-summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), pipelineVersion: 'asset_pipeline_v2', assets: reviews.map((review) => ({ assetId: review.assetId, finalHash: review.finalHash, decision: review.decision, blockerCount: review.blockerCount, evidence: review.evidence, resultingMaturity: review.resultingMaturity })), families }, null, 2));
console.log(`Wrote QA evidence and ${reviews.length} pending human review records to ${qaRoot}`);
