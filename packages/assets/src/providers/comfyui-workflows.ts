import type { ImageGenRequest } from '../types/image-gen.js';

import { resolveConditioningStrength } from '../image-conditioning.js';

import { profilePrefix } from '../types/prompts.js';



/** ComfyUI checkpoint / adapter filenames — override via env in Electron main if needed. */

export const COMFYUI_SDXL_CHECKPOINT =

  process.env.COMFYUI_SDXL_CHECKPOINT ?? 'sd_xl_base_1.0.safetensors';

export const COMFYUI_CONTROLNET_CANNY =

  process.env.COMFYUI_CONTROLNET_CANNY ?? 'controlnet-canny-sdxl-1.0.safetensors';

export const COMFYUI_IPADAPTER_WEIGHT =

  process.env.COMFYUI_IPADAPTER_WEIGHT ?? 'ip-adapter_sdxl.bin';



export function buildFluxTxt2ImgWorkflow(

  request: ImageGenRequest,

  seed: number,

): Record<string, unknown> {

  const stylePrefix = profilePrefix(request.profile);

  return {

    '3': {

      class_type: 'KSampler',

      inputs: {

        seed,

        steps: 4,

        cfg: 1,

        sampler_name: 'euler',

        scheduler: 'simple',

        denoise: 1,

        model: ['4', 0],

        positive: ['6', 0],

        negative: ['7', 0],

        latent_image: ['5', 0],

      },

    },

    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-schnell.safetensors' } },

    '5': {

      class_type: 'EmptyLatentImage',

      inputs: { width: request.width, height: request.height, batch_size: 1 },

    },

    '6': {

      class_type: 'CLIPTextEncode',

      inputs: { text: `${stylePrefix} ${request.prompt}`, clip: ['4', 1] },

    },

    '7': {

      class_type: 'CLIPTextEncode',

      inputs: {

        text: request.negativePrompt ?? 'blurry, low quality, text, watermark',

        clip: ['4', 1],

      },

    },

    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },

    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'metroforge', images: ['8', 0] } },

  };

}



/** Img2img workflow — reference image uploaded to ComfyUI. */

export function buildFluxImg2ImgWorkflow(

  request: ImageGenRequest,

  seed: number,

  uploadedImageName: string,

): Record<string, unknown> {

  const conditioning = request.conditioning!;

  const denoise = resolveConditioningStrength(conditioning);

  const stylePrefix = profilePrefix(request.profile);

  return {

    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-schnell.safetensors' } },

    '10': { class_type: 'LoadImage', inputs: { image: uploadedImageName } },

    '11': { class_type: 'VAEEncode', inputs: { pixels: ['10', 0], vae: ['4', 2] } },

    '3': {

      class_type: 'KSampler',

      inputs: {

        seed,

        steps: 4,

        cfg: 1,

        sampler_name: 'euler',

        scheduler: 'simple',

        denoise,

        model: ['4', 0],

        positive: ['6', 0],

        negative: ['7', 0],

        latent_image: ['11', 0],

      },

    },

    '6': {

      class_type: 'CLIPTextEncode',

      inputs: { text: `${stylePrefix} ${request.prompt}`, clip: ['4', 1] },

    },

    '7': {

      class_type: 'CLIPTextEncode',

      inputs: {

        text: request.negativePrompt ?? 'blurry, low quality, text, watermark',

        clip: ['4', 1],

      },

    },

    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },

    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'metroforge', images: ['8', 0] } },

  };

}



/**

 * SDXL ControlNet Canny — requires ComfyUI_controlnet_aux (CannyEdgePreprocessor).

 * Uses SDXL base checkpoint, not Flux.

 */

export function buildSdxlControlNetCannyWorkflow(

  request: ImageGenRequest,

  seed: number,

  uploadedImageName: string,

): Record<string, unknown> {

  const conditioning = request.conditioning!;

  const strength = resolveConditioningStrength(conditioning);

  const stylePrefix = profilePrefix(request.profile);

  return {

    '4': {

      class_type: 'CheckpointLoaderSimple',

      inputs: { ckpt_name: COMFYUI_SDXL_CHECKPOINT },

    },

    '12': {

      class_type: 'ControlNetLoader',

      inputs: { control_net_name: COMFYUI_CONTROLNET_CANNY },

    },

    '10': { class_type: 'LoadImage', inputs: { image: uploadedImageName } },

    '13': {

      class_type: 'CannyEdgePreprocessor',

      inputs: { image: ['10', 0], low_threshold: 100, high_threshold: 200, resolution: 512 },

    },

    '6': {

      class_type: 'CLIPTextEncode',

      inputs: { text: `${stylePrefix} ${request.prompt}`, clip: ['4', 1] },

    },

    '7': {

      class_type: 'CLIPTextEncode',

      inputs: {

        text: request.negativePrompt ?? 'blurry, low quality, text, watermark',

        clip: ['4', 1],

      },

    },

    '14': {

      class_type: 'ControlNetApplyAdvanced',

      inputs: {

        positive: ['6', 0],

        negative: ['7', 0],

        control_net: ['12', 0],

        image: ['13', 0],

        strength,

        start_percent: 0,

        end_percent: 1,

      },

    },

    '5': {

      class_type: 'EmptyLatentImage',

      inputs: { width: request.width, height: request.height, batch_size: 1 },

    },

    '3': {

      class_type: 'KSampler',

      inputs: {

        seed,

        steps: 20,

        cfg: 7,

        sampler_name: 'euler',

        scheduler: 'normal',

        denoise: 1,

        model: ['4', 0],

        positive: ['14', 0],

        negative: ['14', 1],

        latent_image: ['5', 0],

      },

    },

    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },

    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'metroforge', images: ['8', 0] } },

  };

}



/**

 * SDXL IP-Adapter — requires ComfyUI_IPAdapter_plus custom nodes.

 */

export function buildSdxlIpAdapterWorkflow(

  request: ImageGenRequest,

  seed: number,

  uploadedImageName: string,

): Record<string, unknown> {

  const conditioning = request.conditioning!;

  const weight = resolveConditioningStrength(conditioning);

  const stylePrefix = profilePrefix(request.profile);

  return {

    '4': {

      class_type: 'CheckpointLoaderSimple',

      inputs: { ckpt_name: COMFYUI_SDXL_CHECKPOINT },

    },

    '10': { class_type: 'LoadImage', inputs: { image: uploadedImageName } },

    '15': {

      class_type: 'IPAdapterUnifiedLoader',

      inputs: {

        model: ['4', 0],

        ipadapter_file: COMFYUI_IPADAPTER_WEIGHT,

      },

    },

    '16': {

      class_type: 'IPAdapterApply',

      inputs: {

        ipadapter: ['15', 1],

        model: ['15', 0],

        image: ['10', 0],

        weight,

        weight_type: 'linear',

        start_at: 0,

        end_at: 1,

        clip_vision: ['15', 2],

      },

    },

    '6': {

      class_type: 'CLIPTextEncode',

      inputs: { text: `${stylePrefix} ${request.prompt}`, clip: ['4', 1] },

    },

    '7': {

      class_type: 'CLIPTextEncode',

      inputs: {

        text: request.negativePrompt ?? 'blurry, low quality, text, watermark',

        clip: ['4', 1],

      },

    },

    '5': {

      class_type: 'EmptyLatentImage',

      inputs: { width: request.width, height: request.height, batch_size: 1 },

    },

    '3': {

      class_type: 'KSampler',

      inputs: {

        seed,

        steps: 20,

        cfg: 7,

        sampler_name: 'euler',

        scheduler: 'normal',

        denoise: 1,

        model: ['16', 0],

        positive: ['6', 0],

        negative: ['7', 0],

        latent_image: ['5', 0],

      },

    },

    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },

    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'metroforge', images: ['8', 0] } },

  };

}



export function buildFluxWorkflow(request: ImageGenRequest, seed: number, uploadedImageName?: string) {

  if (request.conditioning && uploadedImageName) {

    const mode = request.conditioning.mode;

    if (mode === 'controlnet_canny') {

      return buildSdxlControlNetCannyWorkflow(request, seed, uploadedImageName);

    }

    if (mode === 'ip_adapter') {

      return buildSdxlIpAdapterWorkflow(request, seed, uploadedImageName);

    }

    return buildFluxImg2ImgWorkflow(request, seed, uploadedImageName);

  }

  return buildFluxTxt2ImgWorkflow(request, seed);

}


