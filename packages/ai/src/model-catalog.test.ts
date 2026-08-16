import { describe, it, expect } from 'vitest';
import { rankModelsForCapability, explainModelRouting, type RoutableModelEntry } from '../src/model-catalog.js';
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

const mockModels: ModelEntry[] = [
  {
    id: 'big-model',
    name: 'Big Model',
    provider: 'ollama',
    modality: 'text',
    capabilities: ['JSON_GENERATION', 'REASONING'],
    local: true,
    enabled: true,
    costClass: 'free',
    license: 'Apache-2.0',
    commercialUse: 'allowed',
    recommendedRamMb: 65536,
    minRamMb: 49152,
    priority: 100,
    specializationScores: { JSON: 95 },
    tags: [],
    health: 'unknown',
    supportsTools: false,
    supportsStructuredOutput: true,
    supportsVision: false,
    supportsImageGeneration: false,
    supportsAudio: false,
    ggufAvailable: false,
    installed: true,
  },
  {
    id: 'small-model',
    name: 'Small Model',
    provider: 'ollama',
    modality: 'text',
    capabilities: ['JSON_GENERATION'],
    local: true,
    enabled: true,
    costClass: 'free',
    license: 'MIT',
    commercialUse: 'allowed',
    recommendedRamMb: 4096,
    priority: 50,
    specializationScores: { JSON: 70 },
    tags: ['low-resource'],
    health: 'unknown',
    supportsTools: false,
    supportsStructuredOutput: false,
    supportsVision: false,
    supportsImageGeneration: false,
    supportsAudio: false,
    ggufAvailable: false,
    installed: true,
  },
];

describe('rankModelsForCapability', () => {
  it('ranks by specialization and priority', () => {
    const ranked = rankModelsForCapability(mockModels, 'JSON_GENERATION', mockHardware, {
      preferInstalled: false,
    });
    expect(ranked[0]?.model.id).toBe('big-model');
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
  });

  it('excludes models exceeding hardware RAM', () => {
    const lowHw: HardwareProfile = { ...mockHardware, totalRamMb: 8192, profile: 'LOW_RESOURCE' };
    const ranked = rankModelsForCapability(mockModels, 'JSON_GENERATION', lowHw);
    expect(ranked.find((r) => r.model.id === 'big-model')).toBeUndefined();
    expect(ranked[0]?.model.id).toBe('small-model');
  });

  it('does not reject remote models for low local VRAM (local-only VRAM filter)', () => {
    const lowVram: HardwareProfile = {
      ...mockHardware,
      totalRamMb: 65536,
      vramMb: 512,
      profile: 'LOW_RESOURCE',
    };
    const models: ModelEntry[] = [
      {
        ...mockModels[1]!,
        id: 'remote-nvidia',
        provider: 'nvidia',
        local: false,
        minVramMb: 8192,
        recommendedVramMb: 12288,
        capabilities: ['JSON_GENERATION'],
        enabled: true,
      },
      {
        ...mockModels[1]!,
        id: 'local-gpu-hungry',
        provider: 'ollama',
        local: true,
        minVramMb: 8192,
        capabilities: ['JSON_GENERATION'],
        enabled: true,
      },
    ];
    const ranked = rankModelsForCapability(models, 'JSON_GENERATION', lowVram);
    expect(ranked.map((r) => r.model.id)).toContain('remote-nvidia');
    expect(ranked.map((r) => r.model.id)).not.toContain('local-gpu-hungry');

    const routable: RoutableModelEntry[] = models.map((m) => ({ ...m, providerEnabled: true }));
    const trace = explainModelRouting(routable, 'JSON_GENERATION', lowVram);
    expect(trace.candidates.some((c) => c.modelId === 'remote-nvidia')).toBe(true);
    const rejectedLocal = trace.rejected.find((r) => r.modelId === 'local-gpu-hungry');
    expect(rejectedLocal?.reasons.some((r) => r.includes('VRAM'))).toBe(true);
  });
});

describe('explainModelRouting', () => {
  const routable: RoutableModelEntry[] = mockModels.map((m) => ({ ...m, providerEnabled: true }));

  it('selects the top-ranked model and lists real candidates', () => {
    const trace = explainModelRouting(routable, 'JSON_GENERATION', mockHardware, { preferInstalled: false });
    expect(trace.selected?.modelId).toBe('big-model');
    expect(trace.candidates.map((c) => c.modelId)).toEqual(['big-model', 'small-model']);
    expect(trace.rejected).toHaveLength(0);
    expect(trace.hardware?.ramMb).toBe(mockHardware.totalRamMb);
  });

  it('explains a hardware rejection with a real, specific reason', () => {
    const lowHw: HardwareProfile = { ...mockHardware, totalRamMb: 8192, profile: 'LOW_RESOURCE' };
    const trace = explainModelRouting(routable, 'JSON_GENERATION', lowHw);
    const rejection = trace.rejected.find((r) => r.modelId === 'big-model');
    expect(rejection).toBeDefined();
    expect(rejection?.reasons.some((r) => r.includes('RAM'))).toBe(true);
    expect(trace.selected?.modelId).toBe('small-model');
  });

  it('explains a provider-not-configured rejection distinctly from hardware', () => {
    const unconfigured: RoutableModelEntry[] = [
      { ...mockModels[0]!, providerEnabled: false, enabled: false },
      routable[1]!,
    ];
    const trace = explainModelRouting(unconfigured, 'JSON_GENERATION', mockHardware);
    const rejection = trace.rejected.find((r) => r.modelId === 'big-model');
    expect(rejection?.reasons).toContain('provider not configured or not enabled');
  });

  it('rejects offline provider health from live route selection', () => {
    const offline: RoutableModelEntry[] = [
      {
        ...mockModels[0]!,
        id: 'ollama-offline',
        provider: 'ollama',
        local: true,
        providerEnabled: true,
        providerHealth: 'unavailable',
        enabled: true,
        capabilities: ['JSON_GENERATION'],
      },
      {
        ...mockModels[1]!,
        id: 'hosted-ok',
        provider: 'nvidia',
        local: false,
        providerEnabled: true,
        providerHealth: 'healthy',
        enabled: true,
        capabilities: ['JSON_GENERATION'],
        minVramMb: 0,
      },
    ];
    const trace = explainModelRouting(offline, 'JSON_GENERATION', mockHardware);
    expect(trace.selected?.modelId).toBe('hosted-ok');
    const rejected = trace.rejected.find((r) => r.modelId === 'ollama-offline');
    expect(rejected?.reasons.some((r) => /health|unavailable|offline/i.test(r))).toBe(true);
  });
});
