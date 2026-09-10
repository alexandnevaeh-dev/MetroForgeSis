import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { generateProceduralSprite } from '../png.js';
import { runAssetPipelineV2 } from './orchestrator.js';
import { toLegacyAssetManifestEntries } from './legacy-bridge.js';
import {
  assessProductionCapacity,
  buildGenerationSpecification,
  generationRequestHash,
  ProductionCapacityError,
  RemoteWorkerExecutionBackend,
  routeProductionInference,
  type CapacityProfile,
  type ProductionExecutionBackend,
} from './production-capacity.js';
import type { AssetRequestV2 } from './types.js';
import type { RemoteVisualRequest, RemoteVisualWorkerClient } from '../execution/remote-worker.js';

const request: AssetRequestV2 = {
  id: 'metro_player_idle', category: 'player', runtimeUse: 'player idle production source',
  artDirection: 'modern cohesive metro explorer', seed: 920001, dimensions: { width: 384, height: 384 },
  inferenceSteps: 6, scheduler: 'PNDM', guidance: 7.5, visualBibleVersion: 'modern-v2',
  visualBibleHash: 'a'.repeat(64), allowRealProvider: true, requireRealProvider: true,
};
const spec = buildGenerationSpecification(request, { model: 'sd-1.5', prompt: 'locked prompt', negativePrompt: 'text', width: 384, height: 384 });
const weakProfile: CapacityProfile = {
  totalSystemRamMb: 8192, availableSystemRamMb: 474, graphicsMemoryMb: 1024,
  devices: ['CPU', 'GPU'], backend: 'local-openvino', compiledCacheAvailable: false,
  measurements: [{ width: 128, height: 128, precision: 'fp32', device: 'GPU', success: false }],
};

function fixtureBackend(overrides: Partial<ProductionExecutionBackend> = {}): ProductionExecutionBackend {
  return {
    id: 'fixture-capable-worker', type: 'remote',
    probe: vi.fn(async () => ({ reachable: true, supportedModels: ['sd-1.5'], device: 'fixture-gpu' })),
    generate: vi.fn(async (submitted, requestHash) => {
      const image = generateProceduralSprite({ id: submitted.outputRole, width: submitted.width, height: submitted.height, fill: [45, 70, 80, 255], accent: [70, 210, 190, 255], shape: 'humanoid' });
      return { requestHash, image, sourceHash: createHash('sha256').update(image).digest('hex'), backendType: 'remote' as const, backendId: 'fixture-capable-worker', model: submitted.model, device: 'fixture-gpu', durationMs: 12, effectiveParameters: { width: submitted.width, height: submitted.height, steps: submitted.steps, scheduler: submitted.scheduler, guidance: submitted.guidance, seed: submitted.seed } };
    }),
    ...overrides,
  };
}

describe('production inference capacity routing', () => {
  it('rejects the known weak local profile before generation without changing the specification', async () => {
    const generate = vi.fn();
    const local: ProductionExecutionBackend = { id: 'weak-local', type: 'local', probe: async () => ({ reachable: true, capacity: assessProductionCapacity(spec, weakProfile) }), generate };
    const before = structuredClone(spec);
    const routed = await routeProductionInference(spec, [local]);
    expect(routed.localAssessment?.status).toBe('UNSUPPORTED_LOCAL_CAPACITY');
    expect(routed.failures[0]?.code).toMatch(/^LOCAL_/);
    expect(generate).not.toHaveBeenCalled();
    expect(spec).toEqual(before);
    expect(routed.result).toBeUndefined();
  });

  it('keeps semantic request identity independent of execution backend', () => {
    expect(generationRequestHash(spec)).toBe(generationRequestHash(structuredClone(spec)));
    expect(generationRequestHash({ ...spec, guidance: 8 })).not.toBe(generationRequestHash(spec));
  });

  it('rejects a returned request-hash mismatch', async () => {
    const backend = fixtureBackend({ generate: vi.fn(async () => ({ ...(await fixtureBackend().generate(spec, 'wrong')), requestHash: 'wrong' })) });
    await expect(routeProductionInference(spec, [backend])).rejects.toMatchObject({ code: 'REQUEST_HASH_MISMATCH' } satisfies Partial<ProductionCapacityError>);
  });

  it('rejects artifact hashes and effective parameters changed by a backend', async () => {
    const corruptHash = fixtureBackend({ generate: vi.fn(async () => ({ ...(await fixtureBackend().generate(spec, generationRequestHash(spec))), sourceHash: '0'.repeat(64) })) });
    await expect(routeProductionInference(spec, [corruptHash])).rejects.toMatchObject({ code: 'RETURNED_ARTIFACT_CORRUPTION' });
    const changedSteps = fixtureBackend({ generate: vi.fn(async () => ({ ...(await fixtureBackend().generate(spec, generationRequestHash(spec))), effectiveParameters: { steps: 5 } })) });
    await expect(routeProductionInference(spec, [changedSteps])).rejects.toMatchObject({ code: 'BACKEND_PROTOCOL_ERROR' });
  });

  it('sends and verifies the immutable contract through the remote-worker adapter', async () => {
    const image = generateProceduralSprite({ id: 'remote', width: 384, height: 384, fill: [45, 70, 80, 255], accent: [70, 210, 190, 255], shape: 'humanoid' });
    const generate = vi.fn(async (submitted: RemoteVisualRequest) => ({ requestId: submitted.requestId, success: true, provider: 'worker', model: submitted.providerModel, executionTarget: client.target, seed: submitted.seed, durationMs: 10, image, outputSha256: createHash('sha256').update(image).digest('hex'), warnings: [], errors: [], provenance: { effectiveParameters: { width: submitted.width, height: submitted.height, steps: submitted.conditioning?.steps, scheduler: submitted.conditioning?.scheduler, guidance: submitted.conditioning?.guidance, seed: submitted.seed } } }));
    const client = { target: { id: 'remote', type: 'REMOTE_METROFORGE_WORKER', location: 'remote', provider: 'worker', installedModels: ['sd-1.5'], capabilities: ['IMAGE_GENERATION'], health: 'ready' }, health: async () => ({ ok: true }), capabilities: async () => ({ models: ['sd-1.5'] }), generate } as RemoteVisualWorkerClient;
    const routed = await routeProductionInference(spec, [new RemoteWorkerExecutionBackend('remote', client)]);
    expect(generate.mock.calls[0]?.[0].requestId).toBe(generationRequestHash(spec));
    expect(generate.mock.calls[0]?.[0].conditioning?.visualBibleHash).toBe(spec.visualBibleHash);
    expect(routed.result?.sourceHash).toBe(createHash('sha256').update(image).digest('hex'));
  });

  it('routes a capable fixture through processing, validation and QA_REVIEW with provenance', async () => {
    const backend = fixtureBackend();
    const result = await runAssetPipelineV2([request], { productionBackends: [backend] });
    const entry = result.manifest[0]!;
    expect(backend.generate).toHaveBeenCalledOnce();
    expect(entry.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.sourceHash).toBe(createHash('sha256').update(entry.sourceBuffer).digest('hex'));
    expect(entry.finalHash).toBe(createHash('sha256').update(entry.buffer).digest('hex'));
    expect(entry.provenance?.backendId).toBe('fixture-capable-worker');
    expect(entry.validation.passed).toBe(true);
    expect(entry.maturity).toBe('QA_REVIEW');
    expect(entry.productionReady).toBe(false);
    expect(result.summary.assets[0]?.requestHash).toBe(entry.requestHash);
    const legacy = toLegacyAssetManifestEntries(result.manifest)[0]!;
    expect(legacy.requestHash).toBe(entry.requestHash);
    expect(legacy.provenance?.visualBibleHash).toBe(request.visualBibleHash);
  });

  it('resumes a hash-valid completed asset and regenerates one whose source is corrupted', async () => {
    const firstBackend = fixtureBackend();
    const first = await runAssetPipelineV2([request], { productionBackends: [firstBackend] });
    const resumeBackend = fixtureBackend();
    const resumed = await runAssetPipelineV2([request], { productionBackends: [resumeBackend], resumeManifest: first.manifest });
    expect(resumeBackend.generate).not.toHaveBeenCalled();
    expect(resumed.manifest[0]?.sourceHash).toBe(first.manifest[0]?.sourceHash);

    const corrupted = { ...first.manifest[0]!, sourceBuffer: Buffer.from('corrupt') };
    const retryBackend = fixtureBackend();
    await runAssetPipelineV2([request], { productionBackends: [retryBackend], resumeManifest: [corrupted] });
    expect(retryBackend.generate).toHaveBeenCalledOnce();
  });
});
