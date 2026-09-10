import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { DiffusersProvider, parseOpenVinoWorkerLine } from './diffusers.js';

describe('DiffusersProvider persistent OpenVINO listener ownership', () => {
  it('keeps request-owned exit/error listeners bounded across 20 successful requests and shutdown', async () => {
    const provider = new DiffusersProvider({ device: 'openvino_gpu', modelId: 'sd-1.5' });
    const server = new EventEmitter() as EventEmitter & { killed: boolean; kill(): void; stdin: { write(text: string): void } };
    server.killed = false;
    server.kill = () => { server.killed = true; server.emit('exit', 0); };
    server.stdin = { write: () => queueMicrotask(() => (provider as any).openvinoPending?.resolve({ ok: true, image_base64: 'iVBORw0KGgo=', execution_path: 'direct_openvino_persistent' })) };
    // One permanent exit listener belongs to the persistent worker lifecycle.
    server.on('exit', () => { (provider as any).openvinoServer = undefined; });
    (provider as any).openvinoServer = server;
    for (let i = 0; i < 20; i++) {
      await (provider as any).runOpenVinoServer({ action: 'generate' }, { timeoutMs: 1000 });
      expect(server.listenerCount('exit')).toBe(1);
      expect(server.listenerCount('error')).toBe(0);
    }
    await provider.unloadOpenVinoRuntime();
    expect(server.listenerCount('exit')).toBe(1);
    expect(server.listenerCount('error')).toBe(0);
    expect((provider as any).openvinoServer).toBeUndefined();
  });

  it('does not lose a pending response when native runtime chatter precedes JSON', async () => {
    const provider = new DiffusersProvider({ device: 'openvino_gpu' });
    const stdout = new PassThrough();
    const server = new EventEmitter() as EventEmitter & { killed: boolean; stdout: PassThrough; stderr: PassThrough; kill(): void; stdin: { write(text: string): void } };
    server.killed = false; server.stdout = stdout; server.stderr = new PassThrough();
    server.kill = () => { server.killed = true; };
    server.stdin = { write: () => queueMicrotask(() => { stdout.write('OpenVINO GPU plugin cache notice\n'); stdout.write('{"ok":true,"image_base64":"valid"}\n'); }) };
    (provider as any).getOpenVinoServer = DiffusersProvider.prototype['getOpenVinoServer'].bind(provider);
    // Inject a spawn-compatible server by setting it before getOpenVinoServer; install the same
    // protocol reader explicitly because spawn itself is intentionally not mocked.
    const lines = (await import('node:readline')).createInterface({ input: stdout });
    lines.on('line', (line) => {
      const pending = (provider as any).openvinoPending; if (!pending) return;
      const response = parseOpenVinoWorkerLine(line); if (!response) return;
      (provider as any).openvinoPending = undefined; pending.resolve(response);
    });
    server.on('exit', () => undefined); (provider as any).openvinoServer = server;
    const response = await (provider as any).runOpenVinoServer({ action: 'generate' }, { timeoutMs: 1000 });
    expect(response.ok).toBe(true); expect(response.image_base64).toBe('valid');
    lines.close();
  });

  it('accepts only complete protocol objects', () => {
    expect(parseOpenVinoWorkerLine('OpenVINO cache notice')).toBeUndefined();
    expect(parseOpenVinoWorkerLine('{"status":"loading"}')).toBeUndefined();
    expect(parseOpenVinoWorkerLine('{"ok":true,"image_base64":"png"}')).toMatchObject({ ok: true });
  });
});
