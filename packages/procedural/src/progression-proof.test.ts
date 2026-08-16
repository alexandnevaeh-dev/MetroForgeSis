import { describe, it, expect } from 'vitest';
import { generateWorldTopology } from '../src/world.js';
import { buildProgressionProof } from '../src/progression-proof.js';
import { PROFILE_DEFAULTS, pickRegisteredAbilities } from '@metroforge/shared';

describe('progression proof', () => {
  it('proves start, ability pickup, critical path, and boss for TINY_TEST', () => {
    const { worldGraph, progressionGraph, roomIds } = generateWorldTopology({
      seed: 42,
      roomCount: 8,
      biomeCount: 1,
      abilities: ['dash'],
      bossCount: 1,
      profile: 'TINY_TEST',
    });
    const proof = buildProgressionProof(worldGraph, progressionGraph);
    expect(proof.startReachable).toBe(true);
    expect(proof.bossReachable).toBe(true);
    expect(proof.criticalPathReachable).toBe(true);
    expect(proof.victoryAchievable).toBe(true);
    expect(proof.noHardCycle).toBe(true);
    expect(proof.selfLocks).toHaveLength(0);
    expect(proof.unknownAbilities).toHaveLength(0);
    expect(proof.abilitiesAcquirable.every((a) => a.acquirable)).toBe(true);
    expect(proof.trace.some((s) => s.kind === 'visit' && s.roomId === roomIds[0])).toBe(true);
    expect(proof.trace.some((s) => s.kind === 'acquire' && s.abilityId === 'dash')).toBe(true);
    expect(proof.passed).toBe(true);
  });

  it('RELEASE_CANDIDATE scale world is solvable with registered abilities', () => {
    const defaults = PROFILE_DEFAULTS.RELEASE_CANDIDATE;
    const abilities = pickRegisteredAbilities('RELEASE_CANDIDATE').map((a) => a.id);
    const { worldGraph, progressionGraph } = generateWorldTopology({
      seed: 184729,
      roomCount: defaults.roomsMin,
      biomeCount: defaults.biomes,
      abilities,
      bossCount: defaults.bosses,
      profile: 'RELEASE_CANDIDATE',
    });
    expect(worldGraph.regions).toHaveLength(defaults.biomes);
    expect(worldGraph.nodes.filter((n) => n.type === 'room').length).toBeGreaterThanOrEqual(35);
    expect(worldGraph.nodes.filter((n) => n.type === 'room').length).toBeLessThanOrEqual(60);
    const proof = buildProgressionProof(worldGraph, progressionGraph);
    expect(proof.unknownAbilities).toHaveLength(0);
    expect(proof.startReachable).toBe(true);
    expect(proof.bossReachable).toBe(true);
    expect(proof.passed).toBe(true);
  });

  it('detects a self-lock when a pickup sits behind its own gate', () => {
    const { worldGraph, progressionGraph } = generateWorldTopology({
      seed: 1,
      roomCount: 6,
      biomeCount: 1,
      abilities: ['dash'],
      bossCount: 1,
    });
    const pickup = worldGraph.nodes.find((n) => (n.metadata?.grantsAbilities as string[] | undefined)?.includes('dash'));
    expect(pickup).toBeTruthy();
    for (const edge of worldGraph.edges) {
      if (edge.to === pickup!.id || (edge.bidirectional && edge.from === pickup!.id)) {
        edge.requirements = ['dash'];
      }
    }
    const proof = buildProgressionProof(worldGraph, progressionGraph);
    expect(proof.selfLocks.some((lock) => lock.abilityId === 'dash')).toBe(true);
    expect(proof.noHardCycle).toBe(false);
    expect(proof.passed).toBe(false);
  });
});
