import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodePng } from '../png.js';
import type { ImageEditor, ImageEditResult } from '../types/image-edit.js';
import type { ImageGenerator, ImageGenResult } from '../types/image-gen.js';
import { loadAssetVersionIndex } from '../asset-versioning.js';
import { runVisualEnhancementPass } from './replace.js';
import type { AssetReplacementPlan } from './types.js';

/** A real, decodable PNG with genuine pixel variance (not blank/near-solid) so validateCandidate
 *  passes — a flat single-color buffer would correctly fail the "no visible subject" check. */
function fixturePng(width: number, height: number, opaque: boolean, variant = 0): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const shade = ((x * 37 + y * 61 + variant * 91) % 200) + 20;
    rgba[i * 4] = shade;
    rgba[i * 4 + 1] = Math.min(255, shade + 40);
    rgba[i * 4 + 2] = Math.min(255, shade + 80);
    rgba[i * 4 + 3] = opaque ? 255 : x < width / 2 ? 255 : 0;
  }
  return encodePng(width, height, rgba);
}

function blankPng(width: number, height: number): Buffer {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 10;
    rgba[i * 4 + 1] = 10;
    rgba[i * 4 + 2] = 10;
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(width, height, rgba);
}

function editPlan(overrides: Partial<AssetReplacementPlan> = {}): AssetReplacementPlan {
  return {
    projectSlug: 'test-slug',
    generationId: 'gen-1',
    assetId: 'player',
    family: 'player',
    role: 'player character',
    sourceAssetPath: 'assets/characters/player.png',
    sourceAssetKind: 'procedural-production',
    references: ['assets/characters/player.png'],
    dimensions: { width: 32, height: 32 },
    transparentBackground: true,
    preserveSilhouette: true,
    preservePose: true,
    preserveScale: true,
    preserveOrientation: true,
    priority: 'P0',
    replacementStrategy: 'edit-from-procedural-base',
    ...overrides,
  };
}

function genPlan(overrides: Partial<AssetReplacementPlan> = {}): AssetReplacementPlan {
  return {
    projectSlug: 'test-slug',
    generationId: 'gen-1',
    assetId: 'interactive_checkpoint',
    family: 'checkpoint',
    role: 'checkpoint shrine icon',
    sourceAssetKind: 'none',
    references: [],
    dimensions: { width: 32, height: 32 },
    transparentBackground: true,
    preserveSilhouette: false,
    preservePose: false,
    preserveScale: true,
    preserveOrientation: false,
    priority: 'P0',
    replacementStrategy: 'generate-from-spec',
    ...overrides,
  };
}

let storageRoot: string;

beforeEach(() => {
  storageRoot = mkdtempSync(join(tmpdir(), 'mf-visual-enhance-'));
  mkdirSync(join(storageRoot, 'assets', 'characters'), { recursive: true });
  writeFileSync(join(storageRoot, 'assets', 'characters', 'player.png'), fixturePng(32, 32, false));
});

afterEach(() => {
  rmSync(storageRoot, { recursive: true, force: true });
});

describe('runVisualEnhancementPass — edit-from-procedural-base', () => {
  it('alpha-reconciles a fully OPAQUE editor result (real NVIDIA/HF behavior) against the procedural source mask instead of rejecting it', async () => {
    // A fully opaque 32x32 — exactly what NVIDIA's hosted preview and most edit providers
    // actually return even when asked for a transparent background (see the Candidate 06C
    // report). Without alpha reconciliation this fails validateCandidate's
    // "expected transparent background but candidate is fully opaque" check outright.
    const editor: ImageEditor = {
      id: 'fake-opaque-editor',
      editImage: vi.fn(
        async (): Promise<ImageEditResult> => ({
          provider: 'fake-opaque-editor',
          model: 'some-edit-model',
          sourceAssetIds: ['player'],
          images: [{ buffer: fixturePng(32, 32, true, 4), mimeType: 'image/png', width: 32, height: 32 }],
          seed: 11,
          provenance: {
            provider: 'fake-opaque-editor',
            model: 'some-edit-model',
            capability: 'IMAGE_EDIT',
            sourceAssetIds: ['player'],
            instructionHash: 'x',
            generatedAt: new Date().toISOString(),
            nativeDimensions: { width: 32, height: 32 },
            source: 'image_edit',
          },
        }),
      ),
    };

    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [editPlan()],
      storageRoot,
      editor,
    });

    expect(summary.enhanced).toBe(1);
    expect(summary.outcomes[0]!.origin).toBe('AI_GENERATED_NVIDIA_NIM');
    // The activated file must still carry real transparency (reconciled from the source's alpha),
    // not the editor's fully-opaque bytes verbatim.
    const activated = readFileSync(join(storageRoot, 'assets', 'characters', 'player.png'));
    const { decodePngRgba } = await import('../png.js');
    const decoded = decodePngRgba(activated);
    let hasTransparentPixel = false;
    for (let i = 3; i < decoded.rgba.length; i += 4) {
      if (decoded.rgba[i]! < 200) {
        hasTransparentPixel = true;
        break;
      }
    }
    expect(hasTransparentPixel).toBe(true);
  });

  it('on success: stores a PENDING candidate, auto-accepts it, and overwrites the canonical Godot path', async () => {
    const editor: ImageEditor = {
      id: 'fake-nvidia-image-edit',
      editImage: vi.fn(
        async (): Promise<ImageEditResult> => ({
          provider: 'nvidia-image-edit',
          model: 'qwen/qwen-image-edit-2511',
          sourceAssetIds: ['player'],
          images: [{ buffer: fixturePng(32, 32, false, 1), mimeType: 'image/png', width: 32, height: 32 }],
          seed: 42,
          durationMs: 1200,
          provenance: {
            provider: 'nvidia-image-edit',
            model: 'qwen/qwen-image-edit-2511',
            capability: 'IMAGE_EDIT',
            sourceAssetIds: ['player'],
            instructionHash: 'abc',
            generatedAt: new Date().toISOString(),
            nativeDimensions: { width: 32, height: 32 },
            source: 'image_edit',
          },
        }),
      ),
    };

    const originalBytes = readFileSync(join(storageRoot, 'assets', 'characters', 'player.png'));
    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [editPlan()],
      storageRoot,
      editor,
    });

    expect(summary.enhanced).toBe(1);
    expect(summary.fallenBack).toBe(0);
    expect(summary.outcomes[0]!.origin).toBe('AI_GENERATED_NVIDIA_NIM');
    expect(summary.outcomes[0]!.activatedPath).toBe('assets/characters/player.png');
    expect(editor.editImage).toHaveBeenCalledTimes(1);

    const newBytes = readFileSync(join(storageRoot, 'assets', 'characters', 'player.png'));
    expect(newBytes.equals(originalBytes)).toBe(false);

    const index = loadAssetVersionIndex(storageRoot);
    const candidateId = summary.outcomes[0]!.candidateAssetId!;
    expect(index.versions[candidateId]?.status).toBe('ACTIVE');
    expect(index.activeVersions['player']).toBe(candidateId);
  });

  it('on provider failure: leaves the procedural baseline untouched and reports FALLBACK_ACTIVE with a reason', async () => {
    const editor: ImageEditor = {
      id: 'fake-nvidia-image-edit',
      editImage: vi.fn(async () => {
        throw new Error('NVIDIA NIM unreachable: fetch failed');
      }),
    };
    const originalBytes = readFileSync(join(storageRoot, 'assets', 'characters', 'player.png'));

    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [editPlan()],
      storageRoot,
      editor,
    });

    expect(summary.enhanced).toBe(0);
    expect(summary.fallenBack).toBe(1);
    const outcome = summary.outcomes[0]!;
    expect(outcome.origin).toBe('FALLBACK_ACTIVE');
    expect(outcome.attempted).toBe(true);
    expect(outcome.succeeded).toBe(false);
    expect(outcome.reason).toMatch(/unreachable/i);

    const unchangedBytes = readFileSync(join(storageRoot, 'assets', 'characters', 'player.png'));
    expect(unchangedBytes.equals(originalBytes)).toBe(true);
  });

  it('on invalid candidate (blank/near-solid image): fails validation, does not activate, leaves baseline in place', async () => {
    const editor: ImageEditor = {
      id: 'fake-nvidia-image-edit',
      editImage: vi.fn(
        async (): Promise<ImageEditResult> => ({
          provider: 'nvidia-image-edit',
          model: 'qwen/qwen-image-edit-2511',
          sourceAssetIds: ['player'],
          images: [{ buffer: blankPng(32, 32), mimeType: 'image/png', width: 32, height: 32 }],
          seed: 1,
          provenance: {
            provider: 'nvidia-image-edit',
            model: 'qwen/qwen-image-edit-2511',
            capability: 'IMAGE_EDIT',
            sourceAssetIds: ['player'],
            instructionHash: 'abc',
            generatedAt: new Date().toISOString(),
            nativeDimensions: { width: 32, height: 32 },
            source: 'image_edit',
          },
        }),
      ),
    };
    const originalBytes = readFileSync(join(storageRoot, 'assets', 'characters', 'player.png'));

    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [editPlan()],
      storageRoot,
      editor,
    });

    expect(summary.enhanced).toBe(0);
    expect(summary.fallenBack).toBe(1);
    expect(summary.outcomes[0]!.reason).toMatch(/validation failed/);
    expect(summary.outcomes[0]!.validation?.passed).toBe(false);

    const unchangedBytes = readFileSync(join(storageRoot, 'assets', 'characters', 'player.png'));
    expect(unchangedBytes.equals(originalBytes)).toBe(true);
  });

  it('when no baseline reference exists on disk, falls back without ever calling the editor', async () => {
    const editor: ImageEditor = { id: 'fake', editImage: vi.fn() };
    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [editPlan({ assetId: 'ghost', sourceAssetPath: 'assets/characters/ghost.png', references: ['assets/characters/ghost.png'] })],
      storageRoot,
      editor,
    });
    expect(editor.editImage).not.toHaveBeenCalled();
    expect(summary.outcomes[0]!.origin).toBe('FALLBACK_ACTIVE');
    expect(summary.outcomes[0]!.attempted).toBe(false);
  });
});

describe('runVisualEnhancementPass — generate-from-spec (checkpoint/pickup/gate)', () => {
  it('on success: writes a new asset under assets/generated/<family>/ and activates it', async () => {
    const generator: ImageGenerator = {
      id: 'fake-nvidia-image',
      checkHealth: vi.fn(async () => true),
      generateImage: vi.fn(
        async (): Promise<ImageGenResult> => ({
          image: fixturePng(32, 32, false),
          provider: 'nvidia-image',
          modelId: 'black-forest-labs/flux.1-dev',
          seed: 7,
          fallbackGenerated: false,
        }),
      ),
    };

    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [genPlan()],
      storageRoot,
      generator,
    });

    expect(summary.enhanced).toBe(1);
    const outcome = summary.outcomes[0]!;
    expect(outcome.origin).toBe('AI_GENERATED_NVIDIA_NIM');
    expect(outcome.activatedPath).toBe('assets/generated/checkpoint/interactive_checkpoint.png');
    expect(existsSync(join(storageRoot, outcome.activatedPath!))).toBe(true);
  });

  it('generate-from-spec with a canonical sourceAssetPath (backgrounds) activates onto that path, not assets/generated/', async () => {
    mkdirSync(join(storageRoot, 'assets', 'backgrounds', 'biome_0'), { recursive: true });
    const originalBytes = fixturePng(32, 32, false, 9);
    writeFileSync(join(storageRoot, 'assets', 'backgrounds', 'biome_0', 'far.png'), originalBytes);

    const generator: ImageGenerator = {
      id: 'pollinations-image',
      checkHealth: vi.fn(async () => true),
      generateImage: vi.fn(
        async (): Promise<ImageGenResult> => ({
          image: fixturePng(32, 32, false, 2),
          provider: 'pollinations-image',
          modelId: 'flux',
          seed: 3,
          fallbackGenerated: false,
        }),
      ),
    };

    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [
        genPlan({
          assetId: 'bg_biome_0_far',
          family: 'background',
          sourceAssetPath: 'assets/backgrounds/biome_0/far.png',
          transparentBackground: false,
        }),
      ],
      storageRoot,
      generator,
    });

    expect(summary.enhanced).toBe(1);
    const outcome = summary.outcomes[0]!;
    expect(outcome.activatedPath).toBe('assets/backgrounds/biome_0/far.png');
    const newBytes = readFileSync(join(storageRoot, 'assets', 'backgrounds', 'biome_0', 'far.png'));
    expect(newBytes.equals(originalBytes)).toBe(false);
    // Candidate history is still preserved non-destructively at its own path.
    expect(existsSync(join(storageRoot, outcome.candidatePath!))).toBe(true);
  });

  it('when the generator itself reports fallbackGenerated:true, treats it as a fallback, not a success', async () => {
    const generator: ImageGenerator = {
      id: 'fake-nvidia-image',
      checkHealth: vi.fn(async () => true),
      generateImage: vi.fn(
        async (): Promise<ImageGenResult> => ({
          image: fixturePng(32, 32, false),
          provider: 'procedural',
          modelId: 'none',
          seed: 0,
          fallbackGenerated: true,
          fallbackReason: 'all providers unavailable',
        }),
      ),
    };

    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [genPlan()],
      storageRoot,
      generator,
    });

    expect(summary.enhanced).toBe(0);
    expect(summary.outcomes[0]!.origin).toBe('FALLBACK_ACTIVE');
  });
});

describe('runVisualEnhancementPass — auto mode health gating', () => {
  it('skips every plan without attempting when providerHealthy is explicitly false', async () => {
    const editor: ImageEditor = { id: 'fake', editImage: vi.fn() };
    const summary = await runVisualEnhancementPass({
      visualMode: 'auto',
      plans: [editPlan()],
      storageRoot,
      editor,
      providerHealthy: false,
    });
    expect(editor.editImage).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
    expect(summary.outcomes[0]!.origin).toBe('FALLBACK_ACTIVE');
  });
});

describe('runVisualEnhancementPass — never throws', () => {
  it('an unexpected synchronous throw from the editor still resolves to a FALLBACK_ACTIVE outcome for that plan and continues to the next', async () => {
    const editor: ImageEditor = {
      id: 'fake',
      editImage: vi.fn(() => {
        throw new Error('synchronous boom');
      }) as unknown as ImageEditor['editImage'],
    };
    mkdirSync(join(storageRoot, 'assets', 'enemies'), { recursive: true });
    writeFileSync(join(storageRoot, 'assets', 'enemies', 'enemy_000.png'), fixturePng(32, 32, false));

    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [
        editPlan(),
        editPlan({
          assetId: 'enemy_000',
          family: 'enemy',
          sourceAssetPath: 'assets/enemies/enemy_000.png',
          references: ['assets/enemies/enemy_000.png'],
        }),
      ],
      storageRoot,
      editor,
    });

    expect(summary.outcomes).toHaveLength(2);
    expect(summary.outcomes.every((o) => o.origin === 'FALLBACK_ACTIVE')).toBe(true);
  });
});

describe('runVisualEnhancementPass — multi-provider chain (editorChain/generatorChain)', () => {
  it('falls through to the second provider when the first (higher-priority) one fails', async () => {
    const primaryCalls: string[] = [];
    const secondaryCalls: string[] = [];
    const generator1: ImageGenerator = {
      id: 'primary-provider',
      checkHealth: vi.fn(async () => true),
      generateImage: vi.fn(async () => {
        primaryCalls.push('call');
        throw new Error('HTTP 500 internal error');
      }),
    };
    const generator2: ImageGenerator = {
      id: 'secondary-provider',
      checkHealth: vi.fn(async () => true),
      generateImage: vi.fn(async () => {
        secondaryCalls.push('call');
        return {
          image: fixturePng(32, 32, false, 3),
          provider: 'secondary-provider',
          modelId: 'model-b',
          seed: 9,
          fallbackGenerated: false,
        };
      }),
    };

    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [genPlan()],
      storageRoot,
      generatorChain: [
        { providerId: 'primary-provider', capability: 'IMAGE_GENERATION', generator: generator1, priority: 0 },
        { providerId: 'secondary-provider', capability: 'IMAGE_GENERATION', generator: generator2, priority: 1 },
      ],
    });

    expect(primaryCalls).toHaveLength(1);
    expect(secondaryCalls).toHaveLength(1);
    expect(summary.enhanced).toBe(1);
    const outcome = summary.outcomes[0]!;
    expect(outcome.provider).toBe('secondary-provider');
    expect(outcome.attempts).toHaveLength(2);
    expect(outcome.attempts![0]!.succeeded).toBe(false);
    expect(outcome.attempts![0]!.failureCategory).toBe('SERVER_ERROR');
    expect(outcome.attempts![1]!.succeeded).toBe(true);
  });

  it('falls back to procedural when every provider in the chain fails', async () => {
    const generator1: ImageGenerator = {
      id: 'primary-provider',
      checkHealth: vi.fn(async () => true),
      generateImage: vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    };
    const generator2: ImageGenerator = {
      id: 'secondary-provider',
      checkHealth: vi.fn(async () => true),
      generateImage: vi.fn(async () => {
        throw new Error('unauthorized');
      }),
    };

    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [genPlan()],
      storageRoot,
      generatorChain: [
        { providerId: 'primary-provider', capability: 'IMAGE_GENERATION', generator: generator1, priority: 0 },
        { providerId: 'secondary-provider', capability: 'IMAGE_GENERATION', generator: generator2, priority: 1 },
      ],
    });

    expect(summary.enhanced).toBe(0);
    expect(summary.fallenBack).toBe(1);
    expect(summary.outcomes[0]!.origin).toBe('FALLBACK_ACTIVE');
    expect(summary.outcomes[0]!.attempts).toHaveLength(2);
  });

  it('the circuit breaker opens after repeated failures and skips the dead provider on later plans in the same run', async () => {
    let primaryAttempts = 0;
    const generator1: ImageGenerator = {
      id: 'flaky-provider',
      checkHealth: vi.fn(async () => true),
      generateImage: vi.fn(async () => {
        primaryAttempts++;
        throw new Error('gateway timeout');
      }),
    };
    let secondaryAttempts = 0;
    const generator2: ImageGenerator = {
      id: 'reliable-provider',
      checkHealth: vi.fn(async () => true),
      generateImage: vi.fn(async () => {
        secondaryAttempts++;
        return {
          image: fixturePng(32, 32, false, secondaryAttempts),
          provider: 'reliable-provider',
          modelId: 'model-b',
          seed: secondaryAttempts,
          fallbackGenerated: false,
        };
      }),
    };

    const chain = [
      { providerId: 'flaky-provider', capability: 'IMAGE_GENERATION' as const, generator: generator1, priority: 0 },
      { providerId: 'reliable-provider', capability: 'IMAGE_GENERATION' as const, generator: generator2, priority: 1 },
    ];

    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [
        genPlan({ assetId: 'interactive_checkpoint', family: 'checkpoint' }),
        genPlan({ assetId: 'interactive_ability_pickup', family: 'pickup' }),
        genPlan({ assetId: 'interactive_ability_gate', family: 'gate' }),
      ],
      storageRoot,
      generatorChain: chain,
      circuitBreakerConfig: { failureThreshold: 2, resetAfterMs: 60_000 },
    });

    // flaky-provider fails plan 1 and plan 2 (2 consecutive failures -> circuit opens), then is
    // skipped entirely for plan 3 — never attempted a 3rd time.
    expect(primaryAttempts).toBe(2);
    expect(secondaryAttempts).toBe(3);
    expect(summary.enhanced).toBe(3);
    const thirdPlanAttempts = summary.outcomes[2]!.attempts!;
    expect(thirdPlanAttempts.find((a) => a.providerId === 'flaky-provider')?.reason).toMatch(/circuit open/);
  });

  it('bounds a provider that never resolves via requestTimeoutMs, without hanging the pass', async () => {
    const hangingGenerator: ImageGenerator = {
      id: 'hanging-provider',
      checkHealth: vi.fn(async () => true),
      generateImage: vi.fn(() => new Promise<ImageGenResult>(() => {})), // never resolves
    };
    const fallbackGenerator: ImageGenerator = {
      id: 'fast-provider',
      checkHealth: vi.fn(async () => true),
      generateImage: vi.fn(async () => ({
        image: fixturePng(32, 32, false, 5),
        provider: 'fast-provider',
        modelId: 'model-c',
        seed: 5,
        fallbackGenerated: false,
      })),
    };

    const started = Date.now();
    const summary = await runVisualEnhancementPass({
      visualMode: 'nvidia-enhanced',
      plans: [genPlan()],
      storageRoot,
      generatorChain: [
        { providerId: 'hanging-provider', capability: 'IMAGE_GENERATION', generator: hangingGenerator, priority: 0 },
        { providerId: 'fast-provider', capability: 'IMAGE_GENERATION', generator: fallbackGenerator, priority: 1 },
      ],
      executionPolicy: { requestTimeoutMs: 300, totalProviderBudgetMs: 5000, maxAttemptsPerProvider: 1 },
    });
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(3000); // did not wait for the hanging provider to ever resolve
    expect(summary.enhanced).toBe(1);
    expect(summary.outcomes[0]!.provider).toBe('fast-provider');
    expect(summary.outcomes[0]!.attempts![0]!.failureCategory).toBe('TIMEOUT');
  }, 10000);
});
