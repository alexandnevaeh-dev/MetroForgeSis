import { describe, expect, it } from 'vitest';
import { DiffusersProvider } from '../providers/diffusers.js';
import { ImageProviderRegistry } from '../image-router.js';
import { runAssetPipelineV2 } from './orchestrator.js';

describe.skipIf(process.env.METROFORGE_PIPELINE_V2_REAL !== '1')('pipeline v2 — real OpenVINO evidence', () => {
  it('produces one required direct_openvino_persistent source without fallback', async () => {
    const provider = new DiffusersProvider({ device: 'openvino_gpu', modelId: 'sd-1.5' });
    const registry = new ImageProviderRegistry();
    registry.register({ provider, local: true, priority: 100, costClass: 'local' });
    const result = await runAssetPipelineV2([{ id: 'openvino_probe', category: 'ability_icon', runtimeUse: 'teal dash icon', artDirection: 'ancient overgrown mechanical ruins, no text', seed: 920001, allowRealProvider: true, requireRealProvider: true, mode: 'LOCAL_ONLY' }], { registry });
    await provider.unloadOpenVinoRuntime();
    expect(result.summary.failed, JSON.stringify(result.summary.failed)).toEqual([]);
    expect(result.manifest[0]?.generationExecutionPath).toBe('direct_openvino_persistent');
  }, 1_200_000);
});
