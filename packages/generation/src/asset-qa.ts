import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AssetMaturity } from '@metroforge/shared';

export const ASSET_QA_POLICY_VERSION = 'asset_qa_v1';
export type AssetQaDecision = 'APPROVE' | 'REJECT' | 'NEEDS_REWORK';
export type AssetQaSeverity = 'BLOCKER' | 'WARNING' | 'INFO';
export type AssetQaCategory = 'player' | 'enemy' | 'boss' | 'npc' | 'environment' | 'background' | 'pickup' | 'ability_icon' | 'hud' | 'prop' | 'animated_environment' | 'vfx' | 'ui_panel';

export interface AssetQaFinding { rule: string; severity: AssetQaSeverity; passed: boolean; message: string }
export interface AssetQaEvidence { nativeScale: string[]; inContext: string[]; contactSheet?: string }
export interface AssetQaEvaluation {
  assetId: string; category: AssetQaCategory; pipelineVersion: string; sourceHash: string; finalHash: string;
  runtimePath: string; findings: AssetQaFinding[]; blockerCount: number; warningCount: number;
  automatedPassed: boolean; evidence: AssetQaEvidence;
}
export interface AssetQaReviewRecord extends AssetQaEvaluation {
  reviewId: string; reviewer: string; reviewedAt: string; reviewPolicyVersion: string;
  decision: AssetQaDecision; notes?: string; reasonCodes: string[];
  previousMaturity: AssetMaturity; resultingMaturity: AssetMaturity;
}
export interface QaPromotionTarget {
  assetId: string; category: AssetQaCategory; pipelineVersion: string; sourceHash: string; finalHash: string;
  runtimePath: string; maturity: AssetMaturity; productionReady: boolean;
}
export interface AssetFamilyQaSummary { family: 'characters' | 'environment' | 'ui' | 'world_props'; memberIds: string[]; productionReady: boolean; blockers: string[] }

const POLICY: Record<AssetQaCategory, string[]> = {
  player: ['silhouette_readability','alpha_background','crop_framing','scale_consistency','animation_consistency','gameplay_readability','visual_artifacts','style_consistency','category_correctness','runtime_context_fit','technical_validation','duplication'],
  enemy: ['hostile_silhouette','distinct_from_player_npc','animation_consistency','attack_readability','scale_consistency','alpha_background','visual_artifacts','style_consistency','runtime_context_fit','technical_validation','duplication'],
  boss: ['boss_visual_importance','distinct_from_enemy','hit_area_readability','animation_consistency','scale_consistency','crop_framing','visual_artifacts','runtime_context_fit','technical_validation','duplication'],
  npc: ['friendly_readability','distinct_from_hostiles','orientation_framing','style_consistency','category_correctness','runtime_context_fit','technical_validation','duplication'],
  environment: ['tile_seams','repetition','terrain_continuity','scale_consistency','collision_readability','style_consistency','source_boundaries','runtime_context_fit','technical_validation','duplication'],
  background: ['parallax_role','gameplay_contrast','collision_cues','crop_framing','depth_hierarchy','seams','style_consistency','runtime_context_fit','technical_validation','duplication'],
  pickup: ['gameplay_readability','distinct_from_props','collectibility','alpha_background','scale_consistency','style_consistency','runtime_context_fit','technical_validation','duplication'],
  ability_icon: ['ui_readability','silhouette_readability','distinct_icons','no_baked_text','alpha_background','crop_framing','palette_cohesion','runtime_context_fit','technical_validation','duplication'],
  hud: ['ui_readability','alpha_background','crop_framing','function_clarity','palette_cohesion','style_consistency','runtime_context_fit','technical_validation','duplication'],
  prop: ['world_scale','interaction_affordance','alpha_background','style_consistency','terrain_confusion','runtime_context_fit','technical_validation','duplication'],
  animated_environment: ['mechanical_geometry_stability','loop_continuity','state_transition_readability','world_scale','alpha_background','style_consistency','runtime_context_fit','technical_validation','duplication'],
  vfx: ['effect_origin','animation_bounds','frame_consistency','gameplay_readability','alpha_background','palette_cohesion','runtime_context_fit','technical_validation','duplication'],
  ui_panel: ['ui_readability','nine_slice_compatibility','no_baked_text','alpha_background','crop_framing','palette_cohesion','runtime_context_fit','technical_validation','duplication'],
};

export function qaRulesForCategory(category: AssetQaCategory): readonly string[] { return POLICY[category]; }

export function buildAutomatedQaEvaluation(input: Omit<AssetQaEvaluation, 'findings'|'blockerCount'|'warningCount'|'automatedPassed'> & {
  technicalValidationPassed: boolean; currentHashMatchesFile: boolean; duplicateSource: boolean;
  evidenceExists?: (path: string) => boolean;
}): AssetQaEvaluation {
  const findings: AssetQaFinding[] = [];
  const add = (rule: string, severity: AssetQaSeverity, passed: boolean, message: string) => findings.push({ rule, severity, passed, message });
  add('technical_validation', 'BLOCKER', input.technicalValidationPassed, input.technicalValidationPassed ? 'Pipeline validation passed' : 'Pipeline validation failed');
  add('hash_integrity', 'BLOCKER', input.currentHashMatchesFile, input.currentHashMatchesFile ? 'Final hash matches reviewed file' : 'Final file hash differs from manifest');
  add('duplication', 'BLOCKER', !input.duplicateSource, input.duplicateSource ? 'Source duplicates a prohibited comparison asset' : 'No prohibited source duplication detected');
  const nativeOk = input.evidence.nativeScale.length > 0 && input.evidence.nativeScale.every((p) => input.evidenceExists?.(p) ?? true);
  const contextOk = input.evidence.inContext.length > 0 && input.evidence.inContext.every((p) => input.evidenceExists?.(p) ?? true);
  add('native_scale_evidence', 'BLOCKER', nativeOk, nativeOk ? 'Native-scale evidence exists' : 'Native-scale evidence missing');
  add('runtime_context_fit', 'BLOCKER', contextOk, contextOk ? 'In-context evidence exists' : 'In-context evidence missing');
  for (const rule of POLICY[input.category]) if (!findings.some((f) => f.rule === rule)) add(rule, 'INFO', true, 'Requires reviewer confirmation');
  return { ...input, findings, blockerCount: findings.filter((f) => f.severity === 'BLOCKER' && !f.passed).length, warningCount: findings.filter((f) => f.severity === 'WARNING' && !f.passed).length, automatedPassed: findings.every((f) => f.severity !== 'BLOCKER' || f.passed) };
}

export function createQaReviewRecord(evaluation: AssetQaEvaluation, input: { reviewer: string; decision: AssetQaDecision; notes?: string; reasonCodes?: string[]; previousMaturity: AssetMaturity; reviewedAt?: string }): AssetQaReviewRecord {
  const resultingMaturity: AssetMaturity = input.decision === 'REJECT' ? 'REJECTED' : input.previousMaturity;
  return { ...evaluation, reviewId: `${evaluation.assetId}-${evaluation.finalHash.slice(0, 12)}-${Date.parse(input.reviewedAt ?? new Date().toISOString())}`, reviewer: input.reviewer, reviewedAt: input.reviewedAt ?? new Date().toISOString(), reviewPolicyVersion: ASSET_QA_POLICY_VERSION, decision: input.decision, notes: input.notes, reasonCodes: input.reasonCodes ?? [], previousMaturity: input.previousMaturity, resultingMaturity };
}

export function promoteAssetThroughQa(target: QaPromotionTarget, review: AssetQaReviewRecord | undefined): { ok: boolean; target: QaPromotionTarget; reason?: string } {
  const fail = (reason: string) => ({ ok: false, target: { ...target, productionReady: false }, reason });
  if (!review) return fail('missing QA review record');
  if (target.maturity !== 'QA_REVIEW') return fail(`asset maturity ${target.maturity} is not eligible`);
  if (review.assetId !== target.assetId) return fail('review asset ID mismatch');
  if (review.finalHash !== target.finalHash) return fail('stale review: final hash changed');
  if (review.pipelineVersion !== target.pipelineVersion) return fail('pipeline version mismatch');
  if (!review.automatedPassed || review.blockerCount > 0 || review.findings.some((f) => f.severity === 'BLOCKER' && !f.passed)) return fail('unresolved QA blockers');
  if (review.decision !== 'APPROVE') return fail(`review decision ${review.decision} cannot promote`);
  return { ok: true, target: { ...target, maturity: 'PRODUCTION_READY', productionReady: true } };
}

export function reviewIsCurrent(target: QaPromotionTarget, review: AssetQaReviewRecord): boolean { return review.assetId === target.assetId && review.finalHash === target.finalHash && review.pipelineVersion === target.pipelineVersion; }
export function deriveFamilyQaSummary(family: AssetFamilyQaSummary['family'], members: QaPromotionTarget[], reviews: AssetQaReviewRecord[]): AssetFamilyQaSummary {
  const blockers: string[] = [];
  for (const member of members) {
    const review = [...reviews].reverse().find((r) => r.assetId === member.assetId && reviewIsCurrent(member, r));
    const promoted = promoteAssetThroughQa(member, review);
    if (!(member.maturity === 'PRODUCTION_READY' && member.productionReady) && !promoted.ok) blockers.push(`${member.assetId}: ${promoted.reason}`);
  }
  return { family, memberIds: members.map((m) => m.assetId), productionReady: members.length > 0 && blockers.length === 0, blockers };
}

export function qaReviewPath(projectPath: string, review: Pick<AssetQaReviewRecord, 'assetId'|'reviewId'>): string { return join(projectPath, 'qa', 'reviews', review.assetId, `${review.reviewId}.json`); }
export function writeQaReviewRecord(projectPath: string, review: AssetQaReviewRecord): string { const path = qaReviewPath(projectPath, review); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(review, null, 2)); return path; }
export function loadQaReviewHistory(projectPath: string, assetId: string): AssetQaReviewRecord[] {
  const indexPath = join(projectPath, 'qa', 'reviews', assetId, 'index.json');
  if (!existsSync(indexPath)) return [];
  const paths = JSON.parse(readFileSync(indexPath, 'utf8')) as string[];
  return paths.filter(existsSync).map((p) => JSON.parse(readFileSync(p, 'utf8')) as AssetQaReviewRecord);
}
export function writeQaReviewHistory(projectPath: string, reviews: AssetQaReviewRecord[]): void {
  for (const review of reviews) writeQaReviewRecord(projectPath, review);
  const byAsset = new Map<string, string[]>();
  for (const review of reviews) { const list = byAsset.get(review.assetId) ?? []; list.push(qaReviewPath(projectPath, review)); byAsset.set(review.assetId, list); }
  for (const [assetId, paths] of byAsset) { const indexPath = join(projectPath, 'qa', 'reviews', assetId, 'index.json'); mkdirSync(dirname(indexPath), { recursive: true }); writeFileSync(indexPath, JSON.stringify(paths, null, 2)); }
}
