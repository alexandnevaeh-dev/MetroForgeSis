import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {GenerationPipeline} from '../packages/generation/dist/index.js';
import {engineOutputSlug} from '../packages/shared/dist/index.js';
import {GameDNASchema} from '../packages/schemas/dist/index.js';
import {canopyTerrainV4} from '../packages/assets/dist/index.js';

const reportDir=resolve(process.env.METROFORGE_CANOPY_PROOF_REPORT??`reports/game-tests/canopy-generator-proof-${Date.now()}`);
if(!/^e:[\\/]/i.test(reportDir))throw new Error('The proof report must stay on E:');
mkdirSync(reportDir,{recursive:true});
const base=process.env.METROFORGE_GENERATED_GAMES_DIR;
if(!base||!/^e:[\\/]/i.test(base))throw new Error('An isolated E: generation output is required');
const slug=`canopy-generator-proof-${Date.now()}`;
const output=join(base,engineOutputSlug(slug,'godot'));
if(existsSync(output))throw new Error('Use a fresh output');
mkdirSync(output,{recursive:true});
const dna=GameDNASchema.parse(JSON.parse(readFileSync('packages/assets/src/fixtures/canopy-game-dna.json','utf8')));
if(process.env.METROFORGE_CANOPY_HD2D==='1')dna.identity.visualStyle+=' HD-2D inspired diorama';
// Start with only schema-validated design input; no artwork or prior generated game is copied.
writeFileSync(join(output,'game_dna.json'),JSON.stringify(dna,null,2));
const startedAt=new Date().toISOString();
const result=await new GenerationPipeline().run({prompt:dna.narrative.premise,profile:'TINY_TEST',
  mode:'LOCAL_ONLY',visualMode:'procedural-only',seed:dna.seed,slug,resume:true,
  archetype:'TOP_DOWN_ACTION_ADVENTURE',targetEngine:'godot',skipRuntimeValidation:true,skipExport:true,
  providerEnabled:{ollama:false,nvidia:false,gemini:false,groq:false,openrouter:false,huggingface:false},
  onPhase:(phase,status)=>console.log(`${phase}: ${status}`)});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const atlas=join(result.outputPath,'assets/tilesets/biome_0/source.png');
const rolePath=join(result.outputPath,'assets/tilesets/biome_0/terrain.json');
const expected=canopyTerrainV4();
const roles=existsSync(rolePath)?JSON.parse(readFileSync(rolePath,'utf8')):null;
const worldPath=join(result.outputPath,'data/world/overworld.json');
const world=existsSync(worldPath)?JSON.parse(readFileSync(worldPath,'utf8')):null;
const proof={startedAt,finishedAt:new Date().toISOString(),result,
  checks:{projectAssembled:result.success&&existsSync(join(result.outputPath,'project.godot')),
    requestedHD2DConfigured:process.env.METROFORGE_CANOPY_HD2D!=='1'||JSON.parse(readFileSync(join(result.outputPath,'data/visual/hd2d.json'),'utf8')).enabled===true,
    atlasMatchesNativeArtwork:existsSync(atlas)&&sha(readFileSync(atlas))===sha(expected.bytes),
    terrainRolesPreserved:roles?.tileSize===32&&JSON.stringify(roles.roles)===JSON.stringify(expected.roles),
    artworkStillDraft:roles?.productionApproved===false,
    woodlandComposition:world?.areas?.every(area=>area.canopyComposition&&area.floorRoles&&!/castle|chapel|crypt/i.test(area.name))===true,
    groundedPropsExported:world?.areas?.every(area=>Array.isArray(area.propPlacements)&&area.propPlacements.length>0&&area.propPlacements.every(prop=>existsSync(join(result.outputPath,prop.image.replace('res://','')))&&prop.layout.occlusionFade===true))===true},
  limits:['Schema-validated DNA checkpoint skips the AI design stage.','Native runtime and export deliberately run separately.','Detailed canopy actors use the built-in woodland route only when no image generator is active; model-provider actor routes remain separate.']};
writeFileSync(join(reportDir,'generation-proof.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify({outputPath:result.outputPath,checks:proof.checks,validationPassed:result.validationPassed,errors:result.errors}));
if(Object.values(proof.checks).some(value=>value!==true))process.exitCode=1;
