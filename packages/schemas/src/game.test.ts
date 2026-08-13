import { describe, it, expect } from 'vitest';
import { ProgressionGraphSchema, WorldGraphSchema, RoomSchema, AbilitySchema, DialogueSchema } from '../src/game.js';

describe('game schemas', () => {
  it('validates room', () => {
    const room = {
      id: 'room_000',
      name: 'Start',
      biomeId: 'biome_0',
      archetype: 'connector' as const,
      width: 800,
      height: 600,
    };
    expect(RoomSchema.parse(room)).toMatchObject(room);
  });

  it('validates ability', () => {
    const ability = {
      id: 'dash',
      displayName: 'Dash',
      description: 'Quick burst',
      category: 'movement' as const,
      input: 'dash',
      cooldown: 0.5,
    };
    expect(AbilitySchema.parse(ability)).toEqual({ ...ability, resourceCost: 0, tags: [], enabled: true });
  });

  it('validates world graph', () => {
    const graph = {
      version: '0.1.0',
      seed: 1,
      nodes: [{ id: 'room_000', type: 'room' as const, label: 'Start', metadata: {} }],
      edges: [],
      regions: [],
    };
    expect(WorldGraphSchema.parse(graph)).toEqual(graph);
  });

  it('validates progression graph', () => {
    const graph = {
      version: '0.1.0',
      seed: 1,
      startNodeId: 'room_000',
      endNodeId: 'room_007',
      nodes: [
        { id: 'room_000', type: 'room' as const, label: 'Start', required: true },
        { id: 'room_007', type: 'boss' as const, label: 'Boss', required: true },
      ],
      edges: [{ from: 'room_000', to: 'room_007', requires: [] }],
      abilities: ['dash'],
      criticalPath: ['room_000', 'room_007'],
    };
    expect(ProgressionGraphSchema.parse(graph)).toEqual(graph);
  });

  it('validates branching dialogue with choices and portraits', () => {
    const dialogue = DialogueSchema.parse({
      id: 'dlg_test',
      lines: [
        { speaker: 'Guide', portrait: 'lore', text: 'Hello.' },
        {
          text: 'What next?',
          choices: [
            { text: 'Continue', nextDialogueId: 'dlg_next' },
            { text: 'Accept quest', end: true, action: 'accept_quest' },
          ],
        },
      ],
    });
    expect(dialogue.lines[1]?.choices).toHaveLength(2);
  });
});
