import { join, resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// All tests in this file are MOCKED at the node:child_process boundary — no real python3
// subprocess is spawned here. The real, unmocked end-to-end run lives in
// local-sprite-worker.e2e.test.ts (skipped unless a real python3+Pillow is present) and in this
// pass's own disclosed manual run (docs/asset-pipeline/LOCAL_SPRITE_WORKER.md).
class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() });
  killed = false;
  kill = vi.fn((_signal?: string) => { this.killed = true; });
}

let fakeChild: FakeChildProcess;
const spawnMock = vi.fn((..._args: unknown[]) => fakeChild);

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: () => true };
});

describe('LocalSpriteWorkerProvider — mocked subprocess boundary', () => {
  beforeEach(() => {
    fakeChild = new FakeChildProcess();
    spawnMock.mockClear();
  });

  it('uses the packaged resource root for the default worker', async () => {
    const prior = process.env.METROFORGE_RESOURCE_ROOT;
    const root = resolve('E:/Metroforge/packaged-resources');
    process.env.METROFORGE_RESOURCE_ROOT = root;
    try {
      const { LocalSpriteWorkerProvider } = await import('./local-sprite-worker.js');
      const pending = new LocalSpriteWorkerProvider({ pythonPath: 'configured-python' }).getCapabilities();
      expect(spawnMock).toHaveBeenCalledWith('configured-python', [join(root, 'workers', 'local_sprite_worker.py')], expect.any(Object));
      fakeChild.stdout.emit('data', Buffer.from(JSON.stringify({ ok: true })));
      fakeChild.emit('close', 0);
      expect((await pending).ok).toBe(true);
    } finally {
      if (prior === undefined) delete process.env.METROFORGE_RESOURCE_ROOT;
      else process.env.METROFORGE_RESOURCE_ROOT = prior;
    }
  });
  it('spawns python via an argument array, never a shell string, and writes the request as JSON to stdin', async () => {
    const { LocalSpriteWorkerProvider } = await import('./local-sprite-worker.js');
    const provider = new LocalSpriteWorkerProvider({ pythonPath: 'python3', workerPath: '/fake/worker.py' });
    const pending = provider.generate({ kind: 'character_sheet', width: 32, height: 32, frameCount: 4, seed: 1, fill: [1, 2, 3], accent: [4, 5, 6] });

    // spawn() must receive python + [scriptPath] — no interpolated shell command string.
    expect(spawnMock).toHaveBeenCalledWith('python3', ['/fake/worker.py'], expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }));
    expect(fakeChild.stdin.write).toHaveBeenCalledWith(expect.stringContaining('"kind":"character_sheet"'));

    fakeChild.stdout.emit('data', Buffer.from(JSON.stringify({ ok: true, provider: 'local-procedural-sprite-worker', width: 128, height: 32, frameRects: [{ x: 0, y: 0, width: 32, height: 32 }] })));
    fakeChild.emit('close', 0);
    const result = await pending;
    expect(result.ok).toBe(true);
  });

  it('reports a structured NONZERO_EXIT failure when the worker exits non-zero, using stderr as the diagnostic — never crashes the caller', async () => {
    const { LocalSpriteWorkerProvider } = await import('./local-sprite-worker.js');
    const provider = new LocalSpriteWorkerProvider({ pythonPath: 'python3', workerPath: '/fake/worker.py' });
    const pending = provider.generate({ kind: 'character_sheet', width: 32, height: 32, frameCount: 4, seed: 1, fill: [1, 2, 3], accent: [4, 5, 6] });

    fakeChild.stderr.emit('data', Buffer.from('Traceback: something real broke\n'));
    fakeChild.emit('close', 1);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.subprocessFailure?.reason).toBe('NONZERO_EXIT');
    expect(result.subprocessFailure?.detail).toContain('something real broke');
  });

  it('reports a structured SPAWN_ERROR when the interpreter itself cannot be launched', async () => {
    const { LocalSpriteWorkerProvider } = await import('./local-sprite-worker.js');
    const provider = new LocalSpriteWorkerProvider({ pythonPath: 'python3', workerPath: '/fake/worker.py' });
    const pending = provider.generate({ kind: 'character_sheet', width: 32, height: 32, frameCount: 4, seed: 1, fill: [1, 2, 3], accent: [4, 5, 6] });

    fakeChild.emit('error', new Error('ENOENT: python3 not found'));
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.subprocessFailure?.reason).toBe('SPAWN_ERROR');
    expect(result.subprocessFailure?.detail).toContain('ENOENT');
  });

  it('kills the subprocess and reports TIMEOUT when the worker never responds in time', async () => {
    vi.useFakeTimers();
    const { LocalSpriteWorkerProvider } = await import('./local-sprite-worker.js');
    const provider = new LocalSpriteWorkerProvider({ pythonPath: 'python3', workerPath: '/fake/worker.py', timeoutMs: 50 });
    const pending = provider.generate({ kind: 'character_sheet', width: 32, height: 32, frameCount: 4, seed: 1, fill: [1, 2, 3], accent: [4, 5, 6] });

    await vi.advanceTimersByTimeAsync(60);
    const result = await pending;
    expect(fakeChild.kill).toHaveBeenCalledWith('SIGKILL');
    expect(result.ok).toBe(false);
    expect(result.subprocessFailure?.reason).toBe('TIMEOUT');
    vi.useRealTimers();
  });

  it('kills the subprocess and reports CANCELLED when the caller aborts', async () => {
    const { LocalSpriteWorkerProvider } = await import('./local-sprite-worker.js');
    const provider = new LocalSpriteWorkerProvider({ pythonPath: 'python3', workerPath: '/fake/worker.py' });
    const controller = new AbortController();
    const pending = provider.generate({ kind: 'character_sheet', width: 32, height: 32, frameCount: 4, seed: 1, fill: [1, 2, 3], accent: [4, 5, 6] }, controller.signal);

    controller.abort();
    const result = await pending;
    expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM');
    expect(result.ok).toBe(false);
    expect(result.subprocessFailure?.reason).toBe('CANCELLED');
  });

  it('reports a structured BAD_JSON failure instead of throwing when stdout is not valid JSON', async () => {
    const { LocalSpriteWorkerProvider } = await import('./local-sprite-worker.js');
    const provider = new LocalSpriteWorkerProvider({ pythonPath: 'python3', workerPath: '/fake/worker.py' });
    const pending = provider.generate({ kind: 'character_sheet', width: 32, height: 32, frameCount: 4, seed: 1, fill: [1, 2, 3], accent: [4, 5, 6] });

    fakeChild.stdout.emit('data', Buffer.from('not json at all'));
    fakeChild.emit('close', 0);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.subprocessFailure?.reason).toBe('BAD_JSON');
  });
});

describe('buildLocalCharacterSheetManifest — manifest validation', () => {
  it('builds a real versioned manifest from a valid generation result', async () => {
    const { buildLocalCharacterSheetManifest } = await import('../local-asset-manifest.js');
    const manifest = buildLocalCharacterSheetManifest(
      'test_char',
      'assets/characters/test_char_walk.png',
      {
        ok: true, provider: 'local-procedural-sprite-worker', modelId: 'metroforge-local-sprite-v1', seed: 7,
        width: 192, height: 32, frameWidth: 32, frameHeight: 32, frameCount: 6,
        frameRects: Array.from({ length: 6 }, (_, i) => ({ x: i * 32, y: 0, width: 32, height: 32 })),
        license: 'MetroForge internally authored procedural generator (original work)',
        requiresNetwork: false, requiresPayment: false,
      },
      { width: 32, height: 32, frameCount: 6, seed: 7 },
    );
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.frameRects).toHaveLength(6);
    expect(manifest.animations[0]).toEqual({ name: 'walk', frameIndices: [0, 1, 2, 3, 4, 5], fps: 8, loop: true });
    expect(manifest.requiresNetwork).toBe(false);
    expect(manifest.requiresPayment).toBe(false);
  });

  it('throws ManifestValidationError instead of writing a manifest for a failed generation', async () => {
    const { buildLocalCharacterSheetManifest, ManifestValidationError } = await import('../local-asset-manifest.js');
    expect(() =>
      buildLocalCharacterSheetManifest('bad', 'x.png', { ok: false, provider: 'local-procedural-sprite-worker', error: { code: 'INVALID_INPUT', message: 'bad fill' } }, {}),
    ).toThrow(ManifestValidationError);
  });

  it('throws ManifestValidationError when a nominally-ok result is missing required dimension fields', async () => {
    const { buildLocalCharacterSheetManifest, ManifestValidationError } = await import('../local-asset-manifest.js');
    expect(() =>
      buildLocalCharacterSheetManifest('bad2', 'x.png', { ok: true, provider: 'local-procedural-sprite-worker' } as never, {}),
    ).toThrow(ManifestValidationError);
  });
});
