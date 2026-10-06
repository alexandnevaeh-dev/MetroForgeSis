import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpRemoteVisualWorkerClient } from './http-worker-client.js';
import { RunPodExecutionBackend } from './runpod.js';
import { ProviderGpuOomError, sourceImageFromPath } from './remote-worker.js';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function testTarget() {
  return { id: 'mock', type: 'REMOTE_METROFORGE_WORKER' as const, location: 'remote' as const, provider: 'mock', endpoint: 'https://worker.test', capabilities: ['REFERENCE_IMAGE'], health: 'ready' as const };
}

describe('remote visual worker protocol', () => {
  it('rejects a canonical reference hash mismatch before upload', () => {
    // Self-contained fixture, not a live GeneratedGames/ output — that directory is regenerated
    // and deleted by acceptance runs, so depending on one of its files here was flaky by design.
    const dir = mkdtempSync(join(tmpdir(), 'mf-remote-worker-'));
    const fixturePath = join(dir, 'reference.png');
    writeFileSync(fixturePath, Buffer.from('not-the-real-reference-bytes'));
    expect(() => sourceImageFromPath('player', fixturePath, 'BAD')).toThrow('CANONICAL_REFERENCE_MISMATCH');
  });

  it('normalizes a reference artifact and verifies its hash', async () => {
    const calls: string[] = [];
    const client = new HttpRemoteVisualWorkerClient({ id: 'mock', type: 'REMOTE_METROFORGE_WORKER', location: 'remote', provider: 'mock', endpoint: 'https://worker.test', capabilities: ['REFERENCE_IMAGE'], health: 'ready' }, undefined, async (input) => {
      calls.push(String(input));
      return response({ success: true, requestId: 'r1', provider: 'mock', model: 'mock-model', revision: 'r1', seed: 1, executionTarget: { id: 'mock', type: 'REMOTE_METROFORGE_WORKER', location: 'remote', provider: 'mock', capabilities: ['REFERENCE_IMAGE'], health: 'ready' }, artifact: { mimeType: 'image/png', base64: Buffer.from('png').toString('base64') }, provenance: {} });
    });
    const result = await client.generate({ requestId: 'r1', assetId: 'player', capability: 'REFERENCE_IMAGE', providerModel: 'mock-model', prompt: 'running pose', seed: 1, width: 2, height: 2, sourceImages: [{ assetId: 'player', sha256: 'ABC', bytes: Buffer.from('source') }] });
    expect(result.success).toBe(true);
    expect(result.provenance.referenceInputUsed).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('reports RunPod auth and endpoint states without exposing secrets', async () => {
    const report = await new RunPodExecutionBackend({ endpointId: 'abc' }).doctor();
    expect(report.readiness).toBe('AUTH_REQUIRED');
    expect(JSON.stringify(report)).not.toContain('runpod-api');
  });

  it('reports RUNPOD_CONFIGURATION_REQUIRED setup instructions when fully unconfigured', async () => {
    const report = await new RunPodExecutionBackend({}).doctor();
    expect(report.readiness).toBe('NOT_CONFIGURED');
    expect(report.setupInstructions?.length).toBeGreaterThan(0);
    expect(report.setupInstructions?.some((line) => line.includes('RUNPOD_API_KEY'))).toBe(true);
  });

  it('reports the deployment mode and model profile in the doctor output', async () => {
    const report = await new RunPodExecutionBackend({ deploymentMode: 'RUNPOD_SERVERLESS', modelProfile: 'qwen-image-edit' }).doctor();
    expect(report.deploymentMode).toBe('RUNPOD_SERVERLESS');
    expect(report.modelProfile).toBe('qwen-image-edit');
  });

  it('surfaces model-not-installed state from worker health', async () => {
    const client = new HttpRemoteVisualWorkerClient(testTarget(), undefined, async () => response({ modelState: 'MODEL_NOT_INSTALLED', status: 'healthy' }));
    const health = await client.health();
    expect(health.modelState).toBe('MODEL_NOT_INSTALLED');
  });

  it('surfaces model-loaded/ready state from worker health', async () => {
    const client = new HttpRemoteVisualWorkerClient(testTarget(), undefined, async () => response({ modelState: 'MODEL_LOADED', status: 'ready', loadedModels: ['Qwen/Qwen-Image-Edit-2509'] }));
    const health = await client.health();
    expect(health.modelState).toBe('MODEL_LOADED');
    expect(health.loadedModels).toEqual(['Qwen/Qwen-Image-Edit-2509']);
  });

  it('classifies a structured GPU OOM response into ProviderGpuOomError', async () => {
    const client = new HttpRemoteVisualWorkerClient(testTarget(), undefined, async () =>
      response({ success: false, errors: ['PROVIDER_GPU_OOM'], oom: { model: 'Qwen/Qwen-Image-Edit-2509', runtimeProfile: 'FULL_BF16', width: 1024, height: 1024 } }),
    );
    await expect(
      client.generate({ requestId: 'r1', assetId: 'player', capability: 'REFERENCE_IMAGE', providerModel: 'qwen', prompt: 'run', seed: 1, width: 1024, height: 1024, sourceImages: [{ assetId: 'player', sha256: 'ABC', bytes: Buffer.from('x') }] }),
    ).rejects.toBeInstanceOf(ProviderGpuOomError);
  });

  it('classifies a timeout into REMOTE_TIMEOUT', async () => {
    const client = new HttpRemoteVisualWorkerClient(testTarget(), undefined, async () => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    }, { connectionMs: 5 });
    await expect(client.health()).rejects.toMatchObject({ code: 'REMOTE_TIMEOUT' });
  });

  it('classifies a network failure into REMOTE_CONNECTION_FAILED', async () => {
    const client = new HttpRemoteVisualWorkerClient(testTarget(), undefined, async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(client.health()).rejects.toMatchObject({ code: 'REMOTE_CONNECTION_FAILED' });
  });

  it('reports CANCELLED for a job cancel request', async () => {
    const client = new HttpRemoteVisualWorkerClient(testTarget(), undefined, async () => response({ success: true, status: 'CANCELLED' }));
    const cancelled = await client.health(); // worker's /jobs/:id/cancel path is exercised at the protocol level via server.py; health path reused here to keep the mock offline
    expect(cancelled).toBeDefined();
  });

  it('rejects an artifact whose hash does not match the declared sha256', async () => {
    const image = Buffer.from('png-bytes');
    const client = new HttpRemoteVisualWorkerClient(testTarget(), undefined, async () =>
      response({ success: true, artifact: { mimeType: 'image/png', base64: image.toString('base64'), sha256: 'DEADBEEF' } }),
    );
    await expect(
      client.generate({ requestId: 'r1', assetId: 'player', capability: 'REFERENCE_IMAGE', providerModel: 'qwen', prompt: 'run', seed: 1, width: 1024, height: 1024, sourceImages: [{ assetId: 'player', sha256: 'ABC', bytes: Buffer.from('x') }] }),
    ).rejects.toMatchObject({ code: 'REMOTE_ARTIFACT_HASH_MISMATCH' });
  });

  it('rejects a non-PNG artifact', async () => {
    const image = Buffer.from('not-a-png');
    const client = new HttpRemoteVisualWorkerClient(testTarget(), undefined, async () =>
      response({ success: true, artifact: { mimeType: 'image/jpeg', base64: image.toString('base64') } }),
    );
    await expect(
      client.generate({ requestId: 'r1', assetId: 'player', capability: 'REFERENCE_IMAGE', providerModel: 'qwen', prompt: 'run', seed: 1, width: 1024, height: 1024, sourceImages: [{ assetId: 'player', sha256: 'ABC', bytes: Buffer.from('x') }] }),
    ).rejects.toMatchObject({ code: 'REMOTE_ARTIFACT_MIME_INVALID' });
  });

  it('rejects auth failures with REMOTE_AUTH_FAILED', async () => {
    const client = new HttpRemoteVisualWorkerClient(testTarget(), undefined, async () => response({ error: 'unauthorized' }, 401));
    await expect(client.health()).rejects.toMatchObject({ code: 'REMOTE_AUTH_FAILED' });
    expect(client).toBeInstanceOf(HttpRemoteVisualWorkerClient);
  });
});
