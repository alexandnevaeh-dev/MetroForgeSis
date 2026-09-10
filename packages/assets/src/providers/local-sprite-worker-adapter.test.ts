import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Mocked at the node:child_process boundary, same convention as local-sprite-worker.test.ts —
// no real python3 subprocess is spawned here.
class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = { write: vi.fn(), end: vi.fn() };
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

// A tiny (1x1) real PNG, standing in for whatever image bytes the worker actually returns —
// these tests assert the *request* this adapter sends, not the worker's own pixel output
// (that's local_sprite_worker.py's own responsibility, covered separately).
const FAKE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('LocalSpriteWorkerImageAdapter.generateImage — ImageGenerator contract', () => {
  beforeEach(() => {
    fakeChild = new FakeChildProcess();
    spawnMock.mockClear();
  });

  it('requests exactly one frame from the worker, not a multi-frame sheet', async () => {
    // Regression for a real bug: this adapter used to hardcode frameCount:4, so the worker
    // returned a real 4-frame horizontal strip (frameSize*4 wide) and this method handed that
    // whole strip back as if it were a single frameSize x frameSize portrait. Every sheet
    // asset-pipeline.ts later derived from that "still" (walk/attack/hurt/death) inherited a
    // canvas with four tiny characters crammed into one corner instead of one character filling
    // the frame — reproduced directly via a fresh top-down generation and confirmed in the real
    // player.png/player_walk.png output before this fix. ImageGenerator.generateImage() is a
    // "one prompt in, one image out" contract (see this file's own class doc comment) — every
    // other provider (NVIDIA, diffusers) returns a single still, and callers build animation
    // sheets FROM that still themselves.
    const { LocalSpriteWorkerImageAdapter } = await import('./local-sprite-worker-adapter.js');
    const adapter = new LocalSpriteWorkerImageAdapter({ pythonPath: 'python3', workerPath: '/fake/worker.py' });

    const pending = adapter.generateImage({
      profile: 'VISUAL_VERTICAL_SLICE' as never,
      prompt: 'a lone scout',
      width: 64,
      height: 64,
    });

    const sentPayload = JSON.parse(fakeChild.stdin.write.mock.calls[0][0] as string);
    expect(sentPayload.kind).toBe('character_sheet');
    expect(sentPayload.frameCount).toBe(1);
    expect(sentPayload.width).toBe(64);
    expect(sentPayload.height).toBe(64);

    fakeChild.stdout.emit('data', Buffer.from(JSON.stringify({
      ok: true,
      provider: 'local-procedural-sprite-worker',
      modelId: 'metroforge-local-sprite-v1',
      seed: 1,
      imageBase64: FAKE_PNG_BASE64,
      width: 64,
      height: 64,
      frameWidth: 64,
      frameHeight: 64,
      frameCount: 1,
    })));
    fakeChild.emit('close', 0);

    const result = await pending;
    expect(result.provider).toBe('local-sprite-worker');
    expect(result.productionAllowed).toBe(false);
    expect(result.image.equals(Buffer.from(FAKE_PNG_BASE64, 'base64'))).toBe(true);
  });

  it('clamps the requested frame size to [16, 64] regardless of the caller-requested dimensions', async () => {
    const { LocalSpriteWorkerImageAdapter } = await import('./local-sprite-worker-adapter.js');
    const adapter = new LocalSpriteWorkerImageAdapter({ pythonPath: 'python3', workerPath: '/fake/worker.py' });

    const pending = adapter.generateImage({
      profile: 'VISUAL_VERTICAL_SLICE' as never,
      prompt: 'a boss',
      width: 256,
      height: 256,
    });

    const sentPayload = JSON.parse(fakeChild.stdin.write.mock.calls[0][0] as string);
    expect(sentPayload.frameCount).toBe(1);
    expect(sentPayload.width).toBe(64);
    expect(sentPayload.height).toBe(64);

    fakeChild.stdout.emit('data', Buffer.from(JSON.stringify({
      ok: true, provider: 'local-procedural-sprite-worker', imageBase64: FAKE_PNG_BASE64,
    })));
    fakeChild.emit('close', 0);
    await pending;
  });
});
