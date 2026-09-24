import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {AssemblyInput} from '@metroforge/godot';
import type {UnityBackgroundFraming} from './unity-room-edit-store.js';
/** Optional authored settings beside a biome's background images. */
export function readBackgroundFraming(input: Pick<AssemblyInput,'outputDir'|'textureFiles'>, biomeIndex: number): Partial<UnityBackgroundFraming> {
 const relative=`assets/backgrounds/biome_${biomeIndex}/presentation.json`;
 const supplied=input.textureFiles?.get(relative);
 const file=join(input.outputDir,relative);
 if (!supplied && !existsSync(file)) return {};
 const value=JSON.parse(supplied ? supplied.toString('utf8') : readFileSync(file,'utf8'));
 if (!value || typeof value!=='object' || Array.isArray(value) ||
     typeof value.farCameraRelative!=='boolean' || typeof value.farParallax!=='number' ||
     !Number.isFinite(value.farParallax) || value.farParallax<0 || value.farParallax>1 ||
     Object.keys(value).some(key=>!['farCameraRelative','farParallax'].includes(key)))
   throw new Error(`Invalid background framing in ${relative}`);
 return {farCameraRelative:value.farCameraRelative,farParallax:value.farParallax};
}
