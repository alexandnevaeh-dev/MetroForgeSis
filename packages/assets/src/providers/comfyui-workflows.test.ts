import { describe, it, expect } from 'vitest';

import {

  buildFluxImg2ImgWorkflow,

  buildFluxTxt2ImgWorkflow,

  buildSdxlControlNetCannyWorkflow,

  buildSdxlIpAdapterWorkflow,

  buildFluxWorkflow,

} from './comfyui-workflows.js';

import type { ImageGenRequest } from '../types/image-gen.js';



const baseRequest: ImageGenRequest = {

  profile: 'CHARACTER',

  prompt: 'knight sprite',

  width: 64,

  height: 64,

  seed: 42,

};



describe('comfyui workflows', () => {

  it('txt2img workflow uses EmptyLatentImage and full denoise', () => {

    const wf = buildFluxTxt2ImgWorkflow(baseRequest, 7);

    expect(wf['5']).toMatchObject({ class_type: 'EmptyLatentImage' });

    expect((wf['3'] as { inputs: { denoise: number } }).inputs.denoise).toBe(1);

  });



  it('img2img workflow encodes a reference image with reduced denoise', () => {

    const wf = buildFluxImg2ImgWorkflow(

      {

        ...baseRequest,

        conditioning: { mode: 'img2img', image: Buffer.from('png'), strength: 0.5 },

      },

      7,

      'reference.png',

    );

    expect(wf['10']).toMatchObject({ class_type: 'LoadImage' });

    expect(wf['11']).toMatchObject({ class_type: 'VAEEncode' });

    expect((wf['3'] as { inputs: { denoise: number } }).inputs.denoise).toBe(0.5);

  });



  it('controlnet workflow uses ControlNetLoader and CannyEdgePreprocessor', () => {

    const wf = buildSdxlControlNetCannyWorkflow(

      {

        ...baseRequest,

        conditioning: { mode: 'controlnet_canny', image: Buffer.from('png'), strength: 0.7 },

      },

      7,

      'reference.png',

    );

    expect(wf['12']).toMatchObject({ class_type: 'ControlNetLoader' });

    expect(wf['13']).toMatchObject({ class_type: 'CannyEdgePreprocessor' });

    expect(wf['14']).toMatchObject({ class_type: 'ControlNetApplyAdvanced' });

  });



  it('ip-adapter workflow uses IPAdapterUnifiedLoader and IPAdapterApply', () => {

    const wf = buildSdxlIpAdapterWorkflow(

      {

        ...baseRequest,

        conditioning: { mode: 'ip_adapter', image: Buffer.from('png'), strength: 0.55 },

      },

      7,

      'reference.png',

    );

    expect(wf['15']).toMatchObject({ class_type: 'IPAdapterUnifiedLoader' });

    expect(wf['16']).toMatchObject({ class_type: 'IPAdapterApply' });

    expect((wf['16'] as { inputs: { weight: number } }).inputs.weight).toBe(0.55);

  });



  it('buildFluxWorkflow routes by conditioning mode', () => {

    const controlnet = buildFluxWorkflow(

      {

        ...baseRequest,

        conditioning: { mode: 'controlnet_canny', image: Buffer.from('png') },

      },

      1,

      'ref.png',

    );

    expect(controlnet['13']).toMatchObject({ class_type: 'CannyEdgePreprocessor' });



    const ip = buildFluxWorkflow(

      {

        ...baseRequest,

        conditioning: { mode: 'ip_adapter', image: Buffer.from('png') },

      },

      1,

      'ref.png',

    );

    expect(ip['16']).toMatchObject({ class_type: 'IPAdapterApply' });

  });

});


