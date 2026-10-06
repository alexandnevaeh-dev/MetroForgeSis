import {describe,it,expect} from 'vitest';
import {generateRoomScene,type RoomAssemblyOptions} from './room-assembler.js';
const opts:RoomAssemblyOptions={hasEnemy:false,enemyIndex:0,hasAbilityPickup:false,abilityPickups:[],isBossRoom:false,bossId:'',hasSavePoint:false,width:1024,height:1536,biomeIndex:0,connections:[{direction:'up',targetRoomId:'room_001',requirements:[]}],hasTileset:false,tileSize:32,npcs:[],hasItemPickup:false,itemId:'',itemAmount:0};
describe('authored gallery stairwell ports',()=>{
 it('puts the ascent port above the final landing instead of on the bottom walk line',()=>{
  expect(generateRoomScene('room_002',2,{...opts,stormglassRoomTheme:'stairwell',hasTileset:true,platforms:[{x:96,y:1376,width:160,height:32}]})).toContain('one_way_collision = true');
  expect(generateRoomScene('room_002',2,{...opts,stormglassRoomTheme:'stairwell',hasTileset:true,platforms:[{x:96,y:1376,width:160,height:32}]})).toContain('position = Vector2(500, 32)\ntarget_room_id = "room_001"');
 });
 it('preserves existing up-port placement for rooms outside the authored stairwell',()=>{
  expect(generateRoomScene('room_002',2,opts)).toContain('position = Vector2(500, 1392)\ntarget_room_id = "room_001"');
 });
});
