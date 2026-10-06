import { defaultCharacterLineageEdges, type LineageEdge } from './artifact-lineage.js';

export interface VisualGraphNode {
  id: string;
  kind: string;
}

export function visualExecutionGraph(biomeIds: string[] = ['biome_0']): LineageEdge[] {
  const edges: LineageEdge[] = [...defaultCharacterLineageEdges('player')];
  edges.push({ parentId: 'player', childId: 'player_portrait', reason: 'portrait_from_identity' });
  edges.push({ parentId: 'visual_dna', childId: 'player', reason: 'identity_from_visual_dna' });
  for (const biomeId of biomeIds) {
    edges.push({ parentId: 'visual_dna', childId: `${biomeId}_visual_dna`, reason: 'biome_from_visual_dna' });
    edges.push({ parentId: `${biomeId}_visual_dna`, childId: `${biomeId}_tileset`, reason: 'tileset_from_biome' });
    edges.push({ parentId: `${biomeId}_visual_dna`, childId: `${biomeId}_props`, reason: 'props_from_biome' });
    edges.push({ parentId: `${biomeId}_visual_dna`, childId: `${biomeId}_backgrounds`, reason: 'backgrounds_from_biome' });
    edges.push({ parentId: `${biomeId}_visual_dna`, childId: `${biomeId}_lighting`, reason: 'lighting_from_biome' });
    edges.push({ parentId: `${biomeId}_tileset`, childId: 'rooms', reason: 'rooms_use_tileset' });
    edges.push({ parentId: `${biomeId}_props`, childId: 'rooms', reason: 'rooms_use_props' });
    edges.push({ parentId: `${biomeId}_backgrounds`, childId: 'rooms', reason: 'rooms_use_parallax' });
    edges.push({ parentId: `${biomeId}_lighting`, childId: 'rooms', reason: 'rooms_use_lighting' });
  }
  edges.push({ parentId: 'rooms', childId: 'qa_screenshots', reason: 'screenshots_from_rooms' });
  edges.push({ parentId: 'player', childId: 'qa_screenshots', reason: 'screenshots_include_player' });
  return edges;
}
