import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGodotRoomCollision } from '../packages/generation/dist/index.js';
import { decodePngRgba } from '../packages/assets/dist/index.js';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.argv[2] || 'E:/MetroForgeData/Releases/MetroForge-castle-backgrounds-20261004-v3/UserData/games/stormglass-castle');
const base = resolve(process.argv[3] || 'E:/MetroForgeData/TestArtifacts/room-geometry-grounding-20261004');
const project = join(base, 'games/stormglass-castle'); assert.match(base, /^E:[\\/]/i); assert.ok(!existsSync(project));
cpSync(source, project, { recursive: true, filter: path => !/[\\/](\.godot|qa|isolated-user-data|checkpoints)([\\/]|$)/.test(path) });
for (const file of ['scripts/world/StormglassDecor.gd', 'scripts/test/GroundingProbe.gd', 'scripts/test/RoomGeometryGroundingTest.gd', 'scenes/test/RoomGeometryGroundingTest.tscn']) cpSync(join(repo, 'templates/godot-metroidvania', file), join(project, file));
const geometry = Object.fromEntries(Object.keys(JSON.parse(readFileSync(join(project, 'data/rooms/rooms.json'), 'utf8')).rooms).map(id => [id, readGodotRoomCollision(project, id)]));
function silhouette(file) {
  const { width, height, rgba } = decodePngRgba(readFileSync(file)), visited = new Uint8Array(width * height), components = [];
  for (let seed = 0; seed < visited.length; seed++) {
    if (visited[seed] || rgba[seed * 4 + 3] < 31) continue;
    const queue = [seed]; visited[seed] = 1; let left = width, right = -1, bottom = -1;
    for (let head = 0; head < queue.length; head++) {
      const pixel = queue[head], x = pixel % width, y = Math.floor(pixel / width); left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const neighbor = yy * width + xx; if (visited[neighbor] || rgba[neighbor * 4 + 3] < 31) continue;
        visited[neighbor] = 1; queue.push(neighbor);
      }
    }
    components.push({ pixels: queue.length, left, right, bottom });
  }
  components.sort((a, b) => b.pixels - a.pixels);
  assert.ok(components.length); return { width, height, ...components[0], componentCount: components.length };
}
const paths = ['assets/props/biome_0', 'assets/architecture/stormglass/conditions'].flatMap(dir => readdirSync(join(project, dir)).filter(name => name.endsWith('.png')).map(name => dir + '/' + name));
const alpha = Object.fromEntries(paths.map(path => ['res://' + path, silhouette(join(project, path))]));
const qa = join(project, 'qa/room-geometry-grounding'); mkdirSync(qa, { recursive: true });
writeFileSync(join(qa, 'expected.json'), JSON.stringify({ rooms: geometry, alpha }, null, 2));
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const proof = { source, project, scope: 'Separate castle candidate; geometry parsed from actual source scenes, alpha measurements read from existing PNGs. No source games, artwork or top-down sets modified.', sceneHashes: Object.fromEntries(Object.keys(geometry).map(id => [id, sha(join(project, 'scenes/rooms', id + '.tscn'))])), artHashes: Object.fromEntries(paths.map(path => [path, sha(join(project, path))])) };
writeFileSync(join(base, 'preparation.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify({ project, rooms: Object.keys(geometry).length, shapes: Object.values(geometry).reduce((n, room) => n + room.rects.length, 0), alphaAssets: paths.length }));
