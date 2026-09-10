import { createHash } from 'node:crypto';
import { generateProceduralSprite, generateTilesetSource, pickEnemyArchetype } from '../png.js';
import type { ImageGenerationProfile } from '../types/vision.js';
import { generateParallaxStrip } from '../parallax-strip.js';
import { generateUiIcon } from '../ui-foundry.js';
import { generatePropSprite } from '../prop-art.js';
import type { ImageProviderRegistry } from '../image-router.js';
import type { AssetPlanV2, AssetRequestV2, GenerationExecutionPath, SourceGenerationResultV2 } from './types.js';
import { buildGenerationSpecification, currentCapacityProfile, generationRequestHash, LocalImageExecutionBackend, ProductionCapacityError, remoteWorkerBackendFromEnvironment, routeProductionInference, type CapacityProfile, type ProductionExecutionBackend } from './production-capacity.js';

export interface SourceGenerationContextV2 {
  /** Real Metroforge provider registry — same routing code used by v1. Optional; when absent
   *  (or when the request doesn't opt in via `allowRealProvider`), generation goes straight to
   *  the deterministic procedural generator below. Providers never own asset semantics — this
   *  stage decides *whether* to ask one, category processing decides what happens next. */
  registry?: ImageProviderRegistry;
  /** Ordered local/remote production backends. When supplied, capacity preflight is mandatory
   * and the immutable specification is routed without changing generation intent. */
  productionBackends?: ProductionExecutionBackend[];
  localCapacityProfile?: CapacityProfile;
  productionModel?: string;
}

function hex(color: [number, number, number, number]): string {
  return `#${color.slice(0, 3).map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function profileForCategory(category: AssetPlanV2['category']): ImageGenerationProfile {
  switch (category) {
    case 'player':
      return 'CHARACTER';
    case 'enemy':
      return 'ENEMY';
    case 'boss':
      return 'BOSS';
    case 'npc':
      return 'NPC';
    case 'environment':
      return 'TILE_SOURCE';
    case 'background':
      return 'BACKGROUND';
    case 'pickup':
    case 'prop':
    case 'animated_environment':
      return 'ITEM';
    case 'vfx':
    case 'ability_icon':
    case 'hud':
    case 'ui_panel':
      return 'ICON';
    default: {
      const exhaustive: never = category;
      throw new Error(`profileForCategory: unhandled category ${String(exhaustive)}`);
    }
  }
}

function paletteFor(request: AssetRequestV2): { fill: [number, number, number, number]; accent: [number, number, number, number] } {
  const h = createHash('sha256').update(`${request.id}:${request.seed}`).digest();
  return {
    fill: [40 + (h[0]! % 60), 60 + (h[1]! % 60), 70 + (h[2]! % 60), 255],
    accent: [60 + (h[3]! % 120), 180 + (h[4]! % 60), 150 + (h[5]! % 90), 255],
  };
}

/** Deterministic procedural fallback — the same synthesis primitives v1 already uses in
 *  production (png.ts / ui-foundry.ts / prop-art.ts / parallax-strip.ts). Not a parallel
 *  reimplementation of inference; this *is* the existing deterministic generator, reused. */
function proceduralSource(plan: AssetPlanV2, request: AssetRequestV2): Buffer {
  const { fill, accent } = paletteFor(request);
  switch (plan.category) {
    case 'player':
      return generateProceduralSprite({ id: request.id, width: plan.sourceWidth, height: plan.sourceHeight, fill, accent, shape: 'humanoid' });
    case 'npc':
      return generateProceduralSprite({ id: request.id, width: plan.sourceWidth, height: plan.sourceHeight, fill, accent, shape: 'humanoid' });
    case 'enemy':
    case 'boss': {
      const archetype = pickEnemyArchetype(request.id);
      return generateProceduralSprite({
        id: request.id,
        width: plan.sourceWidth,
        height: plan.sourceHeight,
        fill,
        accent,
        enemyArchetype: archetype,
        shape: 'enemy',
      });
    }
    case 'environment':
      return generateTilesetSource(request.seed, plan.sourceWidth);
    case 'background':
      return generateParallaxStrip('far', request.seed, plan.sourceWidth, plan.sourceHeight);
    case 'pickup':
      return generateProceduralSprite({ id: request.id, width: plan.sourceWidth, height: plan.sourceHeight, fill, accent, shape: 'ability_pickup' });
    case 'prop':
    case 'animated_environment':
      return generatePropSprite({
        width: plan.sourceWidth,
        height: plan.sourceHeight,
        fill: hex(fill),
        accent: hex(accent),
        family: request.artDirection,
        seed: request.seed,
      });
    case 'ability_icon':
      return generateUiIcon({ size: plan.sourceWidth, fill: hex(fill), accent: hex(accent), kind: 'ability' });
    case 'vfx':
      return generateProceduralSprite({ id: request.id, width: plan.sourceWidth, height: plan.sourceHeight, fill, accent, shape: 'ability_pickup' });
    case 'hud':
    case 'ui_panel':
      return generateUiIcon({ size: plan.sourceWidth, fill: hex(fill), accent: hex(accent), kind: 'hud' });
    default: {
      const exhaustive: never = plan.category;
      throw new Error(`proceduralSource: unhandled category ${String(exhaustive)}`);
    }
  }
}

/** SourceGeneration stage. Consumes the real provider system (routing only — inference itself
 *  stays inside the provider, never reimplemented here); falls back to the deterministic
 *  procedural generator when no healthy provider is selected or `allowRealProvider` is unset. */
export async function generateSourceV2(
  plan: AssetPlanV2,
  request: AssetRequestV2,
  ctx: SourceGenerationContextV2 = {},
): Promise<SourceGenerationResultV2> {
  if (request.allowRealProvider && request.requireRealProvider && ctx.productionBackends) {
    const spec = buildGenerationSpecification(request, { model: ctx.productionModel ?? 'sd-1.5', prompt: plan.providerPrompt, negativePrompt: plan.negativePrompt, width: plan.sourceWidth, height: plan.sourceHeight });
    const routed = await routeProductionInference(spec, ctx.productionBackends);
    if (!routed.result) {
      const reason = routed.failures.map((failure) => `${failure.code}:${failure.backend}:${failure.message}`).join('; ');
      const code = routed.failures.at(-1)?.code ?? 'REMOTE_UNAVAILABLE';
      throw new ProductionCapacityError(code as ConstructorParameters<typeof ProductionCapacityError>[0], reason || 'No capable production execution backend configured', routed.localAssessment);
    }
    const result = routed.result;
    return { buffer: result.image, provider: result.backendId, model: result.model, fallbackGenerated: false, executionPath: result.backendType === 'remote' ? 'provider_remote' : 'direct_openvino_persistent', requestHash: result.requestHash, provenance: { backendType: result.backendType, backendId: result.backendId, device: result.device, durationMs: result.durationMs, timestamp: new Date().toISOString(), visualBibleVersion: spec.visualBibleVersion, visualBibleHash: spec.visualBibleHash, effectiveParameters: result.effectiveParameters, executionMetadata: result.executionMetadata } };
  }
  if (request.allowRealProvider && ctx.registry) {
    const selection = await ctx.registry.selectHealthy({ mode: request.mode });
    if (selection.generator) {
      try {
        const registration = ctx.registry.list().find((item) => item.provider === selection.generator);
        if (request.requireRealProvider && registration?.local && registration?.useProductionCapacityGate !== false) {
          const spec = buildGenerationSpecification(request, { model: ctx.productionModel ?? 'sd-1.5', prompt: plan.providerPrompt, negativePrompt: plan.negativePrompt, width: plan.sourceWidth, height: plan.sourceHeight });
          const local = new LocalImageExecutionBackend(selection.generator.id, selection.generator, ctx.localCapacityProfile ?? currentCapacityProfile({ devices: (process.env.METROFORGE_LOCAL_DEVICES ?? 'CPU,GPU').split(','), graphicsMemoryMb: process.env.METROFORGE_LOCAL_VRAM_MB ? Number(process.env.METROFORGE_LOCAL_VRAM_MB) : undefined }));
          const remote = remoteWorkerBackendFromEnvironment();
          const routed = await routeProductionInference(spec, remote ? [local, remote] : [local]);
          if (!routed.result) {
            const failure = routed.failures.at(-1);
            throw new ProductionCapacityError((failure?.code ?? 'REMOTE_UNAVAILABLE') as ConstructorParameters<typeof ProductionCapacityError>[0], failure?.message ?? 'No capable production execution backend configured', routed.localAssessment);
          }
          const result = routed.result;
          return { buffer: result.image, provider: result.backendId, model: result.model, fallbackGenerated: false, executionPath: result.backendType === 'remote' ? 'provider_remote' : 'direct_openvino_persistent', requestHash: result.requestHash, provenance: { backendType: result.backendType, backendId: result.backendId, device: result.device, durationMs: result.durationMs, timestamp: new Date().toISOString(), visualBibleVersion: spec.visualBibleVersion, visualBibleHash: spec.visualBibleHash, effectiveParameters: result.effectiveParameters, executionMetadata: result.executionMetadata } };
        }
        const result = await selection.generator.generateImage({
          profile: profileForCategory(plan.category),
          prompt: plan.providerPrompt,
          negativePrompt: plan.negativePrompt,
          width: plan.sourceWidth,
          height: plan.sourceHeight,
          seed: request.seed,
          inferenceSteps: request.inferenceSteps,
        });
        const reportedPath = result.executionMetadata?.executionPath;
        // A locally-executing backend (OpenVINO's persistent server, or Apple-native MPS) must
        // never be mislabeled 'provider_remote' just because it isn't the OpenVINO path — that
        // would be false provenance, not a rounding error. Anything else genuinely is remote.
        const executionPath: GenerationExecutionPath =
          reportedPath === 'direct_openvino_persistent' || reportedPath === 'apple_mps_local'
            ? (reportedPath === 'apple_mps_local' ? 'apple_native_mps' : reportedPath)
            : 'provider_remote';
        const spec = buildGenerationSpecification(request, { model: result.modelId, prompt: plan.providerPrompt, negativePrompt: plan.negativePrompt, width: plan.sourceWidth, height: plan.sourceHeight });
        return { buffer: result.image, provider: result.provider, model: result.modelId, fallbackGenerated: false, executionPath, requestHash: generationRequestHash(spec), provenance: { backendType: executionPath === 'provider_remote' ? 'remote' : 'local', backendId: result.provider, device: String(result.executionMetadata?.actualDevice ?? ''), durationMs: Number(result.executionMetadata?.timings && (result.executionMetadata.timings as Record<string,unknown>).parentRoundTripMs || 0), timestamp: new Date().toISOString(), visualBibleVersion: spec.visualBibleVersion, visualBibleHash: spec.visualBibleHash, effectiveParameters: { width: spec.width, height: spec.height, steps: spec.steps, scheduler: spec.scheduler, guidance: spec.guidance }, executionMetadata: result.executionMetadata } };
      } catch (error) {
        if (request.requireRealProvider) throw error;
        // Provider attempt failed — fall through to deterministic procedural generation below.
      }
    }
    if (request.requireRealProvider) {
      throw new Error(selection.fallbackReason ?? 'No healthy real image provider was selected');
    }
  } else if (request.requireRealProvider) {
    throw new Error('A real provider is required but no provider registry was supplied');
  }
  return {
    buffer: proceduralSource(plan, request),
    provider: 'procedural',
    fallbackGenerated: true,
    executionPath: 'procedural_fallback',
  };
}
