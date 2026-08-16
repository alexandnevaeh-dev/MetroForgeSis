export interface ModelBenchmarkSample {
  provider: string;
  model: string;
  assetType: string;
  quality: number;
  consistency: number;
  speed: number;
  reliability: number;
}

export class ModelBenchmarkRegistry {
  private samples: ModelBenchmarkSample[] = [];

  record(sample: ModelBenchmarkSample): void {
    this.samples.push(sample);
    if (this.samples.length > 500) this.samples.shift();
  }

  rolling(provider: string, model: string, assetType: string): ModelBenchmarkSample | undefined {
    const matched = this.samples.filter(
      (s) => s.provider === provider && s.model === model && s.assetType === assetType,
    );
    if (matched.length < 3) return undefined;
    const avg = (pick: (s: ModelBenchmarkSample) => number) =>
      matched.reduce((n, s) => n + pick(s), 0) / matched.length;
    return {
      provider,
      model,
      assetType,
      quality: avg((s) => s.quality),
      consistency: avg((s) => s.consistency),
      speed: avg((s) => s.speed),
      reliability: avg((s) => s.reliability),
    };
  }
}

export const defaultBenchmarkRegistry = new ModelBenchmarkRegistry();
