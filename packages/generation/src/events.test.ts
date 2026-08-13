import { describe, it, expect } from 'vitest';
import { categorizeEvent, formatActivityMessage, withCategory } from './events.js';

describe('generation events', () => {
  it('categorizes asset events as ASSETS', () => {
    const event = withCategory({
      type: 'ArtifactGenerated',
      timestamp: new Date().toISOString(),
      artifactId: 'player',
      path: 'assets/characters/player.png',
      assetType: 'player',
      provider: 'procedural',
      fallbackGenerated: true,
    });
    expect(event.category).toBe('ASSETS');
  });

  it('formats activity feed messages with timestamps', () => {
    const msg = formatActivityMessage({
      type: 'WorldGraphUpdated',
      timestamp: '2026-08-12T12:03:21.000Z',
      roomCount: 94,
      edgeCount: 120,
      biomeCount: 3,
    });
    expect(msg).toContain('World graph: 94 rooms');
  });

  it('marks failures as ERROR category', () => {
    expect(
      categorizeEvent({
        type: 'GenerationFailed',
        timestamp: new Date().toISOString(),
        reason: 'boom',
      }),
    ).toBe('ERROR');
  });
});
