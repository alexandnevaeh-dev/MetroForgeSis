import { describe, expect, it } from 'vitest';
import type { WorldGraph, ProgressionGraph } from '@metroforge/schemas';
import {
  generateFullMetroidvaniaWorld,
  validateWorldDesign,
  deriveWorldLayout,
  evaluateFullWorldApplicability,
  generateWorldDesignReport,
  FULL_WORLD_TEST_CONFIG,
  FULL_WORLD_TEST_SEEDS,
  MIN_FULL_WORLD_ZONES,
} from './world-design.js';
import { generateWorldTopology } from './world.js';

function extentsFor(roomIds: string[], width = 800, height = 600) {
  return roomIds.map((id) => ({ id, width, height }));
}

describe('generateFullMetroidvaniaWorld + validateWorldDesign — deterministic seed sweep', () => {
  it('rejects biomeCount below MIN_FULL_WORLD_ZONES rather than silently forcing a small world into a four-zone shape', () => {
    expect(() => generateFullMetroidvaniaWorld({ ...FULL_WORLD_TEST_CONFIG, seed: 1, biomeCount: 2 })).toThrow(/biomeCount/);
  });

  it.each(FULL_WORLD_TEST_SEEDS)('seed %i produces a valid, non-trivial full Metroidvania world', (seed) => {
    const { worldGraph, progressionGraph, roomIds } = generateFullMetroidvaniaWorld({ ...FULL_WORLD_TEST_CONFIG, seed });
    const design = validateWorldDesign({ worldGraph, progressionGraph, roomExtents: extentsFor(roomIds) });

    expect(design.issues, `seed ${seed} issues: ${JSON.stringify(design.issues)}`).toEqual([]);
    expect(design.passed).toBe(true);
    expect(design.zoneCount).toBeGreaterThanOrEqual(MIN_FULL_WORLD_ZONES);
    // Every requirement category this suite was built to exercise is actually present at least
    // once — a passing report with zero shortcuts/combat gates/teases would be passing the check
    // by having nothing to check, not by being a good world.
    expect(design.gateTypeCounts.movement).toBeGreaterThan(0);
    expect(design.gateTypeCounts.combat).toBeGreaterThan(0);
    expect(design.shortcutCount).toBeGreaterThan(0);
    expect(design.oneWayCount).toBeGreaterThan(0);
    expect(design.breakableCount).toBeGreaterThan(0);
    expect(design.teaseCount).toBeGreaterThan(0);
    expect(design.teachingRoomCount).toBeGreaterThan(0);
    expect(design.layout.overlapCount).toBe(0);
    expect(design.layout.incompatibleDoorCount).toBe(0);
    expect(design.progressionProof.victoryAchievable).toBe(true);
  });

  it('is deterministic — the same seed produces the same structure (edge ids are opaque and intentionally not seeded, matching generateWorldTopology/generateId elsewhere in this package)', () => {
    const strip = (g: ReturnType<typeof generateFullMetroidvaniaWorld>['worldGraph']) => ({
      nodes: g.nodes.map((n) => ({ id: n.id, type: n.type, metadata: n.metadata })),
      edges: g.edges.map((e) => ({ from: e.from, to: e.to, requirements: e.requirements, optional: e.optional, bidirectional: e.bidirectional, transition: e.transition, kind: e.kind, metadata: e.metadata })),
      regions: g.regions,
    });
    const a = generateFullMetroidvaniaWorld({ ...FULL_WORLD_TEST_CONFIG, seed: 700001 });
    const b = generateFullMetroidvaniaWorld({ ...FULL_WORLD_TEST_CONFIG, seed: 700001 });
    expect(JSON.stringify(strip(a.worldGraph))).toBe(JSON.stringify(strip(b.worldGraph)));
  });
});

describe('evaluateFullWorldApplicability', () => {
  it('does not require a small VISUAL_VERTICAL_SLICE / TINY_TEST-scale world to have four zones', () => {
    const { worldGraph, progressionGraph, roomIds } = generateWorldTopology({
      seed: 1,
      roomCount: 12,
      biomeCount: 2,
      abilities: ['dash'],
      bossCount: 1,
      profile: 'VISUAL_VERTICAL_SLICE',
    });
    const applicability = evaluateFullWorldApplicability(worldGraph);
    expect(applicability.applicable).toBe(false);
    // The suite must not report a full-world FAIL against a slice that was never meant to have
    // four zones — only the reused progression-proof checks (self-lock, victory route, movement
    // feasibility) apply; zone/tease/combat-gate/teaching-room checks are skipped, not failed.
    const design = validateWorldDesign({ worldGraph, progressionGraph, roomExtents: extentsFor(roomIds) });
    expect(design.issues.some((i) => i.code === 'no_tease_metadata' || i.code === 'no_combat_gate' || i.code === 'empty_zone')).toBe(false);
  });
});

describe('deriveWorldLayout', () => {
  it('places the start room at the origin and every reachable room somewhere', () => {
    const { worldGraph, roomIds } = generateFullMetroidvaniaWorld({ ...FULL_WORLD_TEST_CONFIG, seed: 700001 });
    const layout = deriveWorldLayout(worldGraph, extentsFor(roomIds));
    expect(layout.placements.get(roomIds[0]!)).toMatchObject({ x: 0, y: 0 });
    expect(layout.placements.size).toBe(roomIds.length);
  });
});

// -------------------------------------------------------------------------------------------
// Deliberately invalid fixtures — each must fail validateWorldDesign for the SPECIFIC reason
// named, not merely fail somehow. House style: inline WorldGraph/ProgressionGraph literals (see
// movement-feasibility.test.ts), not loaded fixture files.
// -------------------------------------------------------------------------------------------

function baseProgression(startId: string, endId: string, abilities: string[]): ProgressionGraph {
  return {
    version: '0.1.0',
    seed: 1,
    startNodeId: startId,
    endNodeId: endId,
    nodes: [],
    edges: [],
    abilities,
    criticalPath: [],
  };
}

describe('validateWorldDesign — deliberately invalid fixtures', () => {
  it('fails with a self-locked ability (gate to the pickup room requires the ability it grants)', () => {
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: [
        { id: 'A', type: 'room', label: 'A', metadata: {} },
        { id: 'B', type: 'room', label: 'B', metadata: { grantsAbilities: ['dash'] } },
        { id: 'C', type: 'room', label: 'C', metadata: {} },
      ],
      edges: [
        { id: 'e1', from: 'A', to: 'B', requirements: ['dash'], optional: false, bidirectional: true },
        { id: 'e2', from: 'B', to: 'C', requirements: [], optional: false, bidirectional: true },
      ],
      regions: [{ id: 'r0', name: 'R0', biomeId: 'b0', roomIds: ['A', 'B', 'C'] }],
    };
    const design = validateWorldDesign({ worldGraph, progressionGraph: baseProgression('A', 'C', ['dash']), roomExtents: extentsFor(['A', 'B', 'C']) });
    expect(design.passed).toBe(false);
    expect(design.progressionProof.selfLocks.map((s) => s.abilityId)).toContain('dash');
  });

  it('fails with a mandatory-gate bypass (an ungated route skips the ability requirement entirely)', () => {
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: [
        { id: 'A', type: 'room', label: 'A', metadata: { grantsAbilities: ['dash'] } },
        { id: 'B', type: 'room', label: 'B', metadata: {} },
        { id: 'C', type: 'room', label: 'C', metadata: {} },
      ],
      edges: [
        { id: 'gate', from: 'A', to: 'B', requirements: ['dash'], optional: false, bidirectional: true },
        { id: 'bypass1', from: 'A', to: 'C', requirements: [], optional: false, bidirectional: true },
        { id: 'bypass2', from: 'C', to: 'B', requirements: [], optional: false, bidirectional: true },
      ],
      regions: [{ id: 'r0', name: 'R0', biomeId: 'b0', roomIds: ['A', 'B', 'C'] }],
    };
    const design = validateWorldDesign({ worldGraph, progressionGraph: baseProgression('A', 'B', ['dash']), roomExtents: extentsFor(['A', 'B', 'C']) });
    expect(design.passed).toBe(false);
    expect(design.issues.map((i) => i.code)).toContain('mandatory_gate_bypassed');
  });

  it('fails with a disconnected zone (a declared region with no rooms)', () => {
    const { worldGraph, progressionGraph, roomIds } = generateFullMetroidvaniaWorld({ ...FULL_WORLD_TEST_CONFIG, seed: 700001 });
    const broken: WorldGraph = { ...worldGraph, regions: [...worldGraph.regions.slice(0, -1), { ...worldGraph.regions[worldGraph.regions.length - 1]!, roomIds: [] }] };
    const design = validateWorldDesign({ worldGraph: broken, progressionGraph, roomExtents: extentsFor(roomIds) });
    expect(design.passed).toBe(false);
    expect(design.issues.map((i) => i.code)).toContain('empty_zone');
  });

  it('fails with an impossible return route (a one-way edge drops into a dead end)', () => {
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: [
        { id: 'A', type: 'room', label: 'A', metadata: {} },
        { id: 'B', type: 'room', label: 'B', metadata: {} },
      ],
      edges: [{ id: 'drop', from: 'A', to: 'B', requirements: [], optional: false, bidirectional: false, kind: 'one_way' }],
      regions: [{ id: 'r0', name: 'R0', biomeId: 'b0', roomIds: ['A', 'B'] }],
    };
    const design = validateWorldDesign({ worldGraph, progressionGraph: baseProgression('A', 'B', []), roomExtents: extentsFor(['A', 'B']) });
    expect(design.passed).toBe(false);
    expect(design.issues.map((i) => i.code)).toContain('one_way_softlock');
  });

  it('fails with a misplaced door (two edges compute two different positions for the same room)', () => {
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: [
        { id: 'A', type: 'room', label: 'A', metadata: {} },
        { id: 'B', type: 'room', label: 'B', metadata: {} },
        { id: 'C', type: 'room', label: 'C', metadata: {} },
      ],
      edges: [
        { id: 'e1', from: 'A', to: 'B', requirements: [], optional: false, bidirectional: true, transition: 'right' },
        // C is placed via a separate 'right' edge from A too, so C computes the SAME position as
        // B — this is the *layout_overlap* half of a misplaced-door defect: two distinct rooms
        // resolve to identical coordinates because the graph gave two different rooms the same
        // "one step right of A" door.
        { id: 'e2', from: 'A', to: 'C', requirements: [], optional: false, bidirectional: true, transition: 'right' },
      ],
      regions: [{ id: 'r0', name: 'R0', biomeId: 'b0', roomIds: ['A', 'B', 'C'] }],
    };
    const design = validateWorldDesign({ worldGraph, progressionGraph: baseProgression('A', 'C', []), roomExtents: extentsFor(['A', 'B', 'C']) });
    expect(design.passed).toBe(false);
    expect(design.issues.map((i) => i.code)).toContain('layout_overlap');
  });

  it('fails with an unreachable teaching room (declared ability has no reachable room exercising it)', () => {
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: [
        { id: 'A', type: 'room', label: 'A', metadata: {} },
        { id: 'B', type: 'room', label: 'B', metadata: {} },
        // Orphaned: tagged as the teaching room for 'dash', but has no edge to or from anything —
        // the tag exists but nothing can ever reach it.
        { id: 'orphan', type: 'room', label: 'Orphan', metadata: { teachesAbility: 'dash' } },
      ],
      edges: [{ id: 'e1', from: 'A', to: 'B', requirements: [], optional: false, bidirectional: true }],
      regions: [{ id: 'r0', name: 'R0', biomeId: 'b0', roomIds: ['A', 'B', 'orphan'] }],
    };
    const design = validateWorldDesign({ worldGraph, progressionGraph: baseProgression('A', 'B', ['dash']), roomExtents: extentsFor(['A', 'B', 'orphan']) });
    expect(design.passed).toBe(false);
    expect(design.issues.map((i) => i.code)).toContain('unreachable_with_all_tokens');
  });

  it('fails when an optional upgrade is actually mandatory for victory', () => {
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: [
        { id: 'A', type: 'room', label: 'A', metadata: {} },
        // Tagged optional, but it is the ONLY source of 'dash' in this graph and the only route
        // to the boss requires dash — so it is not actually optional.
        { id: 'reward', type: 'room', label: 'Reward', metadata: { optionalReward: true, grantsAbilities: ['dash'] } },
        { id: 'boss', type: 'room', label: 'Boss', metadata: {} },
      ],
      edges: [
        { id: 'e1', from: 'A', to: 'reward', requirements: [], optional: false, bidirectional: true },
        { id: 'e2', from: 'A', to: 'boss', requirements: ['dash'], optional: false, bidirectional: true },
      ],
      regions: [{ id: 'r0', name: 'R0', biomeId: 'b0', roomIds: ['A', 'reward', 'boss'] }],
    };
    const design = validateWorldDesign({ worldGraph, progressionGraph: baseProgression('A', 'boss', ['dash']), roomExtents: extentsFor(['A', 'reward', 'boss']) });
    expect(design.passed).toBe(false);
    expect(design.issues.map((i) => i.code)).toContain('optional_became_mandatory');
  });

  it('fails when a physical gate requires an ability but base movement alone already clears it', () => {
    const worldGraph: WorldGraph = {
      version: '0.1.0',
      seed: 1,
      nodes: [
        { id: 'A', type: 'room', label: 'A', metadata: {} },
        { id: 'B', type: 'room', label: 'B', metadata: {} },
      ],
      edges: [{ id: 'e1', from: 'A', to: 'B', requirements: ['grapple'], optional: false, bidirectional: true, transition: 'up' }],
      regions: [{ id: 'r0', name: 'R0', biomeId: 'b0', roomIds: ['A', 'B'] }],
    };
    // A generous jump height that trivially clears the default up-transition gap — modeling "the
    // base movement can already cross this without the stated ability."
    const design = validateWorldDesign({
      worldGraph,
      progressionGraph: baseProgression('A', 'B', ['grapple']),
      roomExtents: extentsFor(['A', 'B']),
      movementStats: { walkSpeed: 200, runSpeed: 350, jumpHeight: 5000, gravity: 980, dashSpeed: 500, dashDuration: 0.15, airDashSpeed: 450, grappleSpeed: 620 },
    });
    expect(design.passed).toBe(false);
    expect(design.issues.map((i) => i.code)).toContain('gate_bypassable_by_base_movement');
  });
});

describe('generateWorldDesignReport', () => {
  it('is generated from the same canonical worldGraph/progressionGraph data, not a separate narrative', () => {
    const { worldGraph, progressionGraph, roomIds } = generateFullMetroidvaniaWorld({ ...FULL_WORLD_TEST_CONFIG, seed: 700001 });
    const design = validateWorldDesign({ worldGraph, progressionGraph, roomExtents: extentsFor(roomIds) });
    const report = generateWorldDesignReport({ title: 'Test Game', tone: 'grim', visualStyle: 'pixel art' }, worldGraph, progressionGraph, design);

    expect(report).toContain('=== GAME HOOK ===');
    expect(report).toContain('Title: Test Game');
    expect(report).toContain('=== PROGRESSION SEQUENCE ===');
    expect(report).toContain('=== ZONE BREAKDOWN ===');
    expect(report).toContain('=== WORLD LAYOUT GRAPH ===');
    // Every ability actually granted in the graph must appear in the printed sequence — the
    // report is not allowed to invent or omit an ability relative to the real graph.
    for (const node of worldGraph.nodes) {
      const grants = node.metadata?.grantsAbilities;
      if (Array.isArray(grants)) for (const g of grants) if (typeof g === 'string') expect(report).toContain(`Acquire '${g}'`);
    }
    // Every zone declared in worldGraph.regions must be named in the Zone Breakdown.
    for (const region of worldGraph.regions) expect(report).toContain(`Zone '${region.id}'`);
    expect(report).toContain(`Victory: reach ${progressionGraph.endNodeId} from ${progressionGraph.startNodeId}`);
  });
});

describe('ability lesson placement', () => {
  it.each(FULL_WORLD_TEST_SEEDS)('seed %i teaches movement at its pickup before the first gate', (seed) => {
    const { worldGraph, progressionGraph } = generateFullMetroidvaniaWorld({ ...FULL_WORLD_TEST_CONFIG, seed });
    for (const ability of progressionGraph.abilities) {
      const lesson = worldGraph.nodes.find((node) => node.metadata?.teachesAbility === ability);
      expect(lesson, `missing lesson for ${ability}`).toBeDefined();
      expect(lesson!.metadata.grantsAbilities).toContain(ability);
      expect(['boss', 'miniboss', 'arena']).not.toContain(lesson!.metadata.archetype);
    }
  });
});

describe('edited ability lesson validation', () => {
  it('rejects a reachable lesson moved away from its pickup', () => {
    const { worldGraph, progressionGraph, roomIds } = generateFullMetroidvaniaWorld({ ...FULL_WORLD_TEST_CONFIG, seed: 700001 });
    const ability = progressionGraph.abilities[0]!;
    const source = worldGraph.nodes.find((node) => node.metadata?.teachesAbility === ability)!;
    const target = worldGraph.nodes.find((node) => !node.metadata?.teachesAbility && node.metadata?.archetype === 'save')!;
    expect(target).toBeDefined();
    delete source.metadata.teachesAbility;
    target.metadata.teachesAbility = ability;
    const result = validateWorldDesign({ worldGraph, progressionGraph, roomExtents: extentsFor(roomIds) });
    expect(result.issues.map((issue) => issue.code)).toContain('misplaced_teaching_room');
  });
});
