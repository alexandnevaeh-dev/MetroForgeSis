import { describe, expect, it } from 'vitest';
import { buildManualImagePrompt, buildDirectedManualImagePrompt, manualAssetStyleHint } from './asset-pipeline.js';

describe('manual image camera and style', () => {
  it('uses the explicit brief without adding scene instructions or a title', () => {
    const subject = 'Ash librarian, charcoal robe, brass book, turquoise eyes';
    const brief = 'HD pixel art, warm upper-left light';
    const prompt = buildDirectedManualImagePrompt(subject, brief, 'SIDE_VIEW_METROIDVANIA', 'enemy');
    expect(prompt).toContain(subject);
    expect(prompt).toContain(brief);
    expect(prompt).toContain('Side-view');
    expect(prompt).toContain('feet grounded');
    expect(prompt).not.toContain('Top-down');
    expect(prompt).not.toContain('traversal');
  });
  it('preserves long authored descriptions for real tokenizer rejection instead of clipping them', () => {
    const subject = 'ranger with amber pendant '.repeat(100);
    expect(buildDirectedManualImagePrompt(subject, 'Painted art', 'TOP_DOWN_ACTION_ADVENTURE', 'npc')).toContain(subject.trim());
    const top = buildDirectedManualImagePrompt('Ranger', 'Painted art', 'TOP_DOWN_ACTION_ADVENTURE', 'npc');
    expect(top).toContain('overhead three-quarter');
    expect(top).not.toContain('Side-view');
  });
  it('preserves player identity only for player artwork', () => {
    expect(manualAssetStyleHint('HD pixel art', 'Blue knight with silver helmet', 'player_sprite'))
      .toBe('HD pixel art. Blue knight with silver helmet');
  });
  it('does not impose the player outfit on enemies, bosses, NPCs or independent concepts', () => {
    for (const type of ['enemy', 'boss', 'npc', 'character_concept', 'prop']) {
      const hint = manualAssetStyleHint('HD pixel art', 'Blue knight with silver helmet', type);
      const prompt = buildManualImagePrompt('Ash librarian with brass book', hint, 'Castle', 'SIDE_VIEW_METROIDVANIA', type);
      expect(prompt).toContain('HD pixel art');
      expect(prompt).toContain('Ash librarian with brass book');
      expect(prompt).not.toContain('Blue knight');
      expect(prompt).not.toContain('silver helmet');
    }
  });
  it('keeps top-down and side-view character directions separate', () => {
    const top = buildManualImagePrompt('Forest ranger', 'Rich HD pixel art', 'Woodland', 'TOP_DOWN_ACTION_ADVENTURE');
    const side = buildManualImagePrompt('Castle knight', 'Detailed painted art', 'Castle', 'SIDE_VIEW_METROIDVANIA');
    expect(top).toContain('overhead three-quarter'); expect(top).not.toContain('Side-view');
    expect(side).toContain('Side-view'); expect(side).not.toContain('Top-down');
    expect(side).toContain('feet aligned to the ground'); expect(side).not.toContain('Pixel art');
  });
  it('asks for an environment rather than a character contact sheet for backgrounds', () => {
    const prompt = buildManualImagePrompt('Castle interior', 'Detailed stonework', 'Castle', 'SIDE_VIEW_METROIDVANIA', 'background');
    expect(prompt).toContain('biome architecture'); expect(prompt).not.toContain('full-body character');
  });
});
