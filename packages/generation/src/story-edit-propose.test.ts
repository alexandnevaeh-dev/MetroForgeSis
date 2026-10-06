import { describe, expect, it } from 'vitest';
import {
  buildStoryRewritePrompt,
  fallbackStoryProposal,
  type StoryContent,
} from './story-edit.js';

const sample: StoryContent = {
  narrative: {
    premise: 'Heat walks the corridors.',
    protagonist: 'Courier',
    antagonist: 'Core',
    centralConflict: 'Debt',
  },
  quests: [
    {
      id: 'quest_a',
      name: 'Spark',
      description: 'Find the spark',
      prerequisites: [],
      objectives: [{ id: 'o1', type: 'Reach', target: 'room_001', count: 1, description: 'Go' }],
      rewards: [],
      dialogueStartId: 'dlg_a',
    },
  ],
  dialogues: [{ id: 'dlg_a', lines: [{ text: 'Hello' }] }],
  npcs: [{ id: 'npc_000', name: 'Mason', dialogueId: 'dlg_a', roomId: 'room_000' }],
  rooms: [{ id: 'room_000', npcs: ['npc_000'] }],
};

describe('story rewrite proposals', () => {
  it('builds a scoped prompt that names the target element', () => {
    const built = buildStoryRewritePrompt(sample, {
      kind: 'quest',
      id: 'quest_a',
      draft: 'Find the spark',
    });
    expect(built.scope).toEqual({ kind: 'quest', id: 'quest_a' });
    expect(built.prompt).toContain('quest quest_a description');
    expect(built.prompt).toContain('Find the spark');
    expect(built.systemPrompt).toContain('ONLY the requested story element');
  });

  it('fallback proposals stay scoped and are not the old suffix stub alone', () => {
    const narrative = fallbackStoryProposal({ kind: 'narrative', draft: 'Old premise' });
    expect(narrative.startsWith('Old premise')).toBe(true);
    expect(narrative.length).toBeGreaterThan('Old premise'.length);
    const dialogue = fallbackStoryProposal({ kind: 'dialogue', draft: 'Line one\nLine two' });
    expect(dialogue).toContain('Line one');
  });
});
