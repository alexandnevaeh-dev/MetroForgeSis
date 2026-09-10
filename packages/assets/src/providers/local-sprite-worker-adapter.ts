import type { ImageGenRequest, ImageGenResult, ImageGenerator, ImageProviderHealthReport } from '../types/image-gen.js';
import { LocalSpriteWorkerProvider, type LocalSpriteWorkerConfig } from './local-sprite-worker.js';

/**
 * Adapts LocalSpriteWorkerProvider (its own richer, purpose-built interface — see
 * local-sprite-worker.ts's own doc comment for why it isn't ImageGenerator natively) onto the
 * generic ImageGenerator contract every other provider in ImageProviderRegistry implements, so
 * the real, existing generation pipeline (packages/assets/src/foundry/register.ts →
 * ImageProviderRegistry → asset-pipeline.ts) can actually select and call it — not just exercise
 * it as a standalone module.
 *
 * Honest, disclosed limitation of this adapter specifically: the underlying worker is a seeded
 * procedural generator, not a prompt-conditioned one. `request.prompt` is not sent to the worker
 * (it has no text-conditioning capability at all) — only width/height and a prompt-derived seed
 * are used, so two different prompts at the same seed produce the same sprite. This is disclosed
 * in the returned ImageGenResult via fallbackGenerated:false but selectedModel naming it plainly
 * as procedural, never presented as if it read the prompt.
 */
export class LocalSpriteWorkerImageAdapter implements ImageGenerator {
  readonly id = 'local-sprite-worker';
  private readonly worker: LocalSpriteWorkerProvider;

  constructor(config: LocalSpriteWorkerConfig = {}) {
    this.worker = new LocalSpriteWorkerProvider(config);
  }

  async checkHealth(): Promise<boolean> {
    const report = await this.getHealthReport();
    return report.status === 'HEALTHY';
  }

  async getHealthReport(): Promise<ImageProviderHealthReport> {
    const caps = await this.worker.getCapabilities();
    if (!caps.ok) {
      return { status: 'UNAVAILABLE', reason: caps.error ?? 'local sprite worker capability probe failed' };
    }
    if (!caps.dependenciesOk) {
      return { status: 'MISCONFIGURED', reason: `Pillow not importable: ${caps.dependencyError}` };
    }
    return { status: 'HEALTHY', reason: 'local procedural worker, no network/model dependency' };
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    // A prompt-derived seed keeps a given prompt deterministic across retries within one run
    // without pretending the text is actually read by the (non-text-conditioned) generator.
    const seed = request.seed ?? hashStringToSeed(request.prompt);
    const frameSize = Math.max(16, Math.min(64, Math.min(request.width, request.height)));
    // ImageGenerator.generateImage() is a "one prompt in, one image out" contract — every other
    // provider (NVIDIA, diffusers) returns a single still at request.width/height, and callers
    // (asset-pipeline.ts) derive walk/attack/hurt/death sheets FROM that still via their own
    // generateWalkCycleSheet()/etc. Requesting frameCount:4 here asked the worker for a real
    // 4-frame horizontal strip (frameSize*4 wide) and returned that whole strip as if it were a
    // single frameSize x frameSize portrait — every derived sheet then inherited a canvas showing
    // four tiny characters compressed into one corner instead of one character filling the frame
    // (found via a real top-down playtest screenshot: the player/NPC/enemy all rendered as a row
    // of miniature duplicates). frameCount:1 matches the single-portrait contract this method
    // actually promises; LocalSpriteWorkerProvider's own multi-frame character_sheet capability
    // is still available to any caller that wants a real sheet directly.
    const result = await this.worker.generate({
      kind: 'character_sheet',
      width: frameSize,
      height: frameSize,
      frameCount: 1,
      seed,
      fill: [176, 172, 158],
      accent: [92, 214, 224],
    }, request.signal);

    if (!result.ok || !result.imageBase64) {
      const detail = result.error?.message ?? result.subprocessFailure?.detail ?? 'unknown local-sprite-worker failure';
      throw new Error(`local-sprite-worker generation failed: ${detail}`);
    }

    return {
      image: Buffer.from(result.imageBase64, 'base64'),
      provider: this.id,
      modelId: result.modelId ?? 'metroforge-local-sprite-v1',
      seed,
      fallbackGenerated: false,
      productionAllowed: false, // a simple procedural placeholder shape, not production art
      selectedProvider: this.id,
      selectedModel: result.modelId,
    };
  }
}

function hashStringToSeed(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
