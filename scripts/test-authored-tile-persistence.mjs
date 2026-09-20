import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyRoomEditAndRecompile } from '../packages/generation/dist/project-edit-service.js';
const source = process.argv[2];
if (!source) throw new Error('Provide a generated project fixture');
const project = mkdtempSync(join(tmpdir(), 'metroforge-authored-tiles-'));
mkdirSync(join(project, 'data/rooms'), { recursive: true });
for (const file of ['game_dna.json','world_graph.json','data/rooms/rooms.json']) copyFileSync(join(source,file),join(project,file));
writeFileSync(join(project,'project.godot'),'config_version=5\n');
const roomsPath=join(project,'data/rooms/rooms.json');
const roomId=Object.keys(JSON.parse(readFileSync(roomsPath)).rooms)[0];
for (let i=0;i<10;i++) {
  const dir=join(project,`assets/tilesets/biome_${i}`); mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'source.png'),'existence-only fixture; not a runtime texture');
}
const scene=()=>readFileSync(join(project,'scenes/rooms',`${roomId}.tscn`),'utf8');
const room=()=>JSON.parse(readFileSync(roomsPath)).rooms[roomId];
const painted=[{x:3,y:4,col:6,row:2}];
for (const cells of [painted,[]]) {
  const result=applyRoomEditAndRecompile(project,{roomId,tileCells:cells});
  assert.equal(result.success,true,result.errors.join('\n'));
  assert.deepEqual(room().tileCells,cells);
  assert.equal(room().tileCellsAuthored,true);
  assert.match(scene(),/authored_cells = true/);
  if (!cells.length) assert.match(scene(),/painted_cells_json = "\[\]"/);
  const resized=applyRoomEditAndRecompile(project,{roomId,width:960});
  assert.equal(resized.success,true,resized.errors.join('\n'));
  assert.deepEqual(room().tileCells,cells,'Unrelated recompilation must preserve Studio paint');
}
console.log('PASS: explicit empty/nonempty tile paint persists through actual assembler and subsequent room resize');

if (process.env.GODOT_EXECUTABLE) {
  const { spawnSync } = await import('node:child_process');
  const fixture = mkdtempSync(join(tmpdir(), 'metroforge-native-tile-'));
  writeFileSync(join(fixture, 'project.godot'), 'config_version=5\n');
  copyFileSync(new URL('../templates/godot-metroidvania/scripts/world/RoomTileMap.gd', import.meta.url), join(fixture, 'RoomTileMap.gd'));
  copyFileSync(new URL('./fixtures/authored-tile-runtime.gd', import.meta.url), join(fixture, 'test.gd'));
  const result = spawnSync(process.env.GODOT_EXECUTABLE, ['--headless', '--path', fixture, '--script', 'test.gd'], { stdio: 'inherit', timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0, result.error?.message ?? 'Native authored tile test failed');
} else console.log('SKIPPED native Godot tile test: set GODOT_EXECUTABLE');
