import { describe, it, expect } from 'vitest';
import { characterLineageRootFor } from './manual-asset.js';
import { descendantRelPaths } from './artifact-lineage.js';

describe('characterLineageRootFor', () => {
  it('cascades only when the canonical character still itself is regenerated', () => {
    expect(characterLineageRootFor('player_sprite', 'player')).toBe('player');
  });

  it('regression: does NOT cascade when a specific derived pose/sheet is regenerated', () => {
    // Bug: this used to cascade for every player_sprite regeneration regardless of assetId.
    // descendantRelPaths('player') includes 'player_land_pose' (one of the tracked lineage
    // poses), so cascading here would delete the very file the caller just wrote.
    expect(characterLineageRootFor('player_sprite', 'player_land_pose')).toBe('');
    expect(characterLineageRootFor('player_sprite', 'player_swim_pose')).toBe('');
    expect(characterLineageRootFor('player_sprite', 'player_wall_slide_pose')).toBe('');
  });

  it('never cascades for non-player_sprite asset types', () => {
    expect(characterLineageRootFor('enemy', 'enemy_000')).toBe('');
    expect(characterLineageRootFor('ui_icon', 'player')).toBe('');
  });

  it('sanity check on the actual bug: player_land_pose really is a tracked lineage descendant of player', () => {
    const descendants = descendantRelPaths('player').map((d) => d.id);
    expect(descendants).toContain('player_land_pose');
  });
});
