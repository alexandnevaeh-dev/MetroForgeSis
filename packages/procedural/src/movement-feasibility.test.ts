import { describe, expect, it } from 'vitest';
import { generateWorldTopology } from './world.js';
import {
  DEFAULT_MOVEMENT_STATS,
  validateMovementFeasibility,
} from './movement-feasibility.js';

describe('validateMovementFeasibility', () => {
  it('passes for generated TINY worlds with default movement stats', () => {
    const { worldGraph } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash'],
      bossCount: 1,
      profile: 'TINY_TEST',
    });

    const report = validateMovementFeasibility(worldGraph, DEFAULT_MOVEMENT_STATS);
    expect(report.feasible).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it('flags dash gates on vertical transitions', () => {
    const report = validateMovementFeasibility(
      {
        version: '0.1.0',
        seed: 1,
        nodes: [
          { id: 'room_000', type: 'room', label: 'A', metadata: {} },
          { id: 'room_001', type: 'room', label: 'B', metadata: {} },
        ],
        edges: [
          {
            id: 'edge_bad',
            from: 'room_000',
            to: 'room_001',
            requirements: ['dash'],
            optional: false,
            bidirectional: true,
            transition: 'up',
          },
        ],
        regions: [],
      },
      DEFAULT_MOVEMENT_STATS,
    );

    expect(report.feasible).toBe(false);
    expect(report.issues[0]?.reason).toContain('dash cannot satisfy up gate');
  });

  it('accepts grapple and ground_slam gates on their intended axes', () => {
    const report = validateMovementFeasibility(
      {
        version: '0.1.0',
        seed: 1,
        nodes: [
          { id: 'room_000', type: 'room', label: 'A', metadata: {} },
          { id: 'room_001', type: 'room', label: 'B', metadata: {} },
          { id: 'room_002', type: 'room', label: 'C', metadata: {} },
        ],
        edges: [
          {
            id: 'edge_grapple',
            from: 'room_000',
            to: 'room_001',
            requirements: ['grapple'],
            optional: false,
            bidirectional: true,
            transition: 'up',
          },
          {
            id: 'edge_slam',
            from: 'room_001',
            to: 'room_002',
            requirements: ['ground_slam'],
            optional: false,
            bidirectional: true,
            transition: 'down',
          },
        ],
        regions: [],
      },
      DEFAULT_MOVEMENT_STATS,
    );

    expect(report.feasible).toBe(true);
  });
});
