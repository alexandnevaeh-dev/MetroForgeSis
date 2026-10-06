/** Explicit local NVIDIA material study; private E: output until visual admission. */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { DiffusersProvider } from '../packages/assets/dist/providers/diffusers.js';
const output = resolve(process.argv[2]);
if (!process.argv[2] || !/^E:[\\/]/i.test(output) || existsSync(output))
  throw Error('Use a fresh E: output');
mkdirSync(output, { recursive: true });
const provider = new DiffusersProvider({
  pythonPath: 'E:/MetroForgeData/Python/diffusers-native/Scripts/python.exe',
  modelId: 'E:/Metroforge/Recovery-Audit/models/sdxl-base-1.0',
  device: 'cuda',
  gpuTimeoutMs: 600000,
});
const request = {
  prompt:
    'Pixel art gothic castle interior wall module, flat side elevation, dark blue stone, recessed narrow arches, brass trim, teal glass, repeating masonry, orthographic, no floor, no perspective.',
  negativePrompt: 'perspective, floor, stairs, people, text, watermark, blurry',
  width: 1024,
  height: 576,
  seed: 104804,
  inferenceSteps: 20,
};
writeFileSync(join(output, 'request.json'), JSON.stringify(request, null, 2));
try {
  const result = await provider.generateImage(request);
  writeFileSync(join(output, 'wall-study.png'), result.image);
  const { image, ...metadata } = result;
  writeFileSync(
    join(output, 'receipt.json'),
    JSON.stringify(
      {
        ...metadata,
        sha256: createHash('sha256').update(image).digest('hex'),
        productionApproved: false,
        scope:
          'Fresh real CUDA inference; material study requires visual review before game admission.',
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ output, execution: result.executionMetadata, productionApproved: false }),
  );
} catch (error) {
  writeFileSync(
    join(output, 'failure.json'),
    JSON.stringify({ error: String(error), productionApproved: false }),
  );
  throw error;
}
