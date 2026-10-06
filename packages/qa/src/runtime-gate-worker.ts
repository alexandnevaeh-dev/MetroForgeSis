import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getResourceRoot } from '@metroforge/shared';
import type { QAGateResult } from './validator.js';

export type RuntimeGateMethod = 'validateGodotHeadless' | 'validateGodotRuntime'
  | 'validateGameplayScreenshot' | 'validateGodotPlaytest';

/** Keep synchronous native-engine checks off the desktop main thread.
 * The module override is an internal test seam, never supplied by renderer input.
 * Existing synchronous validator methods remain available to CLI callers. */
export function runRuntimeGateAsync(
  method: RuntimeGateMethod,
  args: unknown[],
  validatorModulePath = join(getResourceRoot(), 'packages', 'qa', 'dist', 'validator.js'),
): Promise<QAGateResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      import(workerData.moduleUrl).then(async ({ QAValidator }) => {
        const gate = await new QAValidator()[workerData.method](...workerData.args);
        parentPort.postMessage(gate);
      }).catch(error => { throw error; });
    `, { eval: true, workerData: { method, args, moduleUrl: pathToFileURL(validatorModulePath).href } });
    let result: QAGateResult | undefined;
    worker.once('message', (gate: QAGateResult) => {
      result = gate;
    });
    worker.once('error', reject);
    worker.once('exit', code => {
      if (code === 0 && result) resolve(result);
      else reject(new Error(`Runtime validation worker exited without a clean result (${code})`));
    });
  });
}
