import type { FoundryAssetType } from '@metroforge/schemas';
import type {
  ImageGenRequest,
  ImageGenResult,
  ImageGenerator,
  ImageProviderHealthReport,
} from '../types/image-gen.js';
import { classifyAssetLicense, licensePasses } from '../foundry/license.js';
import { LicenseRejectedError, UnsupportedCapabilityError } from '../foundry/errors.js';
import { foundryFetch, type FoundryFetch } from '../foundry/http.js';

export interface OpenGameArtRecord {
  id: string;
  title: string;
  author: string;
  sourceUrl: string;
  license: string;
  commercialUse: 'allowed' | 'restricted' | 'unknown';
  attributionRequired: boolean;
  shareAlike: boolean;
  tags: string[];
  assetTypes: FoundryAssetType[];
  previewUrl?: string;
}

/**
 * OpenGameArt is a repository, not CC0-by-default. Every record must carry a real license.
 * Seed catalog is verified-metadata only; live HTML scrape is not assumed.
 */
export const OPENGAMEART_CATALOG: OpenGameArtRecord[] = [
  {
    id: 'oga-cc0-generic-ui',
    title: 'Generic UI set (catalog stub — replace with fetched record)',
    author: 'unknown',
    sourceUrl: 'https://opengameart.org/',
    license: 'unknown',
    commercialUse: 'unknown',
    attributionRequired: true,
    shareAlike: false,
    tags: ['ui'],
    assetTypes: ['ui', 'icon'],
  },
];

export class OpenGameArtProvider implements ImageGenerator {
  id = 'opengameart';

  constructor(
    private readonly options: {
      commercialUseRequired?: boolean;
      catalog?: OpenGameArtRecord[];
      fetchImpl?: FoundryFetch;
    } = {},
  ) {}

  search(query: string, assetType?: FoundryAssetType): OpenGameArtRecord[] {
    const q = query.toLowerCase();
    return (this.options.catalog ?? OPENGAMEART_CATALOG).filter((rec) => {
      if (assetType && !rec.assetTypes.includes(assetType)) return false;
      return `${rec.title} ${rec.tags.join(' ')}`.toLowerCase().includes(q) || q.length === 0;
    });
  }

  async checkHealth(): Promise<boolean> {
    const report = await this.getHealthReport();
    return report.status === 'HEALTHY' || report.status === 'DEGRADED';
  }

  async getHealthReport(): Promise<ImageProviderHealthReport> {
    const started = Date.now();
    try {
      const res = await foundryFetch(
        'https://opengameart.org/',
        { timeoutMs: 5000 },
        this.options.fetchImpl ?? fetch,
      );
      return {
        status: res.ok ? 'HEALTHY' : 'DEGRADED',
        reason: res.ok ? 'opengameart.org reachable' : `HTTP ${res.status}`,
        latencyMs: Date.now() - started,
      };
    } catch {
      return {
        status: 'DEGRADED',
        reason: 'opengameart.org not reachable — using local license catalog only',
        latencyMs: Date.now() - started,
      };
    }
  }

  pickLicensed(query: string, assetType: FoundryAssetType | undefined, commercialUseRequired: boolean) {
    for (const rec of this.search(query, assetType)) {
      const decision = classifyAssetLicense(
        {
          license: rec.license,
          commercialUse: rec.commercialUse,
          attributionRequired: rec.attributionRequired,
          shareAlike: rec.shareAlike,
          creator: rec.author,
          sourceUrl: rec.sourceUrl,
        },
        commercialUseRequired,
      );
      if (licensePasses(decision, commercialUseRequired)) return { rec, decision };
    }
    return undefined;
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    const commercial = this.options.commercialUseRequired ?? false;
    const match = this.pickLicensed(request.prompt, undefined, commercial);
    if (!match) {
      throw new LicenseRejectedError(
        'No OpenGameArt record with a verified compatible license (unknown licenses never auto-pass)',
      );
    }
    if (!match.rec.previewUrl) {
      throw new UnsupportedCapabilityError(
        `OpenGameArt hit ${match.rec.id} has license ${match.rec.license} but no retrievable file`,
      );
    }
    const res = await foundryFetch(
      match.rec.previewUrl,
      { timeoutMs: 15000 },
      this.options.fetchImpl ?? fetch,
    );
    if (!res.ok) throw new UnsupportedCapabilityError(`OpenGameArt fetch HTTP ${res.status}`);
    return {
      image: Buffer.from(await res.arrayBuffer()),
      provider: this.id,
      modelId: match.rec.id,
      seed: request.seed ?? 0,
      fallbackGenerated: false,
      productionAllowed: true,
    };
  }
}
