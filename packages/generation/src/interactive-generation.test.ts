import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTERACTIVE_MILESTONES,
  shouldPauseAtMilestone,
} from './interactive-generation.js';

describe('shouldPauseAtMilestone', () => {
  it('never pauses in autonomous mode', () => {
    expect(shouldPauseAtMilestone('autonomous', undefined, 'game_dna')).toBe(false);
  });

  it('pauses at default milestones in interactive mode', () => {
    for (const milestone of DEFAULT_INTERACTIVE_MILESTONES) {
      expect(shouldPauseAtMilestone('interactive', undefined, milestone)).toBe(true);
    }
    expect(shouldPauseAtMilestone('interactive', undefined, 'player_concept')).toBe(false);
  });

  it('respects custom milestone list', () => {
    expect(shouldPauseAtMilestone('custom', ['bosses'], 'bosses')).toBe(true);
    expect(shouldPauseAtMilestone('custom', ['bosses'], 'game_dna')).toBe(false);
  });
});
