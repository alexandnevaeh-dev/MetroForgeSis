import { describe, expect, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildAutomatedQaEvaluation, createQaReviewRecord, deriveFamilyQaSummary, loadQaReviewHistory, promoteAssetThroughQa, qaRulesForCategory, reviewIsCurrent, writeQaReviewHistory, type AssetQaEvaluation, type AssetQaReviewRecord, type QaPromotionTarget } from './asset-qa.js';

const target = (overrides: Partial<QaPromotionTarget> = {}): QaPromotionTarget => ({ assetId: 'player', category: 'player', pipelineVersion: 'asset_pipeline_v2', sourceHash: 'source', finalHash: 'final', runtimePath: 'assets/characters/player.tres', maturity: 'QA_REVIEW', productionReady: false, ...overrides });
const evaluation = (overrides: Partial<AssetQaEvaluation> = {}): AssetQaEvaluation => buildAutomatedQaEvaluation({ ...target(), technicalValidationPassed: true, currentHashMatchesFile: true, duplicateSource: false, evidence: { nativeScale: ['native.png'], inContext: ['context.png'] }, ...overrides });
const review = (decision: AssetQaReviewRecord['decision'] = 'APPROVE', overrides: Partial<AssetQaReviewRecord> = {}) => ({ ...createQaReviewRecord(evaluation(), { reviewer: 'human:test', decision, previousMaturity: 'QA_REVIEW', reviewedAt: '2026-09-03T00:00:00.000Z' }), ...overrides });

describe('asset pipeline v2 production QA', () => {
  it('constructs a hash-bound QA record with evidence and policy metadata', () => { const r = review(); expect(r.finalHash).toBe('final'); expect(r.evidence.nativeScale).toEqual(['native.png']); expect(r.reviewPolicyVersion).toBe('asset_qa_v1'); });
  it('has category-specific policies', () => { expect(qaRulesForCategory('player')).toContain('animation_consistency'); expect(qaRulesForCategory('background')).toContain('parallax_role'); expect(qaRulesForCategory('ability_icon')).toContain('no_baked_text'); });
  it('automated checks never auto-promote', () => { const e = evaluation(); expect(e.automatedPassed).toBe(true); expect(target().maturity).toBe('QA_REVIEW'); });
  it('valid approval promotes QA_REVIEW to PRODUCTION_READY', () => { const p = promoteAssetThroughQa(target(), review()); expect(p.ok).toBe(true); expect(p.target.maturity).toBe('PRODUCTION_READY'); });
  it.each([['REJECT'], ['NEEDS_REWORK']] as const)('%s cannot promote', (decision) => expect(promoteAssetThroughQa(target(), review(decision)).ok).toBe(false));
  it('failed blocker prevents approval', () => { const e = evaluation({ evidence: { nativeScale: [], inContext: [] } }); const r = createQaReviewRecord(e, { reviewer: 'human', decision: 'APPROVE', previousMaturity: 'QA_REVIEW' }); expect(promoteAssetThroughQa(target(), r).reason).toMatch(/blocker/); });
  it('missing review prevents promotion', () => expect(promoteAssetThroughQa(target(), undefined).reason).toMatch(/missing/));
  it('stale hash prevents promotion and invalidates regeneration', () => { const changed = target({ finalHash: 'regenerated' }); expect(reviewIsCurrent(changed, review())).toBe(false); expect(promoteAssetThroughQa(changed, review()).reason).toMatch(/stale/); });
  it('pipeline mismatch prevents promotion', () => expect(promoteAssetThroughQa(target({ pipelineVersion: 'asset_pipeline_v3' }), review()).reason).toMatch(/version/));
  it('ineligible legacy maturity cannot bypass QA', () => expect(promoteAssetThroughQa(target({ maturity: 'COMPILED' }), review()).reason).toMatch(/not eligible/));
  it('preserves historical records', () => { const dir = join(tmpdir(), `mf-qa-${Date.now()}`); mkdirSync(dir); const old = review('NEEDS_REWORK', { reviewId: 'old' }); const current = review('APPROVE', { reviewId: 'current' }); writeQaReviewHistory(dir, [old, current]); expect(loadQaReviewHistory(dir, 'player').map((r) => r.reviewId)).toEqual(['old','current']); });
  it('derives family readiness from every member', () => { const members = [target(), target({ assetId: 'enemy', category: 'enemy', finalHash: 'enemyhash' })]; const reviews = [review(), review('APPROVE', { assetId: 'enemy', category: 'enemy', finalHash: 'enemyhash' })]; expect(deriveFamilyQaSummary('characters', members, reviews).productionReady).toBe(true); expect(deriveFamilyQaSummary('characters', members, reviews.slice(0,1)).productionReady).toBe(false); });
  it('records rejection maturity without deleting evidence', () => { const r = review('REJECT'); expect(r.resultingMaturity).toBe('REJECTED'); expect(r.evidence.inContext).toHaveLength(1); });
});
