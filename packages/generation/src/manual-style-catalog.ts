import { createHash } from 'node:crypto';
import { readFileSync, statSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { validateLocalStyleAdapter, type LocalStyleAdapter } from '@metroforge/assets';

const PIXEL_STYLE_SHA256='4234637cb80c998f41e348e6a6cb6bc20d8d038b2b0f256b6129b3b5e353eef7';
export interface ManualStyleOption { id:string; label:string; available:boolean; reason?:string; }

/** Curated local-only descriptors. Listing never downloads, loads a model or reveals paths. */
export function resolveManualStyleAdapter(id:string,scale=1,root='E:/MetroForgeData/Models'):LocalStyleAdapter {
  if(id!=='pixel-art-xl')throw new Error('Unknown local art style');
  if(typeof scale!=='number'||!Number.isFinite(scale)||scale<=0||scale>2)throw new Error('Invalid local style adapter scale');
  const descriptor=validateLocalStyleAdapter({path:join(root,'nerijs-pixel-art-xl','pixel-art-xl.safetensors'),sha256:PIXEL_STYLE_SHA256,scale});
  let bytes:Buffer;
  try {
    // Validate the resolved target too; a junction must not move substantial artifacts off E:.
    descriptor.path=validateLocalStyleAdapter({...descriptor,path:realpathSync(descriptor.path)}).path;
    const size=statSync(descriptor.path).size;
    if(size!==170543052)throw new Error('size');
    bytes=readFileSync(descriptor.path);
  } catch { throw new Error('Pixel art style is not available in the local model cache'); }
  if(createHash('sha256').update(bytes).digest('hex')!==descriptor.sha256)throw new Error('Pixel art style cache failed integrity verification');
  return descriptor;
}

export function listManualStyleAdapters(root='E:/MetroForgeData/Models'):ManualStyleOption[] {
  try {resolveManualStyleAdapter('pixel-art-xl',1,root);return [{id:'pixel-art-xl',label:'Pixel art XL · local SDXL',available:true}];}
  catch(error){return [{id:'pixel-art-xl',label:'Pixel art XL · local SDXL',available:false,reason:error instanceof Error?error.message:'Local style unavailable'}];}
}
