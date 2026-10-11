import {beforeEach,afterEach,it,expect} from 'vitest';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {readArchiveFurnishings} from './archive-furnishing-authoring.js';
import {readArchiveFurnishingReview} from './archive-furnishing-review.js';
let project:string,reply:any;
const put=(rel:string,value:string)=>{mkdirSync(dirname(join(project,rel)),{recursive:true});writeFileSync(join(project,rel),value);};
beforeEach(()=>{
 project=mkdtempSync(join(tmpdir(),'archive-review-'));
 put('project.godot','[application]');put('game_dna.json',JSON.stringify({archetype:'SIDE_VIEW_METROIDVANIA',identity:{title:'Stormglass Reliquary'}}));
 put('data/rooms/rooms.json',JSON.stringify({rooms:{room_047:{width:1536,height:1536}}}));put('scenes/rooms/room_047.tscn','scene');
 put('data/visual/stormglass-room-kits.json',JSON.stringify({version:1,rooms:{room_047:{archiveBays:[{id:'Desk',kind:'scribe-desk',x:1088,width:192,height:40}]}}}));
 const sourceHashes:any={...readArchiveFurnishings(project,'room_047').sourceHashes};
 for(const [key,name]of Object.entries({kitScript:'StormglassRoomKit',decorScript:'StormglassDecor',bridgeScript:'StudioRuntimeBridge'})){
  const rel='scripts/'+(key==='bridgeScript'?'core/':'world/')+name+'.gd';put(rel,name);sourceHashes[key]=createHash('sha256').update(readFileSync(join(project,rel))).digest('hex');
 }
 reply={ok:true,archiveFurnishings:[{roomId:'room_047',sourceHashes,reviews:[{id:'Desk',status:'placed',reason:'',requestedHeight:40,actualHeight:40,visualApproved:false}]}]};
});
afterEach(()=>rmSync(project,{recursive:true,force:true}));
it('returns exact native placement without art approval or project mutation',()=>{
 const before=readFileSync(join(project,'data/visual/stormglass-room-kits.json'));
 expect(readArchiveFurnishingReview(project,'room_047',reply)).toMatchObject({visualApproved:false,rows:[{id:'Desk',status:'placed',actualHeight:40}]});
 reply.archiveFurnishings[0].reviews[0]={id:'Desk',status:'omitted',reason:'unsupported-footprint',requestedHeight:40,actualHeight:0,visualApproved:false};
 expect(readArchiveFurnishingReview(project,'room_047',reply).rows[0].reason).toBe('unsupported-footprint');expect(readFileSync(join(project,'data/visual/stormglass-room-kits.json'))).toEqual(before);
});
it.each(['config','rooms','scene','dna','kitScript','decorScript','bridgeScript'])('rejects stale %s loaded source',key=>{reply.archiveFurnishings[0].sourceHashes[key]='0'.repeat(64);expect(()=>readArchiveFurnishingReview(project,'room_047',reply)).toThrow('stale');});
it.each([{visualApproved:true},{status:'approved'},{actualHeight:Infinity},{requestedHeight:41},{id:'invented'},{reason:'invented'},{actualHeight:0}])('rejects misleading native rows %j',patch=>{Object.assign(reply.archiveFurnishings[0].reviews[0],patch);expect(()=>readArchiveFurnishingReview(project,'room_047',reply)).toThrow('Invalid');});
it('refuses wrong room, duplicate rooms and incomplete rows',()=>{
 const room=reply.archiveFurnishings[0];reply.archiveFurnishings=[];expect(()=>readArchiveFurnishingReview(project,'room_047',reply)).toThrow('Enter this room');
 reply.archiveFurnishings=[room,room];expect(()=>readArchiveFurnishingReview(project,'room_047',reply)).toThrow('Enter this room');
 reply.archiveFurnishings=[{...room,reviews:[]}];expect(()=>readArchiveFurnishingReview(project,'room_047',reply)).toThrow('Incomplete');
});

it('rejects native shrinking of an explicitly preserved-size request',()=>{
 const rel='data/visual/stormglass-room-kits.json',config=JSON.parse(readFileSync(join(project,rel),'utf8'));config.rooms.room_047.archiveBays[0].preserveSize=true;put(rel,JSON.stringify(config));reply.archiveFurnishings[0].sourceHashes.config=readArchiveFurnishings(project,'room_047').sourceHashes.config;reply.archiveFurnishings[0].reviews[0].actualHeight=32;
 expect(()=>readArchiveFurnishingReview(project,'room_047',reply)).toThrow('Invalid');
});
