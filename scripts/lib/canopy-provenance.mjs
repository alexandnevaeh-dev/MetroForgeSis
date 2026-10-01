import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export function writeCanopyProvenance(project) {
  const game = JSON.parse(readFileSync(join(project,'GAME_SET.json')));
  const metadata = JSON.parse(readFileSync(join(project,'project.json')));
  const artifacts = game.assets.map(asset => {
    const hash = createHash('sha256').update(readFileSync(join(project,asset.path))).digest('hex');
    if(hash !== asset.sha256) throw new Error('Asset changed without provenance: '+asset.path);
    return {id:asset.path,jobId:'ruined-canopy-'+game.seed,type:asset.path.endsWith('.wav')?'audio':asset.path.endsWith('.png')?'image':'data',
      path:asset.path,provider:'procedural',model:null,promptHash:null,seed:game.seed,
      license:'MetroForge original procedural pixel art and synthesized test audio',timestamp:game.generatedAt,
      validationState:'pending',fallbackGenerated:false,maturity:'QA_REVIEW',productionReady:false,sourceType:'procedural',
      godotResourcePath:'res://'+asset.path,metadata:{sha256:hash,reviewReason:'First draft; native functionality does not imply production art approval'}};
  });
  writeFileSync(join(project,'generation_manifest.json'),JSON.stringify({version:'0.1.0',projectId:metadata.projectId,seed:game.seed,generatorVersion:'0.1.0',artifacts,createdAt:game.generatedAt},null,2));
  return artifacts.length;
}
