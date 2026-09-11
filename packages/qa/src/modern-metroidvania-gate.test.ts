import { describe, expect, it } from 'vitest';
import {
  evaluateModernMetroidvaniaGate,
  MODERN_METROIDVANIA_GATE,
  modernGateToQAGateResult,
  type ModernGateInputs,
} from './modern-metroidvania-gate.js';

/** A fixture that clears every dimension threshold (art-directed, coherent project). */
function productionQualityInputs(): ModernGateInputs {
  const art = (id: string, path: string): Record<string, unknown> => ({
    id,
    path,
    type: 'texture',
    provider: 'nvidia-image',
    fallbackGenerated: false,
    fakeAnimation: false,
    critiquePassed: true,
    critiqueScore: 88,
    maturity: 'QA_REVIEW',
    sourceType: 'ai_generated',
    promptHash: `hash_${id}`,
    seed: 42,
  });
  const rooms = Array.from({ length: 6 }, (_, i) => ({
    id: `room_${i}`,
    layoutMetrics: {
      silhouetteHash: `unique-silhouette-${i}`,
      platformCount: 4,
      pitCount: 2,
      elevationChanges: 3,
      uniquePlatformHeights: 3,
      traversableAreaRatio: 0.6,
      verticality: 0.4,
      hazardDensity: 0.1,
      decorationDensity: 0.08,
      combatSpacePx: 40000,
      silhouetteFilled: 200,
    },
  }));
  const layers = [
    { id: 'far', motionScale: [0.1, 0.04] as [number, number], assetPath: 'assets/backgrounds/biome_0/far.png' },
    { id: 'mid', motionScale: [0.4, 0.12] as [number, number], assetPath: 'assets/backgrounds/biome_0/mid.png' },
    { id: 'near', motionScale: [0.75, 0.2] as [number, number], assetPath: 'assets/backgrounds/biome_0/near.png' },
    { id: 'fg', motionScale: [1.1, 0.4] as [number, number], assetPath: 'assets/backgrounds/biome_0/fg.png' },
  ];
  return {
    archetype: 'SIDE_VIEW_METROIDVANIA',
    hasCharacterVisualDna: true,
    artifacts: [
      art('player', 'assets/characters/player.png'),
      art('enemy_walk', 'assets/enemies/enemy_0/walk_sheet.png'),
      art('enemy_attack', 'assets/enemies/enemy_0/attack_sheet.png'),
      art('boss_walk', 'assets/bosses/boss_0/walk_sheet.png'),
      art('tileset', 'assets/tilesets/biome_0/atlas.png'),
      art('far_bg', 'assets/backgrounds/biome_0/far.png'),
      art('mid_bg', 'assets/backgrounds/biome_0/mid.png'),
      art('near_bg', 'assets/backgrounds/biome_0/near.png'),
      art('fg_bg', 'assets/backgrounds/biome_0/fg.png'),
    ],
    rooms,
    composition: Object.fromEntries(rooms.map((r) => [r.id, { layers, foregroundCoverage: 0.3 }])),
    terrainSets: [{ tileSize: 16, roles: [{ role: 'ground' }, { role: 'wall' }], missingRoles: [], seamIssues: [], passed: true }],
    screenshots: [
      { name: 'screenshot_spawn.png', score: 82, passed: true, blank: false, uniqueColors: 40, occupancy: 0.5, lumaStdDev: 30 },
      { name: 'screenshot_combat.png', score: 78, passed: true, blank: false, uniqueColors: 33, occupancy: 0.45, lumaStdDev: 26 },
    ],
  };
}

/** The procedural-placeholder reality when no image provider is available. */
function placeholderInputs(): ModernGateInputs {
  const placeholder = (id: string, path: string): Record<string, unknown> => ({
    id,
    path,
    type: 'texture',
    provider: 'procedural',
    fallbackGenerated: true,
    critiquePassed: true,
    critiqueScore: 70,
    maturity: 'PLACEHOLDER',
    sourceType: 'procedural',
  });
  const rooms = Array.from({ length: 6 }, () => ({
    layoutMetrics: {
      silhouetteHash: 'same-hash',
      platformCount: 0,
      pitCount: 0,
      elevationChanges: 0,
      uniquePlatformHeights: 1,
      traversableAreaRatio: 0.95,
      verticality: 0,
      hazardDensity: 0,
      decorationDensity: 0,
      combatSpacePx: 5000,
      silhouetteFilled: 400,
    },
  }));
  return {
    archetype: 'SIDE_VIEW_METROIDVANIA',
    hasCharacterVisualDna: false,
    artifacts: [
      placeholder('player', 'assets/characters/player.png'),
      placeholder('enemy_walk', 'assets/enemies/enemy_0/walk_sheet.png'),
      placeholder('tileset', 'assets/tilesets/biome_0/atlas.png'),
      placeholder('far_bg', 'assets/backgrounds/biome_0/far.png'),
    ],
    rooms,
    composition: Object.fromEntries(
      rooms.map((_, i) => [`room_${i}`, { layers: [{ id: 'far', motionScale: [0.1, 0.04] as [number, number], assetPath: 'assets/backgrounds/biome_0/far.png' }] }]),
    ),
    terrainSets: [{ tileSize: 16, roles: [{ role: 'ground' }], missingRoles: [], seamIssues: [], passed: true }],
    screenshots: [{ name: 'screenshot_gameplay.png', score: 55, passed: false, blank: false, uniqueColors: 4, occupancy: 0.1, lumaStdDev: 6 }],
  };
}

describe('MODERN_METROIDVANIA_GATE', () => {
  it('passes a coherent, art-directed project across all dimensions', () => {
    const result = evaluateModernMetroidvaniaGate(productionQualityInputs());
    expect(result.passed).toBe(true);
    expect(result.state).toBe('PASS');
    expect(result.summary).toContain('Export allowed.');
    // Every applicable dimension must actually pass.
    for (const d of result.dimensions.filter((x) => x.applicable)) {
      expect(d.passed, `${d.dimension} scored ${d.score}`).toBe(true);
    }
  });

  it('fails a procedural-placeholder project and blocks export with explicit reasons', () => {
    const result = evaluateModernMetroidvaniaGate(placeholderInputs());
    expect(result.passed).toBe(false);
    expect(result.state).toBe('FAIL');
    expect(result.summary).toContain('Export blocked.');
    const failing = result.dimensions.filter((d) => d.applicable && !d.passed);
    expect(failing.length).toBeGreaterThan(0);
    // Every failing dimension carries at least one explicit reason (no silent failures).
    for (const d of failing) {
      expect(d.reasons.length, `${d.dimension} has no reason`).toBeGreaterThan(0);
    }
    const assetProd = result.dimensions.find((d) => d.dimension === 'AssetProduction');
    expect(assetProd?.reasons.join(' ')).toMatch(/procedural placeholders/i);
    const identity = result.dimensions.find((d) => d.dimension === 'PlayerIdentity');
    expect(identity?.reasons.join(' ')).toMatch(/identity|costume|silhouette/i);
  });

  it('marks side-view-only dimensions N/A for top-down projects instead of failing them', () => {
    const inputs: ModernGateInputs = {
      archetype: 'TOP_DOWN_ACTION_ADVENTURE',
      artifacts: [
        {
          id: 'player',
          path: 'assets/characters/player.png',
          provider: 'procedural',
          fallbackGenerated: true,
          maturity: 'PLACEHOLDER',
          sourceType: 'procedural',
        },
      ],
      rooms: [{ id: 'r0' }], // no layoutMetrics (top-down overworld model)
      composition: {},
      terrainSets: [{ tileSize: 16, roles: [{ role: 'ground' }], missingRoles: [], seamIssues: [] }],
      screenshots: [],
    };
    const result = evaluateModernMetroidvaniaGate(inputs);
    const parallax = result.dimensions.find((d) => d.dimension === 'ParallaxDepth');
    const composition = result.dimensions.find((d) => d.dimension === 'RoomComposition');
    expect(parallax?.applicable).toBe(false);
    expect(composition?.applicable).toBe(false);
    // N/A dimensions do not block the verdict and are labeled N/A in the summary.
    expect(result.summary).toMatch(/ParallaxDepth: \d+ N\/A/);
    // The gate still fails on the applicable placeholder dimensions.
    expect(result.passed).toBe(false);
  });

  it('adapts to a QAGateResult shape for the pipeline report', () => {
    const result = evaluateModernMetroidvaniaGate(placeholderInputs());
    const gate = modernGateToQAGateResult(result);
    expect(gate.gate).toBe(MODERN_METROIDVANIA_GATE);
    expect(gate.passed).toBe(false);
    expect(gate.state).toBe('FAIL');
    expect(gate.details.dimensions).toBeDefined();
    expect(typeof gate.details.summary).toBe('string');
  });

  it('reports every applicable failing dimension with a non-empty reason (safeguard)', () => {
    // Minimal inputs → many dimensions fail; none may fail silently.
    const result = evaluateModernMetroidvaniaGate({ archetype: 'SIDE_VIEW_METROIDVANIA' });
    for (const d of result.dimensions.filter((x) => x.applicable && !x.passed)) {
      expect(d.reasons.length, `${d.dimension}`).toBeGreaterThan(0);
    }
  });
});
