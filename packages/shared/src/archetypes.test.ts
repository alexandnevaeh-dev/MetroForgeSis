import { describe, it, expect } from 'vitest';
import {
  GAME_ARCHETYPE_PLUGINS,
  GENRE_DEFINITIONS,
  genreCapability,
  genreSupports,
  getGenreDefinition,
  inferGameArchetypeFromPrompt,
  isTopDownArchetype,
  pickTopDownDungeonItems,
  resolveGameArchetype,
} from '../src/archetypes.js';

describe('GameArchetype registry', () => {
  it('keeps Metroidvania as the default plugin', () => {
    expect(resolveGameArchetype(undefined)).toBe('SIDE_VIEW_METROIDVANIA');
    expect(GAME_ARCHETYPE_PLUGINS.SIDE_VIEW_METROIDVANIA.runtimeTemplate).toBe(
      'templates/godot-metroidvania',
    );
    expect(isTopDownArchetype('SIDE_VIEW_METROIDVANIA')).toBe(false);
  });

  it('maps top-down prompts and dungeon items without Zelda names', () => {
    expect(inferGameArchetypeFromPrompt('Create a top-down action adventure about a relic hunter')).toBe(
      'TOP_DOWN_ACTION_ADVENTURE',
    );
    expect(GAME_ARCHETYPE_PLUGINS.TOP_DOWN_ACTION_ADVENTURE.runtimeTemplate).toBe(
      'templates/godot-topdown-adventure',
    );
    const items = pickTopDownDungeonItems('TINY_TEST');
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('wind_disc');
    expect(JSON.stringify(items).toLowerCase()).not.toMatch(/zelda|hyrule|triforce|master sword|ganon|link/);
  });
});

describe('GenreDefinition capabilities', () => {
  it('exposes orthogonal perspective vs progression for both families', () => {
    const side = getGenreDefinition('SIDE_VIEW_METROIDVANIA');
    const top = getGenreDefinition('TOP_DOWN_ACTION_ADVENTURE');
    expect(side.perspective).toBe('SIDE_VIEW');
    expect(side.defaultProgression).toBe('ABILITY_GATED');
    expect(top.perspective).toBe('TOP_DOWN');
    expect(top.defaultProgression).toBe('ITEM_GATED');
    expect(Object.keys(GENRE_DEFINITIONS)).toEqual([
      'QUANTUM_SIMULATION_ROGUELITE',
      'SIDE_VIEW_METROIDVANIA',
      'TOP_DOWN_ACTION_ADVENTURE',
    ]);
  });

  it('answers capability queries instead of string equality for art/locomotion forks', () => {
    expect(genreSupports('SIDE_VIEW_METROIDVANIA', 'supportsParallaxBackgrounds')).toBe(true);
    expect(genreSupports('SIDE_VIEW_METROIDVANIA', 'supportsJumping')).toBe(true);
    expect(genreSupports('SIDE_VIEW_METROIDVANIA', 'supportsDirectionalSpriteSheets')).toBe(false);
    expect(genreSupports('TOP_DOWN_ACTION_ADVENTURE', 'supportsParallaxBackgrounds')).toBe(false);
    expect(genreSupports('TOP_DOWN_ACTION_ADVENTURE', 'supportsJumping')).toBe(false);
    expect(genreSupports('TOP_DOWN_ACTION_ADVENTURE', 'supportsDirectionalSpriteSheets')).toBe(true);
    expect(genreSupports('TOP_DOWN_ACTION_ADVENTURE', 'supportsSideViewQualityPass')).toBe(false);
    expect(genreCapability('TOP_DOWN_ACTION_ADVENTURE', 'qualityPassProfile')).toBe(
      'top_down_action_adventure',
    );
    expect(genreCapability('TOP_DOWN_ACTION_ADVENTURE', 'artProjection')).toBe('top-down');
    expect(genreCapability('SIDE_VIEW_METROIDVANIA', 'abilityNamespace')).toBe('movement_abilities');
  });

  it('records honest navigation models (no aspirational navigation_agent for top-down)', () => {
    expect(getGenreDefinition('TOP_DOWN_ACTION_ADVENTURE').runtime.navigationModel).toBe(
      'WALKABILITY_GRID',
    );
    expect(GAME_ARCHETYPE_PLUGINS.TOP_DOWN_ACTION_ADVENTURE.navigationModel).toBe('walkability_grid');
  });

  it('keeps Quantum material navigation and simulation separate from both room runtimes', () => {
    const quantum = getGenreDefinition('QUANTUM_SIMULATION_ROGUELITE');
    expect(quantum.runtime.worldGenerator).toBe('chunked_material_world');
    expect(quantum.runtime.playerController).toBe('quantum_diver');
    expect(quantum.runtime.navigationModel).toBe('MATERIAL_CONTACT');
    expect(quantum.capabilities.abilityNamespace).toBe('quantum_instruments');
    expect(quantum.capabilities.supportsSideViewQualityPass).toBe(false);
    expect(quantum.capabilities.supportsPerRoomScenes).toBe(false);
    expect(inferGameArchetypeFromPrompt('Quantum Divergence simulation roguelite')).toBe(quantum.id);
  });
});
