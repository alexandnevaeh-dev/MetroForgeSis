import type { EmbeddingProvider } from '../provider-plugin.js';

export interface OllamaEmbeddingConfig {
  baseUrl: string;
  model?: string;
}

const DEFAULT_MODEL = 'nomic-embed-text';

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  id = 'ollama-embeddings';
  readonly model: string;

  constructor(private readonly config: OllamaEmbeddingConfig) {
    this.model = config.model ?? DEFAULT_MODEL;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);
      return names.some((n) => n === this.model || n.startsWith(`${this.model}:`));
    } catch {
      return false;
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (const prompt of texts) {
      const res = await fetch(`${this.config.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        throw new Error(`Ollama embeddings failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as { embedding?: number[] };
      if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
        throw new Error('Ollama embeddings returned empty vector');
      }
      vectors.push(data.embedding);
    }
    return vectors;
  }
}

/** Deterministic embedder for unit tests — not semantically meaningful. */
export function createDeterministicEmbedder(dimension = 32): EmbeddingProvider {
  return {
    id: 'deterministic-embeddings',
    embed(texts: string[]) {
      return Promise.resolve(
        texts.map((text) => {
          const vec = new Array<number>(dimension).fill(0);
          for (let i = 0; i < text.length; i++) {
            const slot = i % dimension;
            vec[slot] = (vec[slot] ?? 0) + text.charCodeAt(i) / 255;
          }
          const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
          return vec.map((v) => v / norm);
        }),
      );
    },
  };
}
