import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  formatMemoryContext,
  rankMemoryChunks,
  type ProjectMemoryChunk,
} from './project-memory.js';
import { createDeterministicEmbedder } from './providers/ollama-embeddings.js';

describe('project-memory', () => {
  it('ranks chunks by cosine similarity', async () => {
    const embedder = createDeterministicEmbedder();
    const [questVec, roomVec, bossVec] = await embedder.embed([
      'Quest: defeat the guardian boss',
      'Room room_003 is a connector hub',
      'Boss boss_final guards the final chamber',
    ]);
    const [queryVec] = await embedder.embed(['Where is the final boss?']);

    const chunks: ProjectMemoryChunk[] = [
      { id: 'q1', category: 'quest', text: 'Quest: defeat the guardian boss', embedding: questVec },
      { id: 'r3', category: 'room', text: 'Room room_003 is a connector hub', embedding: roomVec },
      { id: 'b1', category: 'boss', text: 'Boss boss_final guards the final chamber', embedding: bossVec },
    ];

    const ranked = rankMemoryChunks(queryVec!, chunks, 2);
    expect(ranked[0]?.category).toBe('boss');
    expect(formatMemoryContext(ranked)).toContain('boss_final');
  });

  it('cosineSimilarity returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });
});
