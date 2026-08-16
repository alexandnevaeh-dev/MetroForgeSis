import { createLogger } from '@metroforge/shared';
import type { AssetRequest, CharacterIdentity, StyleBible } from '@metroforge/schemas';
import { AssetRequestSchema } from '@metroforge/schemas';
import type { ImageGenRequest, ImageGenerator } from '../types/image-gen.js';
import { resolveImageProviderHealth, healthReportIsSelectable } from '../types/image-gen.js';
import { ImageProviderRegistry, type ImageProviderRegistration } from '../image-router.js';
import { KenneyProvider } from '../providers/kenney.js';
import { OpenGameArtProvider } from '../providers/opengameart.js';
import { defaultBenchmarkRegistry } from './benchmarks.js';
import { AssetFoundryCache, cacheKeyFor } from './cache.js';
import { compileForRequest } from './compilers.js';
import {
  GenerationFailedError,
  isNonRetryableFoundryError,
  isTransientFoundryError,
  ProviderUnavailableError,
} from './errors.js';
import { godotDestinationFor, godotImportHints } from './godot-adapter.js';
import { ProviderHealthGate } from './health-gate.js';
import { classifyAssetLicense, licensePasses } from './license.js';
import {
  assertProductionComplete,
  emptyManifest,
  type FoundryCompletionMode,
  type FoundryManifest,
  upsertManifestAsset,
} from './manifest.js';
import { imageModeFlags, resolveImageCostClass, allowedByFreeOnly, nvidiaFamily } from './mode-flags.js';
import { buildFoundryPrompt, shouldTryRetrieval } from './prompts.js';
import { buildProvenance } from './provenance.js';
import { assertQaPassed, runFoundryQA } from './qa.js';
import { scoreProvider, type ScoreableProvider } from './scoring.js';

const logger = createLogger('asset-foundry');

export interface AssetFoundryResult {
  buffer: Buffer;
  provider: string;
  modelId: string;
  sourceType: 'generated' | 'retrieved' | 'compiled';
  fallbackDepth: number;
  fallbackReason?: string;
  qaScore: number;
  provenance: ReturnType<typeof buildProvenance>;
  godotPath: string;
  importHints: Record<string, string | boolean | number>;
  placeholder: boolean;
  cacheHit: boolean;
}

export interface AssetFoundryOptions {
  registry: ImageProviderRegistry;
  cache?: AssetFoundryCache;
  completionMode?: FoundryCompletionMode;
  styleBible?: StyleBible;
  identities?: Map<string, CharacterIdentity>;
  kenney?: KenneyProvider;
  openGameArt?: OpenGameArtProvider;
}

export class AssetFoundry {
  private readonly cache: AssetFoundryCache;
  private readonly health = new ProviderHealthGate();
  private manifest: FoundryManifest;

  constructor(private readonly options: AssetFoundryOptions) {
    this.cache = options.cache ?? new AssetFoundryCache();
    this.manifest = emptyManifest(options.completionMode ?? 'production');
  }

  getManifest(): FoundryManifest {
    return this.manifest;
  }

  expectAssets(ids: string[]): void {
    this.manifest = { ...this.manifest, expected: ids };
  }

  finishProduction(): FoundryManifest {
    assertProductionComplete(this.manifest);
    return this.manifest;
  }

  async fulfill(raw: AssetRequest): Promise<AssetFoundryResult> {
    const request = AssetRequestSchema.parse(raw);
    const identity = request.consistency.identityId
      ? this.options.identities?.get(request.consistency.identityId)
      : undefined;
    const prompts = buildFoundryPrompt(request, { styleBible: this.options.styleBible, identity });
    const flags = imageModeFlags(undefined, request.routingMode);
    const start = Date.now();
    logger.info('generation request', {
      assetId: request.id,
      assetType: request.assetType,
      routingMode: flags.routingMode,
      freeOnly: request.constraints.freeOnly || flags.freeOnly,
    });

    if (shouldTryRetrieval(request)) {
      try {
        const retrieved = await this.tryRetrieve(request, prompts.prompt);
        if (retrieved) {
          const compiled = await this.compileQaStore(request, retrieved, 'retrieved', 0);
          logger.info('provider selected', {
            assetId: request.id,
            provider: compiled.provider,
            model: compiled.modelId,
            fallback: 'retrieval',
            latency: Date.now() - start,
          });
          return compiled;
        }
      } catch (err) {
        logger.warn('retrieval skipped', {
          assetId: request.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const maxRetries = request.maxRetries ?? 2;
    let lastError: Error | null = null;
    const candidates = await this.rankGenerators(request, flags);
    logger.info('router decision', {
      assetId: request.id,
      candidates: candidates.map((c) => `${c.registration.provider.id}:${c.score.toFixed(1)}`).join(','),
    });

    let fallbackDepth = 0;
    const warnings: string[] = [];
    for (const candidate of candidates) {
      const id = candidate.registration.provider.id;
      if (this.health.isOpen(id)) {
        warnings.push(`${id}: circuit open`);
        fallbackDepth++;
        continue;
      }
      const cacheKey = cacheKeyFor(request, id);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return this.compileQaStore(
          request,
          {
            image: cached.image,
            provider: cached.provider,
            modelId: cached.modelId,
            seed: cached.seed,
            fallbackGenerated: false,
          },
          'generated',
          fallbackDepth,
          true,
        );
      }
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const genRequest: ImageGenRequest = {
            profile: 'CHARACTER',
            prompt: attempt === 0 ? prompts.prompt : `${prompts.prompt}. cleaner silhouette, no artifacts`,
            negativePrompt: prompts.negativePrompt,
            width: request.dimensions?.width ?? 1024,
            height: request.dimensions?.height ?? 1024,
            seed: request.seed,
          };
          const generated = await candidate.registration.provider.generateImage(genRequest);
          this.health.recordSuccess(id);
          this.cache.set({
            key: cacheKey,
            image: generated.image,
            provider: generated.provider,
            modelId: generated.modelId,
            seed: generated.seed,
          });
          defaultBenchmarkRegistry.record({
            provider: generated.provider,
            model: generated.modelId,
            assetType: request.assetType,
            quality: 0.8,
            consistency: request.consistency.characterConsistency ? 0.7 : 0.5,
            speed: 0.6,
            reliability: 1,
          });
          const compiled = await this.compileQaStore(request, generated, 'generated', fallbackDepth);
          logger.info('QA result', { assetId: request.id, provider: id, score: compiled.qaScore, latency: Date.now() - start });
          return compiled;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          logger.warn('provider failure', { assetId: request.id, provider: id, message: lastError.message, attempt });
          if (isNonRetryableFoundryError(err)) {
            this.health.recordFailure(id, 'AUTH_FAILED');
            break;
          }
          if (isTransientFoundryError(err) && attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 200 * 2 ** attempt + Math.floor(Math.random() * 50)));
            continue;
          }
          this.health.recordFailure(id);
          break;
        }
      }
      warnings.push(`${id}: ${lastError?.message ?? 'failed'}`);
      fallbackDepth++;
      logger.info('fallback', { assetId: request.id, from: id, depth: fallbackDepth });
    }

    throw lastError ?? new ProviderUnavailableError(
      warnings.length ? warnings.join('; ') : 'No image providers registered',
    );
  }

  private async tryRetrieve(
    request: AssetRequest,
    query: string,
  ): Promise<{ image: Buffer; provider: string; modelId: string; seed: number; fallbackGenerated: boolean } | null> {
    const kenney = this.options.kenney ?? new KenneyProvider({ commercialUseRequired: request.constraints.commercialUseRequired });
    const hits = kenney.search(query, request.assetType);
    const withFile = hits.find((h) => Boolean(h.entry.fetchUrl));
    if (withFile) {
      const license = classifyAssetLicense(
        { license: withFile.entry.license, commercialUse: 'allowed', creator: 'Kenney', sourceUrl: withFile.entry.sourceUrl },
        request.constraints.commercialUseRequired,
      );
      if (licensePasses(license, request.constraints.commercialUseRequired)) {
        const generated = await kenney.generateImage({
          profile: 'ITEM',
          prompt: query,
          width: request.dimensions?.width ?? 64,
          height: request.dimensions?.height ?? 64,
          seed: request.seed,
        });
        if (!generated.fallbackGenerated) return generated;
      }
    }
    const oga = this.options.openGameArt ?? new OpenGameArtProvider({
      commercialUseRequired: request.constraints.commercialUseRequired,
    });
    const licensed = oga.pickLicensed(query, request.assetType, request.constraints.commercialUseRequired);
    if (licensed?.rec.previewUrl) {
      return oga.generateImage({
        profile: 'ITEM',
        prompt: query,
        width: request.dimensions?.width ?? 64,
        height: request.dimensions?.height ?? 64,
        seed: request.seed,
      });
    }
    return null;
  }

  private async rankGenerators(request: AssetRequest, flags: ReturnType<typeof imageModeFlags>) {
    const regs = this.options.registry.getCandidates({
      mode:
        flags.freeOnly
          ? 'FREE_ONLY'
          : flags.localOnly
            ? flags.offline
              ? 'OFFLINE'
              : 'LOCAL_ONLY'
            : flags.nvidiaOnly
              ? 'NVIDIA_ONLY'
              : flags.lowestCost
                ? 'LOWEST_COST'
                : flags.fastest
                  ? 'FASTEST'
                  : flags.highestQuality
                    ? 'HIGHEST_QUALITY'
                    : 'BALANCED',
    });
    const scored: Array<{ registration: ImageProviderRegistration; score: number }> = [];
    for (const registration of regs) {
      if (registration.kind === 'retrieve') continue;
      const cost = resolveImageCostClass(registration.local, registration.costClass);
      if ((request.constraints.freeOnly || flags.freeOnly) && !allowedByFreeOnly(cost)) continue;
      if ((request.constraints.localOnly || flags.localOnly) && !registration.local) continue;
      if (flags.nvidiaOnly && !nvidiaFamily(registration.provider.id, registration.family)) continue;
      if (this.health.isOpen(registration.provider.id)) continue;
      const report = await resolveImageProviderHealth(registration.provider);
      if (!healthReportIsSelectable(report)) continue;
      const subject: ScoreableProvider = {
        id: registration.provider.id,
        local: registration.local,
        priority: registration.priority,
        costClass: cost,
        capabilities: registration.capabilities ?? ['image-generation'],
        supportsReferenceImages: registration.supportsReferenceImages ?? false,
        qualityScore: registration.qualityScore ?? 60,
        speedScore: registration.speedScore ?? 50,
        consistencyScore: registration.consistencyScore ?? 50,
        reliabilityScore: registration.reliabilityScore ?? 60,
        licenseScore: registration.commercialUse === 'allowed' ? 90 : registration.commercialUse === 'restricted' ? 10 : 40,
        localityScore: registration.local ? 90 : 40,
        family: registration.family,
        healthPenalty: report.status === 'DEGRADED' ? 0.4 : 0,
        expectedCost: cost === 'free' || cost === 'local' ? 5 : cost === 'credit' ? 40 : 80,
        expectedLatencyMs: registration.local ? 8000 : 20000,
      };
      const breakdown = scoreProvider(subject, request, flags);
      if (breakdown.capabilityMatch < 1) continue;
      scored.push({ registration, score: breakdown.total });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  private async compileQaStore(
    request: AssetRequest,
    generated: { image: Buffer; provider: string; modelId: string; seed: number; fallbackGenerated?: boolean },
    sourceType: 'generated' | 'retrieved',
    fallbackDepth: number,
    cacheHit = false,
  ): Promise<AssetFoundryResult> {
    let compiled;
    try {
      compiled = compileForRequest(generated.image, request);
    } catch (err) {
      logger.warn('compiler failed, using source bytes', { message: err instanceof Error ? err.message : String(err) });
      compiled = { buffer: generated.image, width: request.dimensions?.width ?? 0, height: request.dimensions?.height ?? 0, transformations: [] };
    }
    let qa = runFoundryQA(compiled.buffer, { ...request, dimensions: request.dimensions });
    if (!qa.passed) {
      compiled = compileForRequest(generated.image, request);
      qa = runFoundryQA(compiled.buffer, request);
    }
    try {
      assertQaPassed(qa);
    } catch (err) {
      if (this.options.completionMode === 'production') throw err;
    }
    const reg = this.options.registry.list().find((r) => r.provider.id === generated.provider);
    const license = classifyAssetLicense(
      {
        license: reg?.license ?? `${generated.provider} / ${generated.modelId}`,
        commercialUse: reg?.commercialUse ?? (generated.provider === 'kenney' ? 'allowed' : 'unknown'),
      },
      request.constraints.commercialUseRequired,
    );
    if (request.constraints.commercialUseRequired && !licensePasses(license, true)) {
      throw new GenerationFailedError(license.reason);
    }
    const provenance = buildProvenance({
      request,
      sourceType,
      provider: generated.provider,
      model: generated.modelId,
      license,
      transformations: compiled.transformations,
      qaScore: qa.score,
      cacheHit,
    });
    const placeholder = Boolean(generated.fallbackGenerated) || !qa.passed;
    this.manifest = upsertManifestAsset(this.manifest, {
      id: request.id,
      assetType: request.assetType,
      path: godotDestinationFor(request),
      provider: generated.provider,
      model: generated.modelId,
      license: license.reason,
      qaPassed: qa.passed,
      qaScore: qa.score,
      sourceType,
      placeholder,
      validated: qa.passed && !placeholder,
      godotDestination: godotDestinationFor(request),
    });
    return {
      buffer: compiled.buffer,
      provider: generated.provider,
      modelId: generated.modelId,
      sourceType,
      fallbackDepth,
      qaScore: qa.score,
      provenance,
      godotPath: godotDestinationFor(request),
      importHints: godotImportHints(request),
      placeholder,
      cacheHit,
    };
  }
}

export function createAssetFoundry(options: AssetFoundryOptions): AssetFoundry {
  return new AssetFoundry(options);
}

export type { ImageGenerator };
