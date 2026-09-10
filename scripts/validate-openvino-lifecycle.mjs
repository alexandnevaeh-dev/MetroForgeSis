import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DiffusersProvider } from '../packages/assets/dist/index.js';

const prompt = 'top-down fantasy stone combat arena, orthographic game environment, clear walkable center, simple stone obstacles, readable gameplay composition, game environment concept art';
const provider = new DiffusersProvider({ modelId: 'sd-1.5', device: 'auto' });
const request = { profile: 'ENVIRONMENT', prompt, width: 384, height: 384, seed: 42 };
const outputPath = join(process.cwd(), 'test-artifacts', 'openvino-performance', 'lifecycle.json');
await mkdir(join(process.cwd(), 'test-artifacts', 'openvino-performance'), { recursive: true });
const evidence = {};
const save = async () => writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);

try {
  evidence.firstWarmup = await provider.warmupOpenVinoRuntime(); await save();
  evidence.first = (await provider.generateImage(request)).executionMetadata; await save();
  await provider.unloadOpenVinoRuntime();
  evidence.healthAfterUnload = await provider.getHealthReport(); await save();
  evidence.secondWarmup = await provider.warmupOpenVinoRuntime(); await save();
  evidence.rewarm = (await provider.generateImage(request)).executionMetadata; await save();
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error); await save(); throw error;
} finally {
  await provider.unloadOpenVinoRuntime().catch(() => undefined);
}
console.log(JSON.stringify(evidence, null, 2));