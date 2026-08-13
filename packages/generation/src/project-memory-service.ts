import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EmbeddingProvider, ProjectMemoryIndex } from '@metroforge/ai';
import {
  formatMemoryContext,
  rankMemoryChunks,
} from '@metroforge/ai';
import { loadProjectContext } from './project-loader.js';
import { buildProjectMemoryChunks } from './project-memory-chunks.js';

export const PROJECT_MEMORY_FILENAME = 'project_memory.json';

export function loadProjectMemoryIndex(projectPath: string): ProjectMemoryIndex | null {
  const path = join(projectPath, PROJECT_MEMORY_FILENAME);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ProjectMemoryIndex;
  } catch {
    return null;
  }
}

export function saveProjectMemoryIndex(projectPath: string, index: ProjectMemoryIndex): void {
  writeFileSync(join(projectPath, PROJECT_MEMORY_FILENAME), JSON.stringify(index, null, 2));
}

export async function buildProjectMemoryIndex(
  projectPath: string,
  embedder: EmbeddingProvider,
  model: string,
): Promise<ProjectMemoryIndex | null> {
  const project = loadProjectContext(projectPath);
  const rawChunks = buildProjectMemoryChunks(project);
  if (rawChunks.length === 0) return null;

  const embeddings = await embedder.embed(rawChunks.map((chunk) => chunk.text));
  const chunks = rawChunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index]!,
  }));

  const index: ProjectMemoryIndex = {
    version: '0.1.0',
    provider: embedder.id,
    model,
    createdAt: new Date().toISOString(),
    chunkCount: chunks.length,
    chunks,
  };
  saveProjectMemoryIndex(projectPath, index);
  return index;
}

export async function queryProjectMemory(
  projectPath: string,
  query: string,
  embedder: EmbeddingProvider,
  topK = 5,
): Promise<string> {
  const index = loadProjectMemoryIndex(projectPath);
  if (!index || index.chunks.length === 0) return '';

  const [queryEmbedding] = await embedder.embed([query]);
  if (!queryEmbedding) return '';

  const ranked = rankMemoryChunks(queryEmbedding, index.chunks, topK);
  return formatMemoryContext(ranked);
}

export async function queryProjectMemoryWithIndex(
  index: ProjectMemoryIndex,
  query: string,
  embedder: EmbeddingProvider,
  topK = 5,
): Promise<string> {
  const [queryEmbedding] = await embedder.embed([query]);
  if (!queryEmbedding) return '';
  return formatMemoryContext(rankMemoryChunks(queryEmbedding, index.chunks, topK));
}
