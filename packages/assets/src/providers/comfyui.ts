import type { ImageGenerationProfile } from '../types/vision.js';
import type { ImageGenRequest, ImageGenResult, ImageGenerator } from '../types/image-gen.js';
import { mergeAbortSignal, throwIfCancelled } from '@metroforge/shared';
import { buildFluxWorkflow } from './comfyui-workflows.js';

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
    let uploadedImageName: string | undefined;
    if (request.conditioning) {
      uploadedImageName = await this.uploadReferenceImage(request.conditioning.image, request.signal);
    }
    const workflow = buildFluxWorkflow(request, seed, uploadedImageName);

    const queueRes = await fetch(`${this.config.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
      signal: mergeAbortSignal(request.signal, 120_000),
    });

    if (!queueRes.ok) {
      throw new Error(`ComfyUI queue failed: ${queueRes.status}`);
    }

    const { prompt_id } = (await queueRes.json()) as { prompt_id: string };
    const image = await this.pollForOutput(prompt_id, request.signal);
    return {
      image,
      provider: this.id,
      modelId: 'flux.1-schnell',
      seed,
      fallbackGenerated: false,
    };
  }

  private async pollForOutput(
    promptId: string,
    signal?: AbortSignal,
    maxAttempts = 60,
  ): Promise<Buffer> {
    for (let i = 0; i < maxAttempts; i++) {
      throwIfCancelled(signal);
      await sleep(2000);
      const histRes = await fetch(`${this.config.baseUrl}/history/${promptId}`, {
        signal: mergeAbortSignal(signal, 5000),
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
      const imgRes = await fetch(url, { signal: mergeAbortSignal(signal, 30_000) });
      if (!imgRes.ok) throw new Error('Failed to fetch ComfyUI output image');
      return Buffer.from(await imgRes.arrayBuffer());
    }
    throw new Error('ComfyUI generation timed out');
  }

  private async uploadReferenceImage(image: Buffer, signal?: AbortSignal): Promise<string> {
    const form = new FormData();
    form.append('image', new Blob([image], { type: 'image/png' }), 'metroforge_reference.png');
    form.append('overwrite', 'true');

    const res = await fetch(`${this.config.baseUrl}/upload/image`, {
      method: 'POST',
      body: form,
      signal: mergeAbortSignal(signal, 30_000),
    });
    if (!res.ok) {
      throw new Error(`ComfyUI image upload failed: ${res.status}`);
    }
    const data = (await res.json()) as { name?: string };
    if (!data.name) {
      throw new Error('ComfyUI image upload returned no filename');
    }
    return data.name;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
