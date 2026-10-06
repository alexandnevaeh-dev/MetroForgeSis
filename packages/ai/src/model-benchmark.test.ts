import { describe, it, expect, vi, afterEach } from 'vitest';
import { ModelBenchmarkService } from '../src/model-benchmark.js';
import type { ModelEntry, HardwareProfile } from '@metroforge/schemas';

const mockHardware: HardwareProfile = {
  os: 'win32',
  cpuArch: 'x64',
  cpuCores: 8,
  totalRamMb: 65536,
  profile: 'BALANCED',
  cudaAvailable: true,
  rocmAvailable: false,
  directMlAvailable: true,
  metalAvailable: false,
};

const ollamaModel: ModelEntry = {
  id: 'test-model',
  name: 'Test Model',
  provider: 'ollama',
  modality: 'text',
  capabilities: ['JSON_GENERATION', 'REASONING'],
  local: true,
  enabled: true,
  costClass: 'free',
  license: 'Apache-2.0',
  commercialUse: 'allowed',
  recommendedRamMb: 8192,
  priority: 80,
  specializationScores: { JSON: 90, REASONING: 70 },
  tags: [],
  health: 'healthy',
  supportsTools: false,
  supportsStructuredOutput: true,
  supportsVision: false,
  supportsImageGeneration: false,
  supportsAudio: false,
  ggufAvailable: false,
  installed: true,
};

const hostedModel: ModelEntry = {
  ...ollamaModel,
  id: 'hosted-model',
  provider: 'gemini',
  local: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ModelBenchmarkService', () => {
  it('falls back to a heuristic score when no Ollama base URL is given', async () => {
    const service = new ModelBenchmarkService();
    const result = await service.benchmarkModel(ollamaModel, mockHardware);
    expect(result.measured).toBe(false);
    expect(result.modelId).toBe('test-model');
    expect(result.overallScore).toBeGreaterThan(0);
  });

  it('never probes non-Ollama providers directly', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const service = new ModelBenchmarkService();
    const result = await service.benchmarkModel(hostedModel, mockHardware, 'http://localhost:11434');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.measured).toBe(false);
  });

  it('runs a real probe against Ollama and measures JSON compliance + latency', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ response: '{"ok": true, "tool": "godot"}' }),
      })),
    );

    const service = new ModelBenchmarkService();
    const result = await service.benchmarkModel(ollamaModel, mockHardware, 'http://localhost:11434');

    expect(result.measured).toBe(true);
    expect(result.jsonCompliance).toBe(100);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeGreaterThan(0);
  });

  it('falls back to heuristic when the Ollama server errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    );

    const service = new ModelBenchmarkService();
    const result = await service.benchmarkModel(ollamaModel, mockHardware, 'http://localhost:11434');

    expect(result.measured).toBe(false);
  });

  it('falls back to heuristic when the model produces invalid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ response: 'not json at all' }),
      })),
    );

    const service = new ModelBenchmarkService();
    const result = await service.benchmarkModel(ollamaModel, mockHardware, 'http://localhost:11434');

    expect(result.measured).toBe(true);
    expect(result.jsonCompliance).toBe(0);
  });
});
