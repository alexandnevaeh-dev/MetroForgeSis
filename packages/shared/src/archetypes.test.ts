import { describe, it, expect } from 'vitest';
import {
  GAME_ARCHETYPE_PLUGINS,
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
