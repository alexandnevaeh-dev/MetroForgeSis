import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MASS_VISUAL_PROFILES,
  type GenerationProfile,
} from './constants.js';
import { getRepoRoot } from './config.js';

export type VisualReviewStatus =
  | 'NOT_APPLICABLE'
  | 'VISUAL_SLICE_REVIEW_REQUIRED'
  | 'VISUAL_SLICE_APPROVED'
  | 'VISUAL_SLICE_REJECTED';

export interface GlobalVisualSliceApproval {
  visualSliceApproved: boolean;
  status: VisualReviewStatus;
  projectSlug?: string;
  approvedAt?: string;
  rejectedAt?: string;
  notes?: string;
}

const APPROVAL_REL = join('.metroforge', 'visual-slice-approval.json');

export function visualSliceApprovalPath(repoRoot = getRepoRoot()): string {
  return join(repoRoot, APPROVAL_REL);
}

export function readVisualSliceApproval(repoRoot = getRepoRoot()): GlobalVisualSliceApproval {
  const path = visualSliceApprovalPath(repoRoot);
  if (!existsSync(path)) {
    return { visualSliceApproved: false, status: 'VISUAL_SLICE_REVIEW_REQUIRED' };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<GlobalVisualSliceApproval>;
    return {
      visualSliceApproved: parsed.visualSliceApproved === true,
      status: parsed.status ?? (parsed.visualSliceApproved ? 'VISUAL_SLICE_APPROVED' : 'VISUAL_SLICE_REVIEW_REQUIRED'),
      projectSlug: parsed.projectSlug,
      approvedAt: parsed.approvedAt,
      rejectedAt: parsed.rejectedAt,
      notes: parsed.notes,
    };
  } catch {
    return { visualSliceApproved: false, status: 'VISUAL_SLICE_REVIEW_REQUIRED' };
  }
}

export function writeVisualSliceApproval(
  approval: GlobalVisualSliceApproval,
  repoRoot = getRepoRoot(),
): string {
  const path = visualSliceApprovalPath(repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ...approval, updatedAt: new Date().toISOString() }, null, 2));
  return path;
}

export function isMassVisualProfile(profile: GenerationProfile): boolean {
  return (MASS_VISUAL_PROFILES as readonly string[]).includes(profile);
}

/**
 * LARGE / RELEASE_CANDIDATE may plan structure, but must not mass-generate final art
 * until a human approves a visual slice.
 */
export function assertMassVisualGenerationAllowed(
  profile: GenerationProfile,
  repoRoot = getRepoRoot(),
): void {
  if (!isMassVisualProfile(profile)) return;
  const approval = readVisualSliceApproval(repoRoot);
  if (approval.visualSliceApproved === true) return;
  throw new MassVisualBlockedError(profile);
}

export class MassVisualBlockedError extends Error {
  readonly code = 'VISUAL_SLICE_REVIEW_REQUIRED' as const;

  constructor(profile: GenerationProfile) {
    super(
      `${profile} mass visual asset generation is blocked until a human approves the visual vertical slice ` +
        `(Approve Visual Direction). Structural planning may continue.`,
    );
    this.name = 'MassVisualBlockedError';
  }
}

/** Tile size for the visual quality reference. Other profiles keep historical 16. */
export function tileSizeForProfile(profile: GenerationProfile): number {
  return profile === 'VISUAL_VERTICAL_SLICE' ? 32 : 16;
}

export const VISUAL_SLICE_INTERNAL_RESOLUTION = { width: 640, height: 360 } as const;
export const VISUAL_SLICE_TARGET_RESOLUTION = { width: 1920, height: 1080 } as const;
export const VISUAL_SLICE_CAMERA_ZOOM = 3;
export const VISUAL_SLICE_PLAYER_FRAME = { width: 64, height: 64 } as const;

/** Avoid resolving repo root via import.meta when unit tests stub getRepoRoot. */
export function packageDirFromMeta(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
}
