import { describe, it, expect } from 'vitest';
import {
  buildMovementJson,
  DEFAULT_PLAYER_MOVEMENT_TUNING,
  movementFeasibilityStats,
} from './movement-tuning.js';

describe('buildMovementJson', () => {
  it('fills extended tuning from defaults when Game DNA only has core fields', () => {
    const json = buildMovementJson({
      walkSpeed: 200,
      runSpeed: 350,
      jumpHeight: 120,
      gravity: 980,
    });
    expect(json.grappleSpeed).toBe(DEFAULT_PLAYER_MOVEMENT_TUNING.grappleSpeed);
    expect(json.swimSpeed).toBe(DEFAULT_PLAYER_MOVEMENT_TUNING.swimSpeed);
    expect(json.phaseDuration).toBe(DEFAULT_PLAYER_MOVEMENT_TUNING.phaseDuration);
    expect(json.dashSpeed).toBe(DEFAULT_PLAYER_MOVEMENT_TUNING.dashSpeed);
  });

  it('applies Game DNA overrides for grapple/swim/phase', () => {
    const json = buildMovementJson({
      walkSpeed: 200,
      runSpeed: 350,
      jumpHeight: 120,
      gravity: 980,
      grappleSpeed: 700,
      swimSpeed: 220,
      phaseDuration: 0.3,
    });
    expect(json.grappleSpeed).toBe(700);
    expect(json.swimSpeed).toBe(220);
    expect(json.phaseDuration).toBe(0.3);
  });

  it('exports dash stats for movement-feasibility', () => {
    const stats = movementFeasibilityStats(buildMovementJson(DEFAULT_PLAYER_MOVEMENT_TUNING));
    expect(stats.dashSpeed).toBe(500);
    expect(stats.airDashSpeed).toBe(450);
  });
});
