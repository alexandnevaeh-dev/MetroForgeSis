import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildAutomatedQaEvaluation,
  createQaReviewRecord,
  loadQaReviewHistory,
  promoteAssetThroughQa,
  writeQaReviewHistory,
  type AssetQaCategory,
  type AssetQaDecision,
  type AssetQaReviewRecord,
  type QaPromotionTarget,
} from './asset-qa.js';

export interface ProjectAssetQaResult {
  success: boolean;
  error?: string;
  review?: AssetQaReviewRecord;
  maturity?: string;
  reviewPath?: string;
}

/** Persist a hash-bound operator decision and update maturity only through the central QA gate. */
export function decideProjectAssetQa(projectPath: string, input: {
  assetId: string; expectedHash: string; decision: AssetQaDecision; reviewer: string;
  notes?: string; reasonCodes?: string[];
}): ProjectAssetQaResult {
  const manifestPath = join(projectPath, 'generation_manifest.json');
  if (!existsSync(manifestPath)) return { success: false, error: 'generation_manifest.json missing' };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { artifacts?: Array<Record<string, unknown>> };
  const artifact = manifest.artifacts?.find((candidate) => candidate.id === input.assetId);
  if (!artifact) return { success: false, error: `asset not found: ${input.assetId}` };
  const finalHash = String(artifact.finalHash ?? '');
  if (!finalHash) return { success: false, error: 'asset has no finalHash; it cannot enter hash-bound QA' };
  if (input.expectedHash !== finalHash) return { success: false, error: `expected hash mismatch: manifest is ${finalHash}` };
  const runtimePath = String(artifact.godotResourcePath ?? artifact.path ?? '');
  const compiledPath = join(projectPath, String(artifact.path ?? '').replace(/^res:\/\//, ''));
  const diskHash = existsSync(compiledPath) ? createHash('sha256').update(readFileSync(compiledPath)).digest('hex') : '';
  const evidence = {
    nativeScale: [join(projectPath, 'qa', 'evidence', 'native', `${input.assetId}.png`)],
    inContext: [join(projectPath, 'qa', 'evidence', 'in-context', `${input.assetId}.png`)],
    contactSheet: join(projectPath, 'qa', 'evidence', 'contact-sheet.png'),
  };
  const target: QaPromotionTarget = {
    assetId: input.assetId,
    category: String(artifact.category ?? 'prop') as AssetQaCategory,
    pipelineVersion: String(artifact.pipelineVersion ?? artifact.compiler ?? 'legacy'),
    sourceHash: String(artifact.sourceHash ?? ''), finalHash, runtimePath,
    maturity: String(artifact.maturity ?? 'GENERATED_SOURCE') as QaPromotionTarget['maturity'],
    productionReady: artifact.productionReady === true,
  };
  const evaluation = buildAutomatedQaEvaluation({
    ...target, evidence, technicalValidationPassed: artifact.validationPassed === true,
    currentHashMatchesFile: diskHash === finalHash, duplicateSource: artifact.duplicateSource === true,
    evidenceExists: existsSync,
  });
  const review = createQaReviewRecord(evaluation, { ...input, previousMaturity: target.maturity });
  const history = loadQaReviewHistory(projectPath, input.assetId);
  writeQaReviewHistory(projectPath, [...history, review]);
  if (input.decision === 'APPROVE') {
    const promotion = promoteAssetThroughQa(target, review);
    if (!promotion.ok) return { success: false, error: promotion.reason, review, maturity: target.maturity };
    artifact.maturity = promotion.target.maturity;
    artifact.productionReady = true;
  } else {
    artifact.maturity = input.decision === 'REJECT' ? 'REJECTED' : 'QA_REVIEW';
    artifact.productionReady = false;
  }
  artifact.qaReviewId = review.reviewId;
  artifact.qaDecision = review.decision;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { success: true, review, maturity: String(artifact.maturity), reviewPath: join(projectPath, 'qa', 'reviews', input.assetId, `${review.reviewId}.json`) };
}
