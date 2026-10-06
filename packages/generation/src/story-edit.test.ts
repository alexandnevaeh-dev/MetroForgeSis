import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { updateDialogue, updateNarrative, updateQuest } from './story-edit.js';

describe('story-edit', () => {
  it('writes a quest without replacing unrelated quests', () => {
    const dir = join(tmpdir(), `metroforge-story-${Date.now()}`);
    mkdirSync(join(dir, 'data', 'quests'), { recursive: true });
    writeFileSync(
      join(dir, 'data', 'quests', 'quests.json'),
      JSON.stringify({
        quests: [
          {
            id: 'quest_keep',
            name: 'Keep',
            description: 'Stay',
            prerequisites: [],
            objectives: [{ id: 'obj_keep', type: 'Reach', target: 'room_000', count: 1, description: 'Go' }],
            rewards: [],
          },
        ],
      }),
    );
    const result = updateQuest(dir, {
      id: 'quest_new',
      name: 'New',
      description: 'Added',
      prerequisites: [],
      objectives: [{ id: 'obj_new', type: 'Talk', target: 'npc_000', count: 1, description: 'Speak' }],
      rewards: [],
    });
    expect(result.success).toBe(true);
    expect(result.quests.map((q) => q.id)).toEqual(['quest_keep', 'quest_new']);
    rmSync(dir, { recursive: true, force: true });
  });

  it('updates a dialogue in place', () => {
    const dir = join(tmpdir(), `metroforge-dialogue-${Date.now()}`);
    mkdirSync(join(dir, 'data', 'dialogues'), { recursive: true });
    writeFileSync(
      join(dir, 'data', 'dialogues', 'dialogues.json'),
      JSON.stringify({
        dialogues: [{ id: 'dlg_000', lines: [{ text: 'Hello' }] }],
      }),
    );
    const result = updateDialogue(dir, {
      id: 'dlg_000',
      lines: [{ speaker: 'Courier', text: 'Changed' }],
    });
    expect(result.success).toBe(true);
    expect(result.dialogues[0]?.lines[0]?.text).toBe('Changed');
    rmSync(dir, { recursive: true, force: true });
  });

  it('patches narrative fields without dropping the rest', () => {
    const dir = join(tmpdir(), `metroforge-narrative-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'game_dna.json'),
      JSON.stringify({
        narrative: {
          premise: 'Old premise',
          protagonist: 'Hero',
          antagonist: 'Core',
          centralConflict: 'Heat',
        },
      }),
    );
    const result = updateNarrative(dir, { premise: 'New premise' });
    expect(result.success).toBe(true);
    expect(result.narrative.premise).toBe('New premise');
    expect(result.narrative.protagonist).toBe('Hero');
    expect(result.narrative.antagonist).toBe('Core');
    rmSync(dir, { recursive: true, force: true });
  });
});
