import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DiffusersProvider } from '../packages/assets/dist/index.js';

const root = process.cwd();
const outputDirectory = join(root, 'test-artifacts', 'openvino-diffusion');
const outputPath = join(outputDirectory, 'openvino_sd15_provider_gpu_384.png');
const directTelemetryPath = join(outputDirectory, 'openvino_sd15_direct_gpu_384.json');

await mkdir(outputDirectory, { recursive: true });
const startedAt = performance.now();
const provider = new DiffusersProvider({
  modelId: 'sd-1.5',
  device: 'openvino_gpu',
  gpuTimeoutMs: 420000,
});
const result = await provider.generateImage({
  profile: 'ENVIRONMENT',
  prompt: 'top-down fantasy stone combat arena, orthographic game environment, clear walkable center, simple stone obstacles, readable gameplay composition, game environment concept art',
  width: 384,
  height: 384,
  seed: 42,
});
await writeFile(outputPath, result.image);
const directTelemetry = JSON.parse(await readFile(directTelemetryPath, 'utf8'));
const telemetry = {
  provider: result.provider,
  model: result.modelId,
  computeBackend: 'openvino_gpu',
  actualDevice: directTelemetry.actualDevice,
  executionPath: directTelemetry.executionPath,
  seed: result.seed,
  width: 384,
  height: 384,
  steps: directTelemetry.steps,
  inferenceMs: directTelemetry.unetTotalInferenceMs,
  providerTotalMs: Math.round(performance.now() - startedAt),
  outputPath: 'test-artifacts/openvino-diffusion/openvino_sd15_provider_gpu_384.png',
  pngBytes: result.image.length,
};
await writeFile(join(outputDirectory, 'openvino_sd15_provider_gpu_384.json'), `${JSON.stringify(telemetry, null, 2)}\n`);
console.log(JSON.stringify(telemetry, null, 2));