import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DiffusersProvider } from '../packages/assets/src/providers/diffusers.js';

const output = resolve('test-artifacts/asset-pipeline-v2-local-preview/benchmark');
mkdirSync(output, { recursive: true });
const size = Number(process.env.METROFORGE_PREVIEW_SIZE ?? 128);
const steps = Number(process.env.METROFORGE_PREVIEW_STEPS ?? 2);
const count = Number(process.env.METROFORGE_PREVIEW_COUNT ?? 5);
process.env.METROFORGE_OPENVINO_STEPS = String(steps);
process.env.METROFORGE_OPENVINO_DEVICE = process.env.METROFORGE_OPENVINO_DEVICE ?? 'CPU';
process.env.METROFORGE_OPENVINO_DIAGNOSTIC_PATH = join(output, 'progress.jsonl');
const provider = new DiffusersProvider({ device: 'openvino_gpu', modelId: 'OpenVINO/stable-diffusion-v1-5-int8-ov', generationTimeoutMs: 900_000 });
const results: Array<Record<string, unknown>> = [];
for (let index = 0; index < count; index += 1) {
  const started = Date.now();
  try {
    const result = await provider.generateImage({ profile: 'CHARACTER', prompt: 'premium 2D side-view futuristic metro explorer, graphite protective suit, restrained cyan accents, clear silhouette, isolated full body, coherent game concept art, no text', negativePrompt: 'photorealism, watermark, typography, cropped body, duplicate limbs, cluttered background', width: size, height: size, seed: 960000 + index });
    const path = join(output, `preview-${size}-${steps}-${index + 1}.png`);
    writeFileSync(path, result.image);
    results.push({ index: index + 1, success: true, model: result.modelId, precision: 'int8_weights_fp32_compute', width: size, height: size, steps, scheduler: 'PNDM', device: process.env.METROFORGE_OPENVINO_DEVICE, wallMs: Date.now() - started, sourceHash: createHash('sha256').update(result.image).digest('hex'), path, executionMetadata: result.executionMetadata });
  } catch (error) {
    results.push({ index: index + 1, success: false, width: size, height: size, steps, wallMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
    break;
  }
  writeFileSync(join(output, 'results.json'), JSON.stringify({ generationProfile: 'local_preview', productionEligible: false, results }, null, 2));
}
await provider.unloadOpenVinoRuntime().catch(() => undefined);
writeFileSync(join(output, 'results.json'), JSON.stringify({ generationProfile: 'local_preview', productionEligible: false, results }, null, 2));
console.log(JSON.stringify({ generationProfile: 'local_preview', results }, null, 2));
