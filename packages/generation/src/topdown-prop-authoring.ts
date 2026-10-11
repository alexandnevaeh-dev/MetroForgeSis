import {existsSync,readFileSync,realpathSync,statSync,mkdirSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {readTopDownPropAsset} from './topdown-prop-asset.js';

export type TopDownPropAnchor = {anchorX:number;anchorY:number;displayScale:number;nonCollidingScenery?:boolean};
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function context(projectPath:string,assetPath:string){
 const root=realpathSync(projectPath);
 const inside=(path:string)=>{const rel=relative(root,realpathSync(path));if(rel.startsWith('..')||isAbsolute(rel))throw Error('Prop source escapes project');return path};
 const world=JSON.parse(readFileSync(inside(join(root,'data/world/overworld.json')),'utf8'));if(!Array.isArray(world.areas))throw Error('Anchor editing requires a top-down area project');
 if(typeof assetPath!=='string'||!assetPath.startsWith('assets/props/')||!assetPath.endsWith('.png')||assetPath.includes('..')||/[\\:]/.test(assetPath))throw Error('Choose a project prop PNG');
 const imagePath=inside(join(root,assetPath));if(statSync(imagePath).size>16777216)throw Error('Prop image exceeds authoring limit');
 const image=readFileSync(imagePath);if(image.length<24||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||image.toString('ascii',12,16)!=='IHDR')throw Error('Prop source is not a PNG');
 const sourceSize:[number,number]=[image.readUInt32BE(16),image.readUInt32BE(20)];if(sourceSize.some(v=>v<1||v>16384))throw Error('Unsupported prop dimensions');
 const metadataPath=imagePath.replace(/\.png$/,'.prop.json');if(existsSync(metadataPath))inside(metadataPath);
 const layout=readTopDownPropAsset(root,assetPath)?.layout;
 const metadata=existsSync(metadataPath)?readFileSync(metadataPath):null;
 return {root,inside,imagePath,image,metadataPath,metadata,sourceSize,layout};
}
export function readTopDownPropAuthoring(projectPath:string,assetPath:string){
 const c=context(projectPath,assetPath);
 return {sourceSize:c.sourceSize,imageSha256:hash(c.image),previewDataUrl:'data:image/png;base64,'+c.image.toString('base64'),revision:hash(Buffer.concat([c.image,Buffer.from('\0'),c.metadata??Buffer.from('absent')])),anchorPx:(c.layout?.anchorPx??[c.sourceSize[0]/2,c.sourceSize[1]]) as [number,number],displayScale:Number(c.layout?.displayScale??1),hasLayout:!!c.layout,collisionCount:Array.isArray(c.layout?.collisionRectsPx)?c.layout.collisionRectsPx.length:0};
}
/** Explicit scalar editing preserves artwork, layers, footprints and room data. */
export function saveTopDownPropAnchor(projectPath:string,assetPath:string,edit:TopDownPropAnchor,revision:string){
 const c=context(projectPath,assetPath),current=readTopDownPropAuthoring(projectPath,assetPath);
 if(revision!==current.revision)throw Error('Prop artwork or placement settings changed. Reload before saving.');
 if(!edit||![edit.anchorX,edit.anchorY,edit.displayScale].every(v=>typeof v==='number'&&Number.isFinite(v))||edit.anchorX<0||edit.anchorX>c.sourceSize[0]||edit.anchorY<0||edit.anchorY>c.sourceSize[1]||edit.displayScale<=0||edit.displayScale>4)throw Error('Enter an anchor inside the image and a scale greater than 0, up to 4.');
 if(!c.layout&&edit.nonCollidingScenery!==true)throw Error('Confirm this new prop is non-colliding scenery.');
 const layout={...(c.layout??{version:1,sourceSize:c.sourceSize,collisionRectsPx:[]}),anchorPx:[edit.anchorX,edit.anchorY],displayScale:edit.displayScale};
 const id=randomUUID();let backup=c.root;
 for(const segment of ['.metroforge','prop-layout-backups',id]){backup=join(backup,segment);if(existsSync(backup))c.inside(backup);else mkdirSync(backup);}
 writeFileSync(join(backup,'before.json'),JSON.stringify({assetPath,imageSha256:current.imageSha256,revision,absent:c.metadata===null},null,2));if(c.metadata)writeFileSync(join(backup,'layout.prop.json'),c.metadata);
 const temporary=c.metadataPath+'.'+id+'.tmp';
 try{writeFileSync(temporary,JSON.stringify(layout,null,2)+'\n',{flag:'wx'});if(readTopDownPropAuthoring(projectPath,assetPath).revision!==revision)throw Error('Prop source changed before save');renameSync(temporary,c.metadataPath);}finally{if(existsSync(temporary))unlinkSync(temporary);}
 return {...readTopDownPropAuthoring(projectPath,assetPath),backupId:id,existingPlacementsUnchanged:true as const};
}
