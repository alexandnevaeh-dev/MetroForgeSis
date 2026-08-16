import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AssetRequest } from '@metroforge/schemas';

export const FOUNDRY_COMPILER_VERSION = '1.0.0';

export function cacheKeyFor(request: AssetRequest, providerId: string, modelId?: string): string {
  const payload = JSON.stringify({
    id: request.id,
    assetType: request.assetType,
    prompt: request.prompt,
    negativePrompt: request.negativePrompt,
    style: request.style,
    dimensions: request.dimensions,
    animation: request.animation,
    output: request.output,
    constraints: {
      commercialUseRequired: request.constraints.commercialUseRequired,
      freeOnly: request.constraints.freeOnly,
      localOnly: request.constraints.localOnly,
    },
    consistency: request.consistency,
    seed: request.seed,
    providerId,
    modelId: modelId ?? '',
    compilerVersion: FOUNDRY_COMPILER_VERSION,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export interface CachedAsset {
  key: string;
  image: Buffer;
  provider: string;
  modelId: string;
  seed: number;
}

export class AssetFoundryCache {
  private memory = new Map<string, CachedAsset>();

  constructor(private readonly diskDir?: string) {
    if (diskDir) mkdirSync(diskDir, { recursive: true });
  }

  get(key: string): CachedAsset | undefined {
    const hit = this.memory.get(key);
    if (hit) return hit;
    if (!this.diskDir) return undefined;
    const metaPath = join(this.diskDir, `${key}.json`);
    const binPath = join(this.diskDir, `${key}.png`);
    if (!existsSync(metaPath) || !existsSync(binPath)) return undefined;
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Omit<CachedAsset, 'image'>;
      const stored: CachedAsset = { ...meta, image: readFileSync(binPath) };
      this.memory.set(key, stored);
      return stored;
    } catch {
      return undefined;
    }
  }

  set(entry: CachedAsset): void {
    this.memory.set(entry.key, entry);
    if (!this.diskDir) return;
    writeFileSync(join(this.diskDir, `${entry.key}.png`), entry.image);
    writeFileSync(
      join(this.diskDir, `${entry.key}.json`),
      JSON.stringify({
        key: entry.key,
        provider: entry.provider,
        modelId: entry.modelId,
        seed: entry.seed,
      }),
    );
  }
}
