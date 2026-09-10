import { describe, expect, it } from 'vitest';
import { validateComfyUIWorkflowContract } from './comfyui-workflow-contract.js';

describe('ComfyUI workflow contracts', () => {
  it('rejects missing workflow requirements before generation', () => {
    const result = validateComfyUIWorkflowContract({
      workflowId: 'player-reference',
      version: '1.0.0',
      capabilities: ['REFERENCE_IMAGE'],
      requiredModels: ['sdxl-base-1.0'],
      requiredAdapters: ['ip-adapter-sdxl'],
      requiredCustomNodes: [],
      inputMappings: { referenceImage: 'conditioning.image' },
      outputMappings: { image: 'images[0]' },
      licenseRequirements: ['model terms'],
      vramProfile: 'remote GPU',
    }, { models: new Set(), adapters: new Set() });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('model:sdxl-base-1.0');
    expect(result.missing).toContain('adapter:ip-adapter-sdxl');
  });

  it('accepts a complete available workflow contract', () => {
    const result = validateComfyUIWorkflowContract({
      workflowId: 'player-reference', version: '1.0.0', capabilities: ['REFERENCE_IMAGE'],
      requiredModels: ['sdxl-base-1.0'], requiredAdapters: ['ip-adapter-sdxl'], requiredCustomNodes: [],
      inputMappings: { referenceImage: 'conditioning.image' }, outputMappings: { image: 'images[0]' },
      licenseRequirements: ['model terms'], vramProfile: 'remote GPU',
    }, { models: new Set(['sdxl-base-1.0']), adapters: new Set(['ip-adapter-sdxl']) });
    expect(result).toEqual({ valid: true, missing: [] });
  });
});
