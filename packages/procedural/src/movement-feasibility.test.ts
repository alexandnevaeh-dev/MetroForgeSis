import { describe, expect, it } from 'vitest';
import type { WorldGraph } from '@metroforge/schemas';
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

  it('flags a grapple gate whose real project grappleSpeed is too slow to reach it', () => {
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: [
        { id: 'room_000', type: 'room', label: 'A', metadata: {} },
        { id: 'room_001', type: 'room', label: 'B', metadata: {} },
      ],
      edges: [
        {
          id: 'edge_grapple',
          from: 'room_000',
          to: 'room_001',
          requirements: ['grapple'],
          optional: false,
          bidirectional: true,
          transition: 'up' as const,
        },
      ],
      regions: [],
    };

    // Previously grapple was excluded from the 'up' feasibility check entirely, so no
    // grappleSpeed value — however low — could ever fail this gate. Confirm it now genuinely can.
    const slow = validateMovementFeasibility(worldGraph, {
      ...DEFAULT_MOVEMENT_STATS,
      grappleSpeed: 50,
    });
    expect(slow.feasible).toBe(false);
    expect(slow.issues[0]?.reason).toContain('grapple');

    const fast = validateMovementFeasibility(worldGraph, DEFAULT_MOVEMENT_STATS);
    expect(fast.feasible).toBe(true);
  });

  it('accepts wall_jump/wall_slide gates within a single room\'s up-gap', () => {
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: [
        { id: 'room_000', type: 'room', label: 'A', metadata: {} },
        { id: 'room_001', type: 'room', label: 'B', metadata: {} },
      ],
      edges: [
        {
          id: 'edge_wall_jump',
          from: 'room_000',
          to: 'room_001',
          requirements: ['wall_jump'],
          optional: false,
          bidirectional: true,
          transition: 'up' as const,
        },
      ],
      regions: [],
    };

    const report = validateMovementFeasibility(worldGraph, DEFAULT_MOVEMENT_STATS);
    expect(report.feasible).toBe(true);
  });
});
