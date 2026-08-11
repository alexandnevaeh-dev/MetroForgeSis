import type { ImageGenerationProfile } from '../types/vision.js';
import type { ImageGenRequest, ImageGenResult, ImageGenerator } from '../types/image-gen.js';
import { profilePrefix } from '../types/prompts.js';

export type { ImageGenerationProfile, ImageGenRequest, ImageGenResult };

export interface ComfyUIConfig {
  baseUrl: string;
  enabled?: boolean;
}

/** ComfyUI HTTP API adapter — uses a minimal txt2img workflow */
export class ComfyUIProvider implements ImageGenerator {
  id = 'comfyui';
  private enabled: boolean;

  constructor(private readonly config: ComfyUIConfig) {
    this.enabled = config.enabled ?? true;
  }

  async checkHealth(): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const res = await fetch(`${this.config.baseUrl}/system_stats`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async generateImage(request: ImageGenRequest): Promise<ImageGenResult> {
    const seed = request.seed ?? Math.floor(Math.random() * 2 ** 31);
    const workflow = buildFluxWorkflow(request, seed);

    const queueRes = await fetch(`${this.config.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
      signal: AbortSignal.timeout(120000),
    });

    if (!queueRes.ok) {
      throw new Error(`ComfyUI queue failed: ${queueRes.status}`);
    }

    const { prompt_id } = (await queueRes.json()) as { prompt_id: string };
    const image = await this.pollForOutput(prompt_id);
    return {
      image,
      provider: this.id,
      modelId: 'flux.1-schnell',
      seed,
      fallbackGenerated: false,
    };
  }

  private async pollForOutput(promptId: string, maxAttempts = 60): Promise<Buffer> {
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(2000);
      const histRes = await fetch(`${this.config.baseUrl}/history/${promptId}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!histRes.ok) continue;

      const history = (await histRes.json()) as Record<
        string,
        { outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> }
      >;
      const entry = history[promptId];
      const images = entry?.outputs?.['9']?.images ?? Object.values(entry?.outputs ?? {})[0]?.images;
      if (!images?.[0]) continue;

      const img = images[0];
      const url = `${this.config.baseUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`;
      const imgRes = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!imgRes.ok) throw new Error('Failed to fetch ComfyUI output image');
      return Buffer.from(await imgRes.arrayBuffer());
    }
    throw new Error('ComfyUI generation timed out');
  }
}

function buildFluxWorkflow(request: ImageGenRequest, seed: number): Record<string, unknown> {
  const stylePrefix = profilePrefix(request.profile);
  return {
    '3': { class_type: 'KSampler', inputs: { seed, steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-schnell.safetensors' } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: request.width, height: request.height, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: `${stylePrefix} ${request.prompt}`, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: request.negativePrompt ?? 'blurry, low quality, text, watermark', clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'metroforge', images: ['8', 0] } },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
