import type { ModelEntry, HardwareProfile } from '@metroforge/schemas';

export interface BenchmarkResult {
  modelId: string;
  overallScore: number;
  jsonCompliance: number;
  latencyMs: number;
  measured: boolean;
  details: Record<string, number>;
}

const GDSCRIPT_SNIPPET = `extends CharacterBody2D
func _physics_process(delta: float) -> void:
    velocity.y += 980.0 * delta
    move_and_slide()`;

/** A small, fixed prompt whose only valid answer is well-formed JSON with these two keys. */
const JSON_PROBE_PROMPT =
  'Respond with ONLY a JSON object, no prose, matching exactly: {"ok": true, "tool": "godot"}';

export class ModelBenchmarkService {
  /**
   * Benchmarks a model. For installed Ollama models with a reachable server, this runs a real
   * `/api/generate` call and measures actual latency and JSON-compliance. For every other model
   * (hosted providers not yet wired for direct single-shot probing, or an unreachable Ollama
   * server) it falls back to a heuristic score derived from catalog metadata — never hard-fails.
   */
  async benchmarkModel(
    model: ModelEntry,
    hardware: HardwareProfile,
    ollamaBaseUrl?: string,
  ): Promise<BenchmarkResult> {
    if (model.provider === 'ollama' && model.installed && ollamaBaseUrl) {
      const live = await this.probeOllama(model, ollamaBaseUrl);
      if (live) return live;
    }
    return this.heuristicBenchmark(model, hardware);
  }

  private async probeOllama(model: ModelEntry, baseUrl: string): Promise<BenchmarkResult | null> {
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.id,
          prompt: JSON_PROBE_PROMPT,
          stream: false,
          format: 'json',
          options: { temperature: 0, num_predict: 64 },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) return null;

      const data = (await res.json()) as { response?: string };
      let jsonCompliance = 0;
      try {
        const parsed = JSON.parse(data.response ?? '');
        jsonCompliance = parsed && typeof parsed === 'object' && 'ok' in parsed ? 100 : 40;
      } catch {
        jsonCompliance = 0;
      }

      // Latency scored on a curve: <1s is excellent, >15s is poor. Code/reasoning stay
      // heuristic-derived from catalog metadata — a single probe prompt can't reliably measure
      // those without a much larger, slower eval suite.
      const latencyScore = Math.max(0, Math.min(100, 100 - (latencyMs - 1000) / 140));
      const codeScore =
        model.specializationScores?.GDSCRIPT ?? model.specializationScores?.CODE ?? 60;
      const reasoningScore = model.specializationScores?.REASONING ?? 65;

      const overallScore = Math.round(
        jsonCompliance * 0.4 + latencyScore * 0.2 + codeScore * 0.25 + reasoningScore * 0.15,
      );

      return {
        modelId: model.id,
        overallScore: Math.min(100, Math.max(0, overallScore)),
        jsonCompliance,
        latencyMs,
        measured: true,
        details: { jsonCompliance, latencyScore, codeScore, reasoningScore },
      };
    } catch {
      return null;
    }
  }

  private heuristicBenchmark(model: ModelEntry, _hardware: HardwareProfile): BenchmarkResult {
    const start = Date.now();

    let jsonCompliance = 50;
    let codeScore = 50;
    let reasoningScore = 50;

    if (model.supportsStructuredOutput) jsonCompliance += 25;
    if (model.capabilities.includes('JSON_GENERATION')) jsonCompliance += 15;
    if (model.specializationScores?.JSON) jsonCompliance = model.specializationScores.JSON;

    if (model.capabilities.includes('GDSCRIPT') || model.capabilities.includes('CODE_GENERATION')) {
      codeScore = model.specializationScores?.GDSCRIPT ?? model.specializationScores?.CODE ?? 60;
    }

    if (model.capabilities.includes('REASONING')) {
      reasoningScore = model.specializationScores?.REASONING ?? 65;
    }

    const latencyMs = Date.now() - start + (model.estimatedSpeed === 'fast' ? 100 : model.estimatedSpeed === 'slow' ? 800 : 400);

    const overallScore = Math.round(
      jsonCompliance * 0.35 + codeScore * 0.35 + reasoningScore * 0.2 + (model.priority > 70 ? 10 : 0),
    );

    return {
      modelId: model.id,
      overallScore: Math.min(100, overallScore),
      jsonCompliance,
      latencyMs,
      measured: false,
      details: {
        jsonCompliance,
        codeScore,
        reasoningScore,
        gdscriptSampleLength: GDSCRIPT_SNIPPET.length,
      },
    };
  }
}
