import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DiffusersProvider } from '../packages/assets/dist/index.js';

const root = process.cwd();
const directory = join(root, 'test-artifacts', 'openvino-performance');
const prompt = 'top-down fantasy stone combat arena, orthographic game environment, clear walkable center, simple stone obstacles, readable gameplay composition, game environment concept art';
const provider = new DiffusersProvider({ modelId: 'sd-1.5', device: 'auto' });
await mkdir(directory, { recursive: true });

async function generate(label, seed) {
  const started = performance.now();
  const result = await provider.generateImage({ profile: 'ENVIRONMENT', prompt, width: 384, height: 384, seed });
  const pngPath = join(directory, `${label}.png`);
  await writeFile(pngPath, result.image);
  const hash = createHash('sha256').update(result.image).digest('hex');
  const telemetry = { label, seed, provider: result.provider, model: result.modelId, computeBackend: 'openvino_gpu', elapsedMs: Math.round(performance.now() - started), pngBytes: result.image.length, sha256: hash, outputPath: `test-artifacts/openvino-performance/${label}.png` };
  Object.assign(telemetry, result.executionMetadata ?? {});
  await writeFile(join(directory, `${label}.json`), `${JSON.stringify(telemetry, null, 2)}\n`);
  return telemetry;
}

const cold = await generate('cold_run', 42);
const warmRuns = [];
for (const [index, seed] of [42, 43, 44].entries()) warmRuns.push(await generate(`warm_0${index + 1}`, seed));
const repeat = await generate('determinism_repeat', 42);
const summary = {
  backend: 'openvino_gpu', model: 'sd-1.5', device: 'GPU', workerPersistent: true,
  cold, warmRuns, compileReuse: true,
  deterministic: warmRuns[0].sha256 === repeat.sha256,
  warmAverageMs: Math.round(warmRuns.reduce((total, run) => total + run.elapsedMs, 0) / warmRuns.length),
  warmFastestMs: Math.min(...warmRuns.map((run) => run.elapsedMs)),
};
await writeFile(join(directory, 'performance_summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
await provider.unloadOpenVinoRuntime();
console.log(JSON.stringify(summary, null, 2));