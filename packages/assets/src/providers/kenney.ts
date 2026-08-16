import type { FoundryAssetType } from '@metroforge/schemas';
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageGenerator,
  ImageProviderHealthReport,
} from '../types/image-gen.js';
import { classifyAssetLicense, licensePasses } from '../foundry/license.js';
import { LicenseRejectedError, UnsupportedCapabilityError } from '../foundry/errors.js';
import { generateProceduralSprite } from '../png.js';
import { foundryFetch, type FoundryFetch } from '../foundry/http.js';

export interface KenneyCatalogEntry {
  id: string;
  title: string;
  pack: string;
  category: string;
  tags: string[];
  assetTypes: FoundryAssetType[];
  sourceUrl: string;
  license: 'CC0-1.0';
  commercialUse: true;
  dimensions?: { width: number; height: number };
  fileTypes: string[];
  engineSuitability: string[];
  fetchUrl?: string;
}

/** Curated CC0 Kenney metadata — Kenney is a retrieval source, not an AI generator. */
export const KENNEY_CATALOG: KenneyCatalogEntry[] = [
  {
    id: 'kenney-pattern-textures',
    title: 'Pattern Textures',
    pack: 'Pattern Textures',
    category: 'texture',
    tags: ['texture', 'tile', 'seamless'],
    assetTypes: ['texture', 'tileset', 'prop'],
    sourceUrl: 'https://kenney.nl/assets/pattern-textures',
    license: 'CC0-1.0',
    commercialUse: true,
    fileTypes: ['png'],
    engineSuitability: ['godot', 'unity', 'unreal'],
  },
  {
    id: 'kenney-ui-pack',
    title: 'UI Pack',
    pack: 'UI Pack',
    category: 'ui',
    tags: ['ui', 'button', 'icon', 'hud'],
    assetTypes: ['ui', 'hud', 'icon'],
    sourceUrl: 'https://kenney.nl/assets/ui-pack',
    license: 'CC0-1.0',
    commercialUse: true,
    fileTypes: ['png'],
    engineSuitability: ['godot'],
  },
  {
    id: 'kenney-abstract-platformer',
    title: 'Abstract Platformer',
    pack: 'Abstract Platformer',
    category: 'tileset',
    tags: ['tileset', 'platform', 'generic'],
    assetTypes: ['tileset', 'platform', 'prop'],
    sourceUrl: 'https://kenney.nl/assets/abstract-platformer',
    license: 'CC0-1.0',
    commercialUse: true,
    fileTypes: ['png'],
    engineSuitability: ['godot'],
  },
];

export interface KenneySearchHit {
  entry: KenneyCatalogEntry;
  score: number;
}

export class KenneyProvider implements ImageGenerator {
  id = 'kenney';
  constructor(
    private readonly options: {
      commercialUseRequired?: boolean;
      catalog?: KenneyCatalogEntry[];
      fetchImpl?: FoundryFetch;
    } = {},
  ) {}

  search(query: string, assetType?: FoundryAssetType): KenneySearchHit[] {
    const q = query.toLowerCase();
    return (this.options.catalog ?? KENNEY_CATALOG)
      .filter((e) => !assetType || e.assetTypes.includes(assetType))
      .map((entry) => {
        const hay = `${entry.title} ${entry.pack} ${entry.tags.join(' ')}`.toLowerCase();
        let score = hay.includes(q) ? 5 : 0;
        for (const word of q.split(/\s+/)) {
          if (word && hay.includes(word)) score += 1;
        }
        return { entry, score };
      })
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  async checkHealth(): Promise<boolean> {
    return true;
  }

  async getHealthReport(): Promise<ImageProviderHealthReport> {
    return {
      status: 'HEALTHY',
      reason: `Kenney CC0 catalog (${(this.options.catalog ?? KENNEY_CATALOG).length} packs)`,
      latencyMs: 0,
    };
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    const hits = this.search(request.prompt);
    const hit = hits[0];
    if (!hit) {
      throw new UnsupportedCapabilityError('No Kenney CC0 catalog match for this request');
    }
    const decision = classifyAssetLicense(
      { license: hit.entry.license, commercialUse: 'allowed', sourceUrl: hit.entry.sourceUrl, creator: 'Kenney' },
      this.options.commercialUseRequired ?? false,
    );
    if (!licensePasses(decision, this.options.commercialUseRequired ?? false)) {
      throw new LicenseRejectedError(decision.reason);
    }
    let image: Buffer;
    if (hit.entry.fetchUrl && this.options.fetchImpl) {
      const res = await foundryFetch(hit.entry.fetchUrl, { timeoutMs: 15000 }, this.options.fetchImpl);
      if (!res.ok) throw new UnsupportedCapabilityError(`Kenney fetch failed HTTP ${res.status}`);
      image = Buffer.from(await res.arrayBuffer());
    } else {
      image = generateProceduralSprite({
        id: hit.entry.id,
        width: request.width,
        height: request.height,
        fill: [180, 180, 190, 255],
        shape: 'tile',
      });
    }
    return {
      image,
      provider: this.id,
      modelId: hit.entry.id,
      seed: request.seed ?? 0,
      fallbackGenerated: !hit.entry.fetchUrl,
      productionAllowed: Boolean(hit.entry.fetchUrl),
    };
  }
}
