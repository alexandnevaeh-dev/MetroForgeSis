import { describe, expect, it } from 'vitest';
import {
  ENVIRONMENT_ARCHETYPES,
  assignEnvironmentArchetype,
  majorRoomTileSize,
  roomPurposeFromGameplay,
  scoreSideViewRoom,
  scoreTopDownRoom,
  sideViewGalleryPlan,
} from '../src/environment-archetypes.js';

describe('environment archetypes', () => {
  it('assigns distinct castle identities across a biome family', () => {
    const ids = new Set(
      Array.from({ length: 12 }, (_, i) =>
        assignEnvironmentArchetype({
          roomIndex: i,
          roomCount: 12,
          gameplayArchetype: i === 11 ? 'boss' : 'traversal',
          biomeId: 'glass_citadel',
          biomeDisplayName: 'Glass Citadel',
          seed: 42,
        }),
      ),
    );
    expect(ids.has('castle_hall')).toBe(true);
    expect(ids.size).toBeGreaterThan(1);
  });

  it('sizes major rooms larger than a single screen for halls and libraries', () => {
    const hall = majorRoomTileSize('castle_hall', 32, 18);
    const library = majorRoomTileSize('library', 32, 18);
    expect(hall.width).toBeGreaterThanOrEqual(ENVIRONMENT_ARCHETYPES.castle_hall.minTileSize.width);
    expect(hall.screenSpanH).toBeGreaterThanOrEqual(2);
    expect(library.screenSpanV).toBeGreaterThanOrEqual(2);
    expect(roomPurposeFromGameplay('boss')).toBe('boss');
    expect(roomPurposeFromGameplay('secret')).toBe('secret');
  });

  it('scores top-down rooms for navigation and identity', () => {
    const poor = scoreTopDownRoom({
      environmentArchetype: 'generic_chamber',
      roomPurpose: 'combat',
      widthTiles: 8,
      heightTiles: 8,
      walkableRatio: 0.95,
      hasNorthLandmark: false,
      aisleCount: 0,
      biomeMaterialMatch: false,
      criticalPathClear: false,
      combatOpenSpace: false,
    });
    const rich = scoreTopDownRoom({
      environmentArchetype: 'library',
      roomPurpose: 'puzzle',
      widthTiles: 20,
      heightTiles: 16,
      walkableRatio: 0.55,
      hasNorthLandmark: true,
      aisleCount: 3,
      biomeMaterialMatch: true,
      criticalPathClear: true,
      combatOpenSpace: true,
    });
    expect(rich.total).toBeGreaterThan(poor.total);
  });

  it('scores side-view rooms for galleries and silhouette variety', () => {
    const poor = scoreSideViewRoom({
      environmentArchetype: 'generic_chamber',
      roomPurpose: 'combat',
      widthTiles: 20,
      heightTiles: 12,
      platformCount: 0,
      uniquePlatformHeights: 0,
      galleryBandsAchieved: 0,
      hasLandmark: false,
      decorationDensity: 0,
      traversableAreaRatio: 0.95,
      biomeMaterialMatch: false,
      combatBowlOpen: false,
    });
    const rich = scoreSideViewRoom({
      environmentArchetype: 'library',
      roomPurpose: 'exploration',
      widthTiles: 64,
      heightTiles: 48,
      platformCount: 5,
      uniquePlatformHeights: 3,
      galleryBandsAchieved: 2,
      hasLandmark: true,
      decorationDensity: 0.025,
      traversableAreaRatio: 0.55,
      biomeMaterialMatch: true,
      combatBowlOpen: true,
    });
    expect(rich.total).toBeGreaterThan(poor.total);
    expect(rich.galleryStructure).toBeGreaterThanOrEqual(80);
    expect(poor.total).toBeLessThan(55);
  });

  it('exposes SIDE_VIEW gallery plans for foundry-family archetypes', () => {
    expect(sideViewGalleryPlan('laboratory').balconyRows).toBeGreaterThanOrEqual(2);
    expect(sideViewGalleryPlan('armory').platformBands).toBeGreaterThanOrEqual(2);
    expect(sideViewGalleryPlan('castle_hall').balconyRows).toBeGreaterThanOrEqual(1);
  });
});
