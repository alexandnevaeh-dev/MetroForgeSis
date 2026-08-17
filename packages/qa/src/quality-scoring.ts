import type {
  QualityProvenanceSummary,
  QualityScorecard,
  QualitySnapshot,
} from './quality-types.js';

export interface TechnicalInputs {
  validationPassed: boolean;
  playtestPassed: boolean;
  transitionsCompleted: number;
  transitionsPlanned: number;
  commercialSafe: boolean;
  placeholderCount: number;
  godotImportPassed: boolean;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

export function scoreTechnical(input: TechnicalInputs): number {
  let score = 0;
  if (input.validationPassed) score += 20;
  if (input.godotImportPassed) score += 15;
  if (input.playtestPassed) score += 30;
  if (input.transitionsPlanned > 0 && input.transitionsCompleted === input.transitionsPlanned) {
    score += 20;
  } else if (input.transitionsPlanned > 0) {
    score += Math.round(20 * (input.transitionsCompleted / input.transitionsPlanned));
  }
  if (input.commercialSafe) score += 10;
  if (input.placeholderCount === 0) score += 5;
  else score -= Math.min(15, input.placeholderCount);
  return clamp(score);
}

export function scorePresentation(snapshot: QualitySnapshot): number {
  const critic = clamp(snapshot.criticScore);
  const luma = clamp((snapshot.lumaStdDev / 12) * 100);
  const colors = clamp((snapshot.uniqueColors / 48) * 100);
  const occupancy = clamp(snapshot.occupancy * 100);
  const structureBonus = snapshot.lumaStdDev >= 4 ? 8 : 0;
  const passBonus = snapshot.criticPassed ? 10 : 0;
  return clamp(critic * 0.45 + luma * 0.2 + colors * 0.1 + occupancy * 0.1 + structureBonus + passBonus);
}

export function combineQualityScores(
  technical: number,
  presentation: number,
): QualityScorecard {
  const weighted = clamp(technical * 0.45 + presentation * 0.55);
  const qualityScore = clamp(Math.min(weighted, presentation));
  return {
    qualityScore: Math.round(qualityScore * 10) / 10,
    technicalScore: Math.round(technical * 10) / 10,
    presentationScore: Math.round(presentation * 10) / 10,
    breakdown: {
      technical: Math.round(technical * 10) / 10,
      presentation: Math.round(presentation * 10) / 10,
    },
  };
}

export function emptySnapshot(): QualitySnapshot {
  return {
    criticScore: 0,
    lumaStdDev: 0,
    uniqueColors: 0,
    occupancy: 0,
    criticPassed: false,
    criticIssues: ['no screenshot'],
  };
}

export function defaultProvenance(): QualityProvenanceSummary {
  return {
    commercialSafe: false,
    placeholderCount: -1,
    rejectedDeathSheets: 0,
    nvidiaVfxCount: 0,
  };
}
