import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { encodePng } from '@metroforge/assets';
import { readMaterialArtwork, previewMaterialArtwork, applyMaterialArtwork } from './asset-material-edit.js';
import { restoreAssetVersion } from './asset-history.js';

function fixture() {
  const project = mkdtempSync(join(tmpdir(), 'material-editor-'));mkdirSync(join(project,'assets/enemies'),{recursive:true});
  const rgba = new Uint8Array(16*16*4);
  for(let y=2;y<14;y++)for(let x=5;x<11;x++){const i=(y*16+x)*4;rgba.set([100,50,50,255],i);}
  const source=encodePng(16,16,rgba), image=source;
  writeFileSync(join(project,'assets/enemies/caster.png'),image);writeFileSync(join(project,'assets/enemies/caster_source.png'),source);
  const artifact={id:'caster',path:'assets/enemies/caster.png',sourcePath:'assets/enemies/caster_source.png',manual:true,type:'texture',imagePlan:{profile:'ENEMY',width:16,height:16,sourceWidth:16,sourceHeight:16,transparent:true,grounded:true},provider:'diffusers',critiquePassed:true,critiqueScore:99,productionReady:true,executionMetadata:{actualDevice:'cuda'}};
  writeFileSync(join(project,'generation_manifest.json'),JSON.stringify({artifacts:[artifact,{id:'caster_walk',path:'assets/enemies/walk.png',parentArtifactIds:['caster'],productionReady:true}]}));
  writeFileSync(join(project,'game_dna.json'),JSON.stringify({archetype:'SIDE_VIEW_METROIDVANIA'}));
  writeFileSync(join(project,'validation_report.json'),JSON.stringify({passed:true,validationLevel:'PASSED'}));
  return {project,source,image};
}
const rules=[{region:{x:0,y:0,width:16,height:16},from:'#643232',to:'#202020',tolerance:0,preserveShading:false}];
describe('Guarded material artwork drafts',()=>{
  it('keeps previews read-only, applies the exact reviewed bytes and restores source plus image and provenance',async()=>{
    const f=fixture(), before=readFileSync(join(f.project,'generation_manifest.json'));
    const info=readMaterialArtwork(f.project,'caster');const preview=await previewMaterialArtwork(f.project,'caster',info.inspectionHash,rules);
    expect(readFileSync(join(f.project,'generation_manifest.json')).equals(before)).toBe(true);
    expect(readFileSync(join(f.project,'assets/enemies/caster.png')).equals(f.image)).toBe(true);
    const result=applyMaterialArtwork(f.project,'caster',preview.draftId);expect(result.success).toBe(true);
    expect(readFileSync(join(f.project,'assets/enemies/caster.png')).equals(Buffer.from(preview.imageDataUrl.split(',')[1]!,'base64'))).toBe(true);
    const manifest=JSON.parse(readFileSync(join(f.project,'generation_manifest.json'),'utf8'));
    expect(manifest.artifacts[0]).toMatchObject({provider:'manual-source-edit',critiquePassed:false,critiqueScore:0,productionReady:false,maturity:'COMPILED',executionMetadata:{manualActorReview:{state:'pending',humanReviewRequired:true}}});
    expect(manifest.artifacts[1]).toMatchObject({dirty:true,productionReady:false});
    expect(JSON.parse(readFileSync(join(f.project,'validation_report.json'),'utf8')).validationLevel).toBe('NEEDS_RUNTIME_VALIDATION');
    expect(restoreAssetVersion(f.project,'caster',result.version).success).toBe(true);
    expect(readFileSync(join(f.project,'assets/enemies/caster_source.png')).equals(f.source)).toBe(true);
    expect(readFileSync(join(f.project,'assets/enemies/caster.png')).equals(f.image)).toBe(true);
    expect(JSON.parse(readFileSync(join(f.project,'generation_manifest.json'),'utf8')).artifacts[0].provider).toBe('diffusers');
  });
  it('rejects stale source and changed registration without saving a history version',async()=>{
    const f=fixture(), info=readMaterialArtwork(f.project,'caster');
    await expect(previewMaterialArtwork(f.project,'caster','0'.repeat(64),rules)).rejects.toThrow('changed');
    const preview=await previewMaterialArtwork(f.project,'caster',info.inspectionHash,rules);
    const path=join(f.project,'generation_manifest.json'), manifest=JSON.parse(readFileSync(path,'utf8'));manifest.artifacts[0].prompt='user change';writeFileSync(path,JSON.stringify(manifest));
    expect(()=>applyMaterialArtwork(f.project,'caster',preview.draftId)).toThrow('changed');
    expect(JSON.parse(readFileSync(path,'utf8')).assetHistory).toBeUndefined();
  });
  it('rejects wrong-project and consumed preview tokens',async()=>{
    const f=fixture(), other=fixture(), info=readMaterialArtwork(f.project,'caster');const preview=await previewMaterialArtwork(f.project,'caster',info.inspectionHash,rules);
    expect(()=>applyMaterialArtwork(other.project,'caster',preview.draftId)).toThrow('another image');
    applyMaterialArtwork(f.project,'caster',preview.draftId);
    expect(()=>applyMaterialArtwork(f.project,'caster',preview.draftId)).toThrow('expired');
  });
  it('rejects a changed game image even when the inspected source stays unchanged',async()=>{
    const f=fixture(), info=readMaterialArtwork(f.project,'caster');
    writeFileSync(join(f.project,'assets/enemies/caster.png'),encodePng(16,16,new Uint8Array(16*16*4).fill(255)));
    await expect(previewMaterialArtwork(f.project,'caster',info.inspectionHash,rules)).rejects.toThrow('changed');
  });
  it('rejects a project genre change after preview',async()=>{
    const f=fixture(), info=readMaterialArtwork(f.project,'caster'), preview=await previewMaterialArtwork(f.project,'caster',info.inspectionHash,rules);
    writeFileSync(join(f.project,'game_dna.json'),JSON.stringify({archetype:'TOP_DOWN_ACTION_ADVENTURE'}));
    expect(()=>applyMaterialArtwork(f.project,'caster',preview.draftId)).toThrow('changed');
    expect(readFileSync(join(f.project,'assets/enemies/caster.png')).equals(f.image)).toBe(true);
  });
  it('rejects external registration changes during foreground separation without overwriting them',async()=>{
    const f=fixture();const rgba=new Uint8Array(16*16*4);
    for(let y=2;y<14;y++)for(let x=5;x<11;x++)rgba.set([100,50,50,255],(y*16+x)*4);
    for(let i=3;i<rgba.length;i+=4)rgba[i]=255;
    writeFileSync(join(f.project,'assets/enemies/caster_source.png'),encodePng(16,16,rgba));
    const info=readMaterialArtwork(f.project,'caster');
    const provider={async segmentForeground(){const path=join(f.project,'generation_manifest.json'),m=JSON.parse(readFileSync(path,'utf8'));m.userWork='retained';writeFileSync(path,JSON.stringify(m));return {ok:true,buffer:f.source};}};
    await expect(previewMaterialArtwork(f.project,'caster',info.inspectionHash,rules,provider)).rejects.toThrow('changed');
    expect(JSON.parse(readFileSync(join(f.project,'generation_manifest.json'),'utf8')).userWork).toBe('retained');
    expect(readFileSync(join(f.project,'assets/enemies/caster.png')).equals(f.image)).toBe(true);
  });
  it('preserves all files when runtime mirrors conflict',async()=>{
    const f=fixture(), info=readMaterialArtwork(f.project,'caster'), preview=await previewMaterialArtwork(f.project,'caster',info.inspectionHash,rules);
    mkdirSync(join(f.project,'Assets/StreamingAssets/assets/enemies'),{recursive:true});writeFileSync(join(f.project,'Assets/StreamingAssets/assets/enemies/caster.png'),Buffer.from('different'));
    expect(()=>applyMaterialArtwork(f.project,'caster',preview.draftId)).toThrow('runtime copies differ');
    expect(readFileSync(join(f.project,'assets/enemies/caster.png')).equals(f.image)).toBe(true);
    expect(JSON.parse(readFileSync(join(f.project,'generation_manifest.json'),'utf8')).assetHistory).toBeUndefined();
  });
  it('rejects empty matches and unsupported sheets before any mutation',async()=>{
    const f=fixture(), info=readMaterialArtwork(f.project,'caster');
    await expect(previewMaterialArtwork(f.project,'caster',info.inspectionHash,[{...rules[0],from:'#ffffff'}])).rejects.toThrow('No source colors matched');
    const path=join(f.project,'generation_manifest.json'), m=JSON.parse(readFileSync(path,'utf8'));m.artifacts[0].frameCount=4;writeFileSync(path,JSON.stringify(m));
    expect(()=>readMaterialArtwork(f.project,'caster')).toThrow('static Workshop');
  });
});
