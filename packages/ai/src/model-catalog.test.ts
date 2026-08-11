import { describe, it, expect } from 'vitest';
import { rankModelsForCapability } from '../src/model-catalog.js';
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
});
