import { describe, it, expect } from 'vitest';
import { DiffusersDownloadAdapter, HuggingFaceDownloadAdapter } from '../src/model-download-manager.js';
import { ModelEntrySchema } from '@metroforge/schemas';

const diffusersModel = ModelEntrySchema.parse({
  id: 'sdxl-base-1.0',
  name: 'SDXL',
  provider: 'diffusers',
  repository: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0',
  modality: 'image',
  capabilities: ['IMAGE_GENERATION'],
  local: true,
  enabled: true,
  costClass: 'free',
  license: 'OpenRAIL++-M',
  commercialUse: 'restricted',
  supportsImageGeneration: true,
  runtime: 'diffusers',
  downloadSizeMb: 6700,
  priority: 80,
  tags: [],
});

describe('DiffusersDownloadAdapter', () => {
  it('claims diffusers models', () => {
    const adapter = new DiffusersDownloadAdapter('/tmp/models');
    expect(adapter.canDownload(diffusersModel)).toBe(true);
  });

  it('HF adapter skips diffusers models', () => {
    const hf = new HuggingFaceDownloadAdapter('/tmp/models');
    expect(hf.canDownload(diffusersModel)).toBe(false);
  });
});
