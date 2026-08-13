import type { VisionAnalysisResponse } from './types/vision.js';
import { deterministicCritique } from './vision-critic-shared.js';

export interface VLMCriticConfig {
  ollamaBaseUrl: string;
  model?: string;
}

export interface AssetCritiqueRequest {
  image: Buffer;
  assetType: 'character' | 'enemy' | 'boss' | 'tile' | 'icon' | 'background';
  artDirection?: string;
  frameCount?: number;
  animationKind?: 'walk' | 'hurt' | 'attack' | 'tileset';
  tileSize?: number;
}

/** Independent VLM critic — image generators must not self-approve (Ollama llava backend). */
export class VLMCritic {
  private model: string;

  constructor(private readonly config: VLMCriticConfig) {
    this.model = config.model ?? 'llava:7b';
  }

  backendId(): string {
    return 'ollama-vision';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.ollamaBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { models?: { name: string }[] };
      return (data.models ?? []).some(
        (m) => m.name.includes('llava') || m.name.includes('vl') || m.name.includes('vision'),
      );
    } catch {
      return false;
    }
  }

  async critique(request: AssetCritiqueRequest): Promise<VisionAnalysisResponse> {
    const base64 = request.image.toString('base64');
    const prompt = `You are a game asset QA critic. Analyze this ${request.assetType} sprite/image for a Metroidvania game.
${request.artDirection ? `Art direction: ${request.artDirection}` : ''}
${request.animationKind ? `This is a horizontal ${request.animationKind} animation strip with ${request.frameCount ?? 'multiple'} frames. Check cross-frame consistency: same silhouette/palette, real motion, no corrupted frames.` : ''}
Respond in JSON only: {"passed": boolean, "score": 0-100, "issues": string[], "tags": string[], "description": string}
Check: clear subject, appropriate dimensions, no corruption, no unwanted text, suitable for pixel art game.`;

    const res = await fetch(`${this.config.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt, images: [base64] }],
        stream: false,
        format: 'json',
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      return deterministicCritique(request);
    }

    const data = (await res.json()) as { message?: { content?: string } };
    try {
      const parsed = JSON.parse(data.message?.content ?? '{}') as VisionAnalysisResponse;
      return {
        passed: parsed.passed ?? parsed.score >= 60,
        score: parsed.score ?? 70,
        issues: parsed.issues ?? [],
        tags: parsed.tags ?? [],
        description: parsed.description ?? '',
      };
    } catch {
      return deterministicCritique(request);
    }
  }
}

export { deterministicCritique } from './vision-critic-shared.js';

export interface DeterministicAssetChecks {
  passed: boolean;
  issues: string[];
}

export function runDeterministicAssetChecks(
  png: Buffer,
  expectedWidth?: number,
  expectedHeight?: number,
): DeterministicAssetChecks {
  const issues: string[] = [];

  if (png.length < 67) issues.push('File too small to be valid PNG');
  if (png[0] !== 137 || png.toString('ascii', 1, 4) !== 'PNG') issues.push('Not a PNG file');

  if (expectedWidth && expectedHeight && png.length >= 24) {
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    if (w !== expectedWidth) issues.push(`Width ${w} != expected ${expectedWidth}`);
    if (h !== expectedHeight) issues.push(`Height ${h} != expected ${expectedHeight}`);
  }

  return { passed: issues.length === 0, issues };
}
