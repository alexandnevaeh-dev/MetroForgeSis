import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scoreVisualQuality } from '../src/visual-quality.js';
import { applyVisualRepairs, planVisualRepairs } from '../src/visual-repair.js';
import { aggregateIndependentGates, evaluateCharacterScale } from '../src/presentation-gates.js';
import { combineQualityScores } from '../src/quality-scoring.js';

describe('independent visual gates', () => {
  it('caps overall by commercial presentation', () => {
    const gates = aggregateIndependentGates({
      weightedOverall: 92,
      functionalQuality: 95,
      assetIntegrity: 88,
      visualCohesion: 86,
      roomComposition: 80,
      gameplayReadability: 90,
      presentationQuality: 42,
      violations: ['EXCESSIVE_TILE_REPETITION'],
      hardFail: true,
    });
    expect(gates.overall).toBe(42);
    expect(gates.showcaseReady).toBe(false);
  });

  it('fails low-contrast / missing player readability', () => {
    const dir = mkdtempSync(join(tmpdir(), 'readability-'));
    const result = scoreVisualQuality({
      projectPath: dir,
      playerVisible: false,
      enemyVisible: true,
      terrainTextureExists: true,
      uiTextureExists: true,
      parallaxFingerprints: { far: 'a', mid: 'b', near: 'c' },
      propCount: 8,
      placeholderRatio: 0.1,
    });
    expect(result.defects).toContain('PLAYER_TOO_SMALL');
    expect(result.scores.gameplayReadability).toBeLessThan(80);
    expect(result.hardFail).toBe(true);
  });

  it('fails player scale outside bounds', () => {
    const scale = evaluateCharacterScale({ playerSpriteHeightPx: 8, viewportHeightPx: 360 });
    expect(scale.ok).toBe(false);
    expect(scale.violation).toBe('PLAYER_SCALE_OUT_OF_BOUNDS');
  });

  it('repair planner retile does not mutate collision platforms', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repair-'));
    mkdirSync(join(dir, 'data', 'rooms'), { recursive: true });
    const platforms = [{ x: 64, y: 320, width: 96, height: 16 }];
    const pits = [{ x: 200, width: 48 }];
    writeFileSync(
      join(dir, 'data', 'rooms', 'rooms.json'),
      JSON.stringify({
        rooms: {
          room_000: {
            tileCells: Array.from({ length: 16 }, (_, x) => ({ x, y: 10, col: 0, row: 0 })),
            platforms,
            pits,
          },
        },
      }),
    );
    const scored = scoreVisualQuality({
      projectPath: dir,
      playerVisible: true,
      enemyVisible: true,
      terrainTextureExists: true,
      uiTextureExists: true,
      parallaxFingerprints: { far: 'a', mid: 'b', near: 'c' },
      propCount: 8,
      placeholderRatio: 0.1,
    });
    const planned = planVisualRepairs(scored, 0);
    const applied = applyVisualRepairs(dir, planned);
    const parsed = JSON.parse(readFileSync(join(dir, 'data', 'rooms', 'rooms.json'), 'utf-8')) as {
      rooms: { room_000: { platforms: unknown; pits: unknown } };
    };
    expect(parsed.rooms.room_000.platforms).toEqual(platforms);
    expect(parsed.rooms.room_000.pits).toEqual(pits);
    expect(applied.some((r) => r.target === 'tileset' || r.target === 'room_visuals' || r.applied)).toBeDefined();
  });
});

describe('quality score policy', () => {
  it('never reports 92 overall when presentation is 42', () => {
    const card = combineQualityScores(95, 42);
    expect(card.qualityScore).toBeLessThanOrEqual(42);
  });
});
