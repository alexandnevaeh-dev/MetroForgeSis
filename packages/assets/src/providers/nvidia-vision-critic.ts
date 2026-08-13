import type { AssetCritiqueRequest } from '../vlm-critic.js';
import type { VisionAnalysisResponse } from '../types/vision.js';
import { deterministicCritique } from '../vision-critic-shared.js';

export interface NvidiaVisionCriticConfig {
  apiKey?: string;
  baseUrl?: string;
  modelId?: string;
}

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_VISION_MODEL = 'meta/llama-3.2-11b-vision-instruct';

/** NVIDIA NIM vision critique via OpenAI-compatible chat/completions with image content. */
export class NvidiaVisionCritic {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly modelId: string;

  constructor(config: NvidiaVisionCriticConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.NVIDIA_API_KEY;
    this.baseUrl = (config.baseUrl ?? process.env.NVIDIA_API_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/$/,
      '',
    );
    this.modelId = config.modelId ?? process.env.NVIDIA_VISION_MODEL ?? DEFAULT_VISION_MODEL;
  }

  backendId(): string {
    return 'nvidia-vision';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async critique(request: AssetCritiqueRequest): Promise<VisionAnalysisResponse> {
    if (!this.apiKey) {
      return deterministicCritique(request);
    }

    const base64 = request.image.toString('base64');
    const prompt = `You are a game asset QA critic. Analyze this ${request.assetType} sprite/image for a Metroidvania game.
${request.artDirection ? `Art direction: ${request.artDirection}` : ''}
${request.animationKind ? `This is a horizontal ${request.animationKind} animation strip with ${request.frameCount ?? 'multiple'} frames. Check cross-frame consistency: same silhouette/palette, real motion, no corrupted frames.` : ''}
Respond in JSON only: {"passed": boolean, "score": 0-100, "issues": string[], "tags": string[], "description": string}
Check: clear subject, appropriate dimensions, no corruption, no unwanted text, suitable for pixel art game.`;

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: { url: `data:image/png;base64,${base64}` },
                },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 512,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (!res.ok) {
        return deterministicCritique(request);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(content) as VisionAnalysisResponse;
      return {
        passed: parsed.passed ?? (parsed.score ?? 0) >= 60,
        score: parsed.score ?? 70,
        issues: parsed.issues ?? [],
        tags: [...(parsed.tags ?? []), 'nvidia-vision'],
        description: parsed.description ?? '',
      };
    } catch {
      return deterministicCritique(request);
    }
  }
}
