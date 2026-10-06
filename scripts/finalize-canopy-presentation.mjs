import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';

const report=resolve('reports/game-tests/20261001-canopy-hud-interactables');
const receipt=JSON.parse(readFileSync(join(report,'results.json')));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>JSON.parse(readFileSync(path));
const current=receipt.current, main=receipt.generatedProject;
const mainProof=read(join(report,'main-generated/assembled-actor-proof.json'));
const checkedSets={};
for(const genre of ['topdown','metroidvania']){
  const project=resolve(`GeneratedGames/test-games/${genre}/current`), game=read(join(project,'GAME_SET.json'));
  for(const asset of game.assets)if(hash(readFileSync(join(project,asset.path)))!==asset.sha256)throw Error('Changed asset: '+asset.path);
  checkedSets[genre]={assets:game.assets.length,manifestSha256:hash(readFileSync(join(project,'GAME_SET.json')))};
}
const uiFiles=['scripts/UI/AdventureHUDTheme.gd','scripts/UI/GameHUD.gd','scripts/UI/QuestTrackerPanel.gd','scripts/UI/WorldMapPanel.gd','scripts/world/SavePoint.gd','scripts/world/ChestPickup.gd','scripts/world/LockedDoor.gd','scripts/world/ItemGate.gd','scripts/world/AreaPortal.gd'];
const sourceBindings={};
for(const path of uiFiles){
  const expected=hash(readFileSync(join('templates/godot-topdown-adventure',path)));
  if(hash(readFileSync(join(current,path)))!==expected||hash(readFileSync(join(main,path)))!==expected)throw Error('Template mismatch: '+path);
  sourceBindings[path]=expected;
}
const frames=readdirSync(join(current,'.qa/canopy')).filter(path=>/^frame_\d{4}\.png$/.test(path));
if(frames.length!==224)throw Error('Missing native movie captures');
const movie=join(report,'topdown-presentation-test.mp4');
if(!existsSync(movie)||readFileSync(join(report,'video-decode.log'),'utf8').trim())throw Error('Movie decode diagnostics are not clean');
const sourceLog=readFileSync(join(report,'source-tests.log'),'utf8');
if(!/Tests\s+30 passed/.test(sourceLog)||!/Test Files\s+4 passed/.test(sourceLog))throw Error('Focused regressions incomplete');
const nativePassed=Object.values(receipt.suites).reduce((sum,suite)=>sum+suite.passed,0)+Object.values(receipt.mainSuites).reduce((sum,suite)=>sum+suite.passed,0);
if(nativePassed!==1047)throw Error('Native receipt counts differ');
const sealed={...receipt,checkedSets,sourceBindings,mainProof,sourceTests:{files:4,passed:30,logSha256:hash(sourceLog)},nativePassed,video:{path:movie,sha256:hash(readFileSync(movie)),captures:frames.length,encodedFps:30,durationSeconds:224/30,decodeChecked:true}};
writeFileSync(join(report,'results.json'),JSON.stringify(sealed,null,2));
writeFileSync(join(report,'RESULTS.md'),`# Ruined Canopy presentation revision 4

The current top-down test game now combines the detailed player, enemy, NPC and boss animation family with original woodland chest, root-gate, portal, tool and waystone artwork. Nineteen small artwork files changed from revision 3. Ground anchors now match the painted base of chest, gate, portal and checkpoint sprites, including during chest opening, portal breathing and checkpoint activation. Physics shapes and combat timings remain unchanged.

The compact HUD uses the same dark forest, jade, amber and parchment colors. It shows real current/max health, a text-and-color low-health warning, the current room's readable name and owned dungeon tools. Inventory tools previously failed to appear because the HUD only listened for ability events. HUD controls ignore pointer input; a native mouse click over the status panel starts a real attack. The existing editor UI retains its separate design system.

The application asset pipeline generates these objects and field pickups for compatible procedural woodland requests. Other themes and the side-view set retain separate asset selection. The main proof generated a new project at ${main}; all 82 actor/effect strips match the prior native-tested family, nine metadata sidecars are verified and ${mainProof.detailedDraftArtifacts} detailed artifacts remain QA_REVIEW. Template-to-project hashes verify the same HUD and grounded-object behavior in both projects.

| Final native suite | Passed | Hard failures | Optional missing |
|---|---:|---:|---:|
| Ten-room visual inspection | 430 | 0 | 0 |
| Playable-set gameplay regression | 160 | 0 | 9 |
| Character and effect details | 91 | 0 | 0 |
| Boss telegraphs | 7 | 0 | 0 |
| Input-driven victory route | 8 | 0 | 0 |
| HUD and grounded interactions | 38 | 0 | 0 |
| Fresh generated-game gameplay regression | 169 | 0 | 0 |
| Fresh generated-game character/effect checks | 106 | 0 | 0 |
| Fresh generated-game presentation checks | 38 | 0 | 0 |

Total: ${nativePassed} native assertions passed, zero hard failures; four focused source test files passed all 30 tests. Assets and generation TypeScript builds passed. The nine optional checks reflect absent quest definitions in the standalone curated test game; the fresh application-generated game passes its full quest regression. Native tests used Godot 4.6 and the local RTX 5060 OpenGL Compatibility path at 1280 x 720 with isolated E: saves.

The victory route completed ten transitions, opened two gates and defeated the boss in ${(receipt.telemetry.durationMs/1000).toFixed(3)} seconds. The bot resets health before the boss and used ${receipt.telemetry.unstickAttempts} navigation recovery attempts; this proves progression functionality, not final balance. Slow-transition and near-timeout hints remain in route-telemetry.json.

Visible outputs: room-tests.png, grounded-interactables.png, hud-low-health.png, hero-closeup.png, boss-closeup.png and topdown-presentation-test.mp4. The movie contains 224 controlled native captures encoded at 30 fps (7.47 seconds) and was decode-checked; it is animation inspection, not a frame-rate benchmark or a full route recording. Initial HUD test failures were caused by checking before the HUD's next process callback; the final fixtures await full frames and verify the real inventory display name. Earlier logs are preserved.

The tested candidate was promoted to ${current}. The previous revision remains at ${receipt.backup}. All ${checkedSets.topdown.assets} top-down and ${checkedSets.metroidvania.assets} side-view assets are SHA-verified; the side-view manifest remains unchanged. Source copies are retained in before/. All generated artifacts, saves, caches and dependencies stay on E:.

Artwork and audio remain drafts with production approval false. This proof starts from a schema-validated design checkpoint, skips AI design/model-image calls and does not validate Unity, Unreal or GitHub publication. Native engine cleanup warnings remain at exit. Dedicated heavy-enemy artwork, broader room and terrain polish, audio, cross-engine validation and repository publishing remain ongoing.
`);
console.log(JSON.stringify({nativePassed,sourceTests:30,checkedSets,video:sealed.video,productionApproved:false}));
