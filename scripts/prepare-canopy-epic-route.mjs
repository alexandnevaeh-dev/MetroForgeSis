import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
const candidate=resolve(process.argv[2]??'');
const root=resolve('GeneratedGames/test-games/topdown');
if(!candidate.startsWith(root+sep)||!candidate.includes('candidate-canopy-'))throw Error('Expected a separate top-down test candidate');
const path=join(candidate,'playtest_route.json');
const route=JSON.parse(readFileSync(path));
const graph=JSON.parse(readFileSync(join(candidate,'data/world/world_graph.json')));
const rooms=['overworld','dungeon_000_r0','canopy_clearing','canopy_hamlet','canopy_archive','canopy_observatory','canopy_archive','canopy_hamlet','canopy_clearing','canopy_hollow','canopy_bridge','canopy_gardens','canopy_cistern','canopy_moonwell','canopy_cistern','canopy_gardens','canopy_bridge','dungeon_000_r1','canopy_secret','dungeon_000_r1','canopy_bridge','canopy_clearing','dungeon_000_r2','canopy_approach','dungeon_000_r3'];
route.transitions=rooms.slice(1).map((to,index)=>{
  const from=rooms[index];
  const edge=graph.edges.find(edge=>(edge.from===from&&edge.to===to)||(edge.bidirectional&&edge.to===from&&edge.from===to));
  if(!edge)throw Error('No real transition: '+from+' -> '+to);
  return {fromRoomId:from,toRoomId:to,requirements:edge.requirements};
});
route.visitedRoomOrder=rooms;
writeFileSync(path,JSON.stringify(route,null,2));
console.log(JSON.stringify({candidate,transitions:route.transitions.length,uniqueAreas:new Set(rooms).size}));
