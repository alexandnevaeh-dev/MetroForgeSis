export interface ProjectMemoryChunk {
  id: string;
  category: 'identity' | 'narrative' | 'room' | 'quest' | 'npc' | 'enemy' | 'boss' | 'ability' | 'world';
  text: string;
  embedding?: number[];
}

export interface ProjectMemoryIndex {
  version: '0.1.0';
  provider: string;
  model: string;
  createdAt: string;
  chunkCount: number;
  chunks: ProjectMemoryChunk[];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function rankMemoryChunks(
  queryEmbedding: number[],
  chunks: ProjectMemoryChunk[],
  topK = 5,
): ProjectMemoryChunk[] {
  const scored = chunks
    .filter((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0)
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding!),
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((entry) => entry.chunk);
}

export function formatMemoryContext(chunks: ProjectMemoryChunk[]): string {
  if (chunks.length === 0) return '';
  return chunks.map((chunk) => `- [${chunk.category}] ${chunk.text}`).join('\n');
}
