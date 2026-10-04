import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DiffusersProvider } from './diffusers.js';

describe('Diffusers worker timeout diagnostics', () => {
  it('keeps a failed worker exit code even when it prints startup progress', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'metroforge-crash-'));
    const worker = join(directory, 'worker.mjs');
    writeFileSync(
      worker,
      `process.stdin.resume();process.stdin.on('end',()=>{process.stderr.write('Loading pipeline components: 100%');process.exitCode=7;});`,
    );
    const provider = new DiffusersProvider({
      pythonPath: process.execPath,
      workerPath: worker,
      device: 'cuda',
    });
    try {
      await expect((provider as any).runWorker({}, { timeoutMs: 2500 })).rejects.toThrow(
        'exited with code 7: Loading pipeline components: 100%',
      );
    } finally {
      unlinkSync(worker);
      rmdirSync(directory);
    }
  });
  it('reports last numeric progress without private stderr and preserves successful responses', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'metroforge-timeout-'));
    const worker = join(directory, 'worker.mjs');
    writeFileSync(
      worker,
      `let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const p=JSON.parse(input);if(p.mode==='success'){console.log(JSON.stringify({ok:true}));return;}process.stderr.write('PRIVATE_TEST_MARKER /private/example\\n');if(p.mode==='progress'){process.stderr.write('Loading: 25%|xx| 1/4\\r');setTimeout(()=>process.stderr.write('Inference: 50%|xxxx| 14/28\\r'),50);}setInterval(()=>{},1000);});`,
    );
    const provider = new DiffusersProvider({
      pythonPath: process.execPath,
      workerPath: worker,
      device: 'cuda',
    });
    try {
      for (const mode of ['progress', 'silent']) {
        let message = '';
        try {
          await (provider as any).runWorker({ mode }, { timeoutMs: 2500 });
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).toContain('timed out after 2500ms');
        expect(message).toContain(
          mode === 'progress' ? '14/28 (50%)' : 'no worker progress reported',
        );
        expect(message).not.toContain('PRIVATE_TEST_MARKER');
        expect(message).not.toContain('/private/');
      }
      await expect(
        (provider as any).runWorker({ mode: 'success' }, { timeoutMs: 2500 }),
      ).resolves.toEqual({ ok: true });
    } finally {
      unlinkSync(worker);
      rmdirSync(directory);
    }
  }, 20000);
});
