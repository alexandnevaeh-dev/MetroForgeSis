import {it,expect} from 'vitest';
import type {TopDownOverworld} from '@metroforge/procedural';
import {topDownRoomRecords} from './topdown-room-records.js';
it('lists runtime areas with pixel dimensions without losing authored fields',()=>{
 const world={areas:[{id:'court',kind:'overworld',widthTiles:40,heightTiles:20,tileSize:16,tiles:[[1]],propPlacements:[],custom:'keep'}]} as unknown as TopDownOverworld;
 const [room]=topDownRoomRecords(world);
 expect(room).toMatchObject({id:'court',width:640,height:320,editingMode:'topdown',propPlacements:[],custom:'keep'});
 expect(room).not.toHaveProperty('tileCells');expect(room).not.toHaveProperty('entityPlacements');
 room!.tiles[0]![0]=3;expect(world.areas[0]!.tiles[0]![0]).toBe(1);
});
it('rejects malformed and ambiguous area data',()=>{
 const area={id:'a',widthTiles:4,heightTiles:4,tileSize:16};
 for(const areas of [[area,area],[{...area,tileSize:0}],[{...area,widthTiles:NaN}]]) expect(()=>topDownRoomRecords({areas} as unknown as TopDownOverworld)).toThrow();
});
