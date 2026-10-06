import { DiffusersProvider } from '../packages/assets/dist/index.js';

const provider = new DiffusersProvider({ modelId: 'sd-1.5', device: 'auto' });
const warmup = await provider.warmupOpenVinoRuntime();
await provider.unloadOpenVinoRuntime();
console.log(JSON.stringify({ warmup, shutdown: 'PASS' }, null, 2));
