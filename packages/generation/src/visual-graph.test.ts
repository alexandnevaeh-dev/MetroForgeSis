import { describe, expect, it } from 'vitest';
import { descendantsOf, markDescendantsDirty } from '../src/artifact-lineage.js';
import { visualExecutionGraph } from '../src/visual-graph.js';

describe('visual execution dependency graph', () => {
  it('invalidates tileset descendants when biome visual DNA changes', () => {
    const edges = visualExecutionGraph(['biome_0']);
    const dirty = markDescendantsDirty(edges, 'biome_0_visual_dna');
    expect(dirty.dirtyIds).toContain('biome_0_tileset');
    expect(dirty.dirtyIds).toContain('biome_0_props');
    expect(dirty.dirtyIds).toContain('rooms');
    expect(dirty.dirtyIds).toContain('qa_screenshots');
  });

  it('invalidates poses and portraits when player identity changes', () => {
    const edges = visualExecutionGraph();
    const { ids } = descendantsOf(edges, 'player');
    expect(ids.some((id) => id.includes('idle') || id.includes('pose') || id.includes('walk'))).toBe(true);
    expect(ids).toContain('player_portrait');
  });
});
