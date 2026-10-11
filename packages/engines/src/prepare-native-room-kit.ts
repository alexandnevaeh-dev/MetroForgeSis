import {existsSync,readFileSync,mkdirSync,writeFileSync,lstatSync} from 'node:fs';
import {join,dirname,resolve,relative} from 'node:path';
import {configureStormglassGalleryRoomKits,validStormglassKitManifest} from '@metroforge/godot';
import type {AssemblyInput} from '@metroforge/godot';

/** Export already-authored canonical template assets; never replace author-owned files. */
export function prepareNativeRoomKits(input:AssemblyInput,resourceRoot:string):boolean {
 if(input.gameDna.archetype!=='SIDE_VIEW_METROIDVANIA'||!input.worldGraph.nodes.some(n=>n.metadata?.stormglassCampaignLayout==='stormglass-gallery-campaign-v1'||n.metadata?.stormglassRoomTheme))return false;
 const template=join(resourceRoot,'templates/godot-metroidvania');
 const files:{path:string;bytes:Buffer}[]=[];
 for(const name of ['gallery-common-v1','archive-reliquary-v1','undercroft-service-v1']){
  const prefix=`assets/architecture/stormglass/kits/${name}`;
  const manifest=readFileSync(join(template,prefix,'manifest.json'));
  const parsed=JSON.parse(manifest.toString());
  const png=readFileSync(join(template,prefix,'atlas.png'));
  if(parsed.atlas!==`${prefix}/atlas.png`||!validStormglassKitManifest(parsed,png))throw new Error(`Invalid canonical room kit: ${name}`);
  files.push({path:`${prefix}/manifest.json`,bytes:manifest},{path:`${prefix}/atlas.png`,bytes:png});
 }
 const blueprint='data/visual/blueprints/stormglass-gallery-room-kits-v1.json';
 files.push({path:blueprint,bytes:readFileSync(join(template,blueprint))});
 const root=resolve(input.outputDir);
 for(const f of files){
  const dest=resolve(root,f.path);const rel=relative(root,dest);
  if(rel.startsWith('..'))throw new Error('Room kit destination escapes project');
  let current=root;
  for(const part of rel.split(/[\\/]/)){current=join(current,part);if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw new Error('Room kit destination follows a symlink');}
 }
 for(const f of files){const dest=join(root,f.path);if(!existsSync(dest)){mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,f.bytes);}}
 return configureStormglassGalleryRoomKits(root,input.gameDna,input.worldGraph);
}
