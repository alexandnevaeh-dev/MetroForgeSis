import { describe, expect, it } from 'vitest';
import { buildManualImagePrompt } from './asset-pipeline.js';

describe('manual image camera and style', () => {
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
