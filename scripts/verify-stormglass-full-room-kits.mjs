import assert from 'node:assert/strict';
import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateStormglassGalleryCampaign} from '../packages/godot/dist/index.js';
import {configureStormglassGalleryRoomKits as admit} from '../packages/godot/dist/stormglass-room-kits.js';
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),project=process.argv[2];
if(!project)throw new Error('Pass the isolated generated project');
const dna=JSON.parse(readFileSync(join(project,'game_dna.json'),'utf8'));
const {worldGraph:graph}=generateStormglassGalleryCampaign(dna,20261006);
const output=join(repo,'reports/game-tests/20261006-full-room-kits',String(Date.now()));mkdirSync(output,{recursive:true});
const configSource=join(repo,'templates/godot-metroidvania/data/visual/blueprints/stormglass-gallery-room-kits-v1.json');
const config=JSON.parse(readFileSync(configSource,'utf8').replace(/^\uFEFF/,''));
const checks=[];
const fixture=name=>{const root=join(output,name);mkdirSync(join(root,'data/visual/blueprints'),{recursive:true});cpSync(join(repo,'templates/godot-metroidvania/assets/architecture/stormglass/kits'),join(root,'assets/architecture/stormglass/kits'),{recursive:true});cpSync(configSource,join(root,'data/visual/blueprints/stormglass-gallery-room-kits-v1.json'));return root;};
const check=(name,fn)=>{fn();checks.push({name,passed:true});};
check('all43selected campaign kits admitted',()=>{const root=fixture('full');assert.equal(admit(root,dna,graph),true);assert.equal(Object.keys(JSON.parse(readFileSync(join(root,'data/visual/stormglass-room-kits.json'),'utf8')).rooms).length,43);});
check('legacy opening adapter retains eleven kits',()=>{const root=fixture('legacy'),legacy=structuredClone(graph);for(const node of legacy.nodes)delete node.metadata.stormglassCampaignLayout;assert.equal(admit(root,dna,legacy),true);assert.equal(Object.keys(JSON.parse(readFileSync(join(root,'data/visual/stormglass-room-kits.json'),'utf8')).rooms).length,11);});
check('user authored target preserved',()=>{const root=fixture('owned'),target=join(root,'data/visual/stormglass-room-kits.json'),bytes=Buffer.from('{"user":"keep"}\n');writeFileSync(target,bytes);assert.equal(admit(root,dna,graph),false);assert.deepEqual(readFileSync(target),bytes);});
for(const [name,mutate] of [
 ['missing campaign room',c=>delete c.rooms.room_021],
 ['unknown wall role',c=>c.rooms.room_021.wallRole='missing_wall'],
 ['unknown prop role',c=>c.rooms.room_021.props[0].role='missing_prop'],
 ['invalid district color',c=>c.rooms.room_021.wallTint='not-a-color'],
 ['invalid prop height',c=>c.rooms.room_021.props[0].height=0],
])check(name+' rejected',()=>{const root=fixture(name.replaceAll(' ','-')),changed=structuredClone(config);mutate(changed);writeFileSync(join(root,'data/visual/blueprints/stormglass-gallery-room-kits-v1.json'),JSON.stringify(changed));assert.equal(admit(root,dna,graph),false);assert.equal(existsSync(join(root,'data/visual/stormglass-room-kits.json')),false);});
check('topdown isolation',()=>assert.equal(admit(fixture('topdown'),{...dna,archetype:'TOP_DOWN_METROIDVANIA'},graph),false));
writeFileSync(join(output,'proof.json'),JSON.stringify({passed:true,scope:'Full43room configuration admission,asset hashes,role/color/value checks,legacy11room fallback,user ownership,topdown isolation. Native visual/gameplay evidence separate.',checks},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,output}));
