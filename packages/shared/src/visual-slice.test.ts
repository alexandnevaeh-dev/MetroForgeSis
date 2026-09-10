import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyVisualSliceIdentityDefaults,
  FOUNDRY_VISUAL_PACK_ID,
  PROFILE_DEFAULTS,
  GENERATION_PROFILES,
  isMassVisualProfile,
  tileSizeForProfile,
} from '../src/index.js';
import { pickRegisteredAbilities } from '../src/registered-abilities.js';
import {
  assertMassVisualGenerationAllowed,
  writeVisualSliceApproval,
  MassVisualBlockedError,
} from './visual-slice.js';

describe('VISUAL_VERTICAL_SLICE profile', () => {
  it('is registered with 3 biomes and 12-15 rooms — enough to prove biome differentiation', () => {
    expect(GENERATION_PROFILES).toContain('VISUAL_VERTICAL_SLICE');
    const d = PROFILE_DEFAULTS.VISUAL_VERTICAL_SLICE;
    expect(d.biomes).toBe(3);
    expect(d.roomsMin).toBeGreaterThanOrEqual(12);
    expect(d.roomsMax).toBeLessThanOrEqual(15);
    expect(d.enemies).toBeLessThanOrEqual(4);
    expect(d.bosses).toBe(1);
    expect(d.abilities).toBe(1);
  });

  it('uses one registered traversal ability and 32px tiles', () => {
    expect(pickRegisteredAbilities('VISUAL_VERTICAL_SLICE')).toHaveLength(1);
    expect(tileSizeForProfile('VISUAL_VERTICAL_SLICE')).toBe(32);
    expect(tileSizeForProfile('TINY_TEST')).toBe(16);
  });

  it('treats LARGE and RELEASE_CANDIDATE as mass visual profiles', () => {
    expect(isMassVisualProfile('LARGE')).toBe(true);
    expect(isMassVisualProfile('RELEASE_CANDIDATE')).toBe(true);
    expect(isMassVisualProfile('VISUAL_VERTICAL_SLICE')).toBe(false);
    expect(isMassVisualProfile('TINY_TEST')).toBe(false);
  });
});

describe('assertMassVisualGenerationAllowed — approval scoped per project', () => {
  function freshRepoRoot(): string {
    return mkdtempSync(join(tmpdir(), 'mf-visual-slice-approval-'));
  }

  it('never gates a non-mass-visual profile, even unapproved', () => {
    const root = freshRepoRoot();
    expect(() => assertMassVisualGenerationAllowed('TINY_TEST', 'any-project', root)).not.toThrow();
    rmSync(root, { recursive: true, force: true });
  });

  it('blocks when no approval record exists at all', () => {
    const root = freshRepoRoot();
    expect(() => assertMassVisualGenerationAllowed('RELEASE_CANDIDATE', 'heart-engine', root)).toThrow(
      MassVisualBlockedError,
    );
    rmSync(root, { recursive: true, force: true });
  });

  it('allows generation once this exact project has a recorded approval', () => {
    const root = freshRepoRoot();
    writeVisualSliceApproval(
      { visualSliceApproved: true, status: 'VISUAL_SLICE_APPROVED', projectSlug: 'heart-engine' },
      root,
    );
    expect(() => assertMassVisualGenerationAllowed('RELEASE_CANDIDATE', 'heart-engine', root)).not.toThrow();
    rmSync(root, { recursive: true, force: true });
  });

  it('does NOT let an approval recorded for a different project unlock this one', () => {
    const root = freshRepoRoot();
    writeVisualSliceApproval(
      { visualSliceApproved: true, status: 'VISUAL_SLICE_APPROVED', projectSlug: 'some-other-game' },
      root,
    );
    expect(() => assertMassVisualGenerationAllowed('RELEASE_CANDIDATE', 'heart-engine', root)).toThrow(
      MassVisualBlockedError,
    );
    rmSync(root, { recursive: true, force: true });
  });

  it('does NOT let a rejection recorded for a different (obsolete) project poison this one', () => {
    // Regression: a prior session's rejection of vgf2-tideglass-nave's visual slice must not
    // permanently block every future RELEASE_CANDIDATE/LARGE generation from every project.
    const root = freshRepoRoot();
    writeVisualSliceApproval(
      {
        visualSliceApproved: false,
        status: 'VISUAL_SLICE_REJECTED',
        projectSlug: 'vgf2-tideglass-nave',
        notes: 'HUMAN_REJECTED: tile repetition, weak character identity',
      },
      root,
    );
    // Blocked because *this* project has no approval yet — not because of the other project's
    // rejection specifically. The distinguishing behavior: approving THIS project still works.
    expect(() => assertMassVisualGenerationAllowed('RELEASE_CANDIDATE', 'heart-engine-vgf-recheck', root)).toThrow(
      MassVisualBlockedError,
    );
    writeVisualSliceApproval(
      { visualSliceApproved: true, status: 'VISUAL_SLICE_APPROVED', projectSlug: 'heart-engine-vgf-recheck' },
      root,
    );
    expect(() =>
      assertMassVisualGenerationAllowed('RELEASE_CANDIDATE', 'heart-engine-vgf-recheck', root),
    ).not.toThrow();
    rmSync(root, { recursive: true, force: true });
  });

  it('blocks when this exact project was itself rejected', () => {
    const root = freshRepoRoot();
    writeVisualSliceApproval(
      { visualSliceApproved: false, status: 'VISUAL_SLICE_REJECTED', projectSlug: 'heart-engine' },
      root,
    );
    expect(() => assertMassVisualGenerationAllowed('RELEASE_CANDIDATE', 'heart-engine', root)).toThrow(
      MassVisualBlockedError,
    );
    rmSync(root, { recursive: true, force: true });
  });
});

describe('applyVisualSliceIdentityDefaults', () => {
  it('defaults side-view VISUAL_VERTICAL_SLICE onto Foundry V3 and the visual reference library', () => {
    const next = applyVisualSliceIdentityDefaults({
      profile: 'VISUAL_VERTICAL_SLICE' as const,
      prompt: 'a courier runs industrial transit shafts',
      archetype: 'SIDE_VIEW_METROIDVANIA' as const,
      externalVisualPack: undefined as string | undefined,
      useVisualReferenceLibrary: undefined as boolean | undefined,
    });
    expect(next.externalVisualPack).toBe(FOUNDRY_VISUAL_PACK_ID);
    expect(next.useVisualReferenceLibrary).toBe(true);
  });

  it('does not override an explicit pack or an explicit --no-visual-reference-library', () => {
    const next = applyVisualSliceIdentityDefaults({
      profile: 'VISUAL_VERTICAL_SLICE' as const,
      archetype: 'SIDE_VIEW_METROIDVANIA' as const,
      externalVisualPack: 'industrial-transit',
      useVisualReferenceLibrary: false,
    });
    expect(next.externalVisualPack).toBe('industrial-transit');
    expect(next.useVisualReferenceLibrary).toBe(false);
  });

  it('leaves top-down visual slices and non-slice profiles unchanged', () => {
    const topDown = applyVisualSliceIdentityDefaults({
      profile: 'VISUAL_VERTICAL_SLICE' as const,
      archetype: 'TOP_DOWN_ACTION_ADVENTURE' as const,
      externalVisualPack: undefined as string | undefined,
      useVisualReferenceLibrary: undefined as boolean | undefined,
    });
    expect(topDown.externalVisualPack).toBeUndefined();
    expect(topDown.useVisualReferenceLibrary).toBeUndefined();

    const tiny = applyVisualSliceIdentityDefaults({
      profile: 'TINY_TEST' as const,
      archetype: 'SIDE_VIEW_METROIDVANIA' as const,
      externalVisualPack: undefined as string | undefined,
    });
    expect(tiny.externalVisualPack).toBeUndefined();
  });
});
