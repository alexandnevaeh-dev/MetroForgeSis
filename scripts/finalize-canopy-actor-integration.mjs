import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const report='reports/game-tests/20261001-canopy-actor-integration',final=join(report,'final-procedural');
const proof=JSON.parse(readFileSync(join(final,'generation-proof.json'))),project=proof.result.outputPath;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const tally=(file,marker,expected)=>{
 const bytes=readFileSync(join(final,file)),body=bytes.toString('utf8');
 const result={passed:(body.match(/^PASS:/gm)??[]).length,failed:(body.match(/^FAIL:/gm)??[]).length,optional:(body.match(/^SOFT_FAIL:/gm)??[]).length,sha256:hash(bytes)};
 if(!body.includes(marker)||body.includes('SCRIPT ERROR:')||result.failed||result.passed!==expected)throw Error('Incomplete native suite: '+file);
 return result;
};
const runtime=tally('native-runtime.log','SMOKE_TEST_RESULTS_END',169),detail=tally('native-detail-captures.log','GENERATED_CANOPY_DETAIL_END',106);
const captures=JSON.parse(readFileSync(join(project,'.qa/generated-detail/results.json')));
if(captures.failures||captures.checks!==106||captures.movieFrames!==186||!proof.result.validationPassed)throw Error('Incomplete final proof');
const source=readFileSync(join(report,'final-source-tests.log'),'utf8');
if(!/Tests\s+104 passed/.test(source))throw Error('Source regression suite missing');
const sets={};
for(const genre of ['topdown','metroidvania']) {
 const base=`GeneratedGames/test-games/${genre}/current`,bytes=readFileSync(join(base,'GAME_SET.json')),manifest=JSON.parse(bytes);
 for(const asset of manifest.assets)if(hash(readFileSync(join(base,asset.path)))!==asset.sha256)throw Error('Playable-set asset changed: '+genre+'/'+asset.path);
 sets[genre]={manifestSha256:hash(bytes),assets:manifest.assets.length};
}
if(sets.metroidvania.manifestSha256!=='a58c31df2513a902537bdd358f7e04859e06a2e7aaf531121b72332dc25828a4')throw Error('Side-view set changed');
const actor=JSON.parse(readFileSync(join(final,'assembled-actor-proof.json')));
const files=['scripts/core/VFXManager.gd','scripts/AI/TopDownEnemyController.gd','scripts/AI/BossController.gd','scripts/core/AnimatedAssetSprite.gd','scripts/player/TopDownPlayerController.gd','data/world/overworld.json', 'scripts/test/GeneratedCanopyActorAcceptance.gd','assets/characters/player_animations.json','assets/vfx/effects.json'];
const testedFiles=Object.fromEntries(files.map(path=>[path,hash(readFileSync(join(project,path)))]));
for(const name of ['hero-closeup','enemy-closeup','boss-closeup','hit_spark','death_puff','dash_trail','pickup_spark','ability_unlock','boss_phase_shift','area_burst','slam_shock','attack_warning'])copyFileSync(join(project,'.qa/generated-detail',name+'.png'),join(report,name+'.png'));
writeFileSync(join(report,'results.json'),JSON.stringify({project,runtime,detail,sourceTests:104,actor,captures,sets,testedFiles,productionApproved:false},null,2));
console.log(JSON.stringify({project,nativeChecks:runtime.passed+detail.passed,sourceTests:104,matchingSprites:actor.matchingNativeTestedSprites,sets,captures}));
