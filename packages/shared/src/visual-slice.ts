import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MASS_VISUAL_PROFILES,
  type GenerationProfile,
} from './constants.js';
import { getRepoRoot } from './config.js';
import { inferGameArchetypeFromPrompt, isTopDownArchetype } from './archetypes.js';
import type { GameArchetype } from './constants.js';

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
  /** sha256-derived hash of the visual evidence (score/verdict/asset-maturity snapshot) this
   *  decision was made against — see @metroforge/generation's computeVisualEvidenceHash(). */
  evidenceHash?: string;
  /** Human identity, when the calling context has one (e.g. desktop app session). Optional —
   *  not every invocation of this CLI/IPC surface has an authenticated reviewer identity. */
  reviewer?: string;
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

/**
 * An approval recorded against one evidence snapshot must not silently keep authorizing a
 * candidate whose visual evidence (score/verdict/asset-maturity) has since changed — e.g. an
 * asset was reclassified or regenerated after the human looked at it. `currentEvidenceHash` is
 * produced by @metroforge/generation's computeVisualEvidenceHash() against the project's current
 * on-disk state; if it doesn't match what was approved, the approval is stale and must be treated
 * as not-yet-approved (the record itself is left in place for audit — never deleted here).
 */
export function isVisualSliceApprovalCurrent(
  approval: GlobalVisualSliceApproval,
  currentEvidenceHash: string | undefined,
): boolean {
  if (approval.visualSliceApproved !== true) return false;
  if (!approval.evidenceHash || !currentEvidenceHash) return false;
  return approval.evidenceHash === currentEvidenceHash;
}

export function isMassVisualProfile(profile: GenerationProfile): boolean {
  return (MASS_VISUAL_PROFILES as readonly string[]).includes(profile);
}

/**
 * LARGE / RELEASE_CANDIDATE may plan structure, but must not mass-generate final art
 * until a human approves a visual slice *for this project*.
 *
 * The approval record is scoped by `projectSlug` — a rejection (or approval) recorded against
 * one project must never silently gate or unlock mass generation for a different, unrelated
 * project. A record whose `projectSlug` does not match the project currently generating is
 * treated the same as no record at all: review required.
 */
export function assertMassVisualGenerationAllowed(
  profile: GenerationProfile,
  projectSlug: string,
  repoRoot = getRepoRoot(),
): void {
  if (!isMassVisualProfile(profile)) return;
  const approval = readVisualSliceApproval(repoRoot);
  if (approval.projectSlug !== projectSlug) {
    throw new MassVisualBlockedError(profile, projectSlug, 'no-approval-for-this-project');
  }
  if (approval.visualSliceApproved === true) return;
  throw new MassVisualBlockedError(
    profile,
    projectSlug,
    approval.status === 'VISUAL_SLICE_REJECTED' ? 'rejected' : 'review-required',
  );
}

export class MassVisualBlockedError extends Error {
  readonly code = 'VISUAL_SLICE_REVIEW_REQUIRED' as const;

  constructor(
    profile: GenerationProfile,
    projectSlug: string,
    reason: 'no-approval-for-this-project' | 'rejected' | 'review-required' = 'review-required',
  ) {
    const detail =
      reason === 'no-approval-for-this-project'
        ? `no visual-slice approval is recorded for "${projectSlug}"`
        : reason === 'rejected'
          ? `the visual slice for "${projectSlug}" was rejected`
          : `the visual slice for "${projectSlug}" has not been reviewed yet`;
    super(
      `${profile} mass visual asset generation is blocked until a human approves the visual vertical slice ` +
        `(Approve Visual Direction) — ${detail}. Structural planning may continue.`,
    );
    this.name = 'MassVisualBlockedError';
  }
}

/** Tile size for the visual quality reference. Other profiles keep historical 16. */
export function tileSizeForProfile(profile: GenerationProfile): number {
  return profile === 'VISUAL_VERTICAL_SLICE' ? 32 : 16;
}

/** Authored industrial identity pack for side-view visual-slice review. */
export const FOUNDRY_VISUAL_PACK_ID = 'metroforge-foundry-v3';

/**
 * Side-view VISUAL_VERTICAL_SLICE defaults onto the Foundry V3 pack and the visual
 * reference library so generated rooms can actually look like the identity pack.
 * Explicit CLI/IPC values always win. Top-down is unchanged.
 */
export function applyVisualSliceIdentityDefaults<
  T extends {
    profile: GenerationProfile;
    prompt?: string;
    archetype?: GameArchetype;
    externalVisualPack?: string;
    useVisualReferenceLibrary?: boolean;
  },
>(options: T): T {
  if (options.profile !== 'VISUAL_VERTICAL_SLICE') return options;
  const archetype = options.archetype ?? inferGameArchetypeFromPrompt(options.prompt ?? '');
  if (isTopDownArchetype(archetype)) return options;
  return {
    ...options,
    externalVisualPack: options.externalVisualPack ?? FOUNDRY_VISUAL_PACK_ID,
    useVisualReferenceLibrary: options.useVisualReferenceLibrary !== false,
  };
}

export const VISUAL_SLICE_INTERNAL_RESOLUTION = { width: 640, height: 360 } as const;
export const VISUAL_SLICE_TARGET_RESOLUTION = { width: 1920, height: 1080 } as const;
export const VISUAL_SLICE_CAMERA_ZOOM = 3;
export const VISUAL_SLICE_PLAYER_FRAME = { width: 64, height: 64 } as const;

/** Avoid resolving repo root via import.meta when unit tests stub getRepoRoot. */
export function packageDirFromMeta(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
}
