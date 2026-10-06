import { describe, it, expect } from 'vitest';
import { buildPlayerAnimationManifest, poseNamesFromManifest } from '../src/animation-manifest.js';
import { POSE_TRANSFORMS } from '../src/png.js';

describe('player animation manifest', () => {
  it('includes locomotion plus dash/wall states only when those abilities exist', () => {
    const dashOnly = buildPlayerAnimationManifest({ abilities: ['dash'] });
    expect(poseNamesFromManifest(dashOnly)).toContain('idle');
    expect(poseNamesFromManifest(dashOnly)).toContain('dash');
    expect(poseNamesFromManifest(dashOnly)).not.toContain('wall_slide');

    const walls = buildPlayerAnimationManifest({ abilities: ['dash', 'wall_slide', 'wall_jump'] });
    expect(poseNamesFromManifest(walls)).toEqual(expect.arrayContaining(['dash', 'wall_slide', 'wall_jump']));
  });

  it('has a distinct procedural pose transform for every locomotion fallback state', () => {
    for (const name of [
      'idle',
      'run',
      'jump_start',
      'jump',
      'fall',
      'land',
      'dash',
      'wall_slide',
      'wall_jump',
      'ground_slam',
      'grapple',
      'swim',
      'phase',
    ]) {
      expect(POSE_TRANSFORMS[name]).toBeTruthy();
    }
  });
});
