import assert from 'node:assert/strict';
import {
  recordLivePlacementEdit,
  undoRoomEdit,
  redoRoomEdit,
  canUndoRoom,
  canRedoRoom,
} from '../apps/desktop/dist-electron/edit-history-store.js';
import {
  applyRoomEditAndRecompile,
  applyWorldEditAndRecompile,
} from '../packages/generation/dist/project-edit-service.js';
import { resolveEntityPlacements } from '../packages/godot/dist/entity-placements.js';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { generateRoomScene } from '../packages/godot/dist/room-assembler.js';
import {
  startPlaytest,
  stopPlaytest,
  sendPlaytestCommand,
  getPlaytestSession,
} from '../packages/tools/dist/playtest-session.js';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import {
  inspectPlacementForSave,
  saveAuthoredPlacement,
} from '../packages/generation/dist/live-placement-save.js';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  inspectLivePlacement,
  saveLivePlacement,
} from '../apps/desktop/dist-electron/live-placement-save.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const project = join(root, '.metroforge', 'live-bridge-smoke', String(Date.now()));
const godot = process.env.GODOT_EXECUTABLE;
if (!godot) throw new Error('Set GODOT_EXECUTABLE to the native editor binary');
mkdirSync(join(project, 'scenes', 'rooms'), { recursive: true });
mkdirSync(join(project, 'data', 'rooms'), { recursive: true });
copyFileSync(
  join(root, 'templates/godot-metroidvania/scripts/core/StudioRuntimeBridge.gd'),
  join(project, 'StudioRuntimeBridge.gd'),
);
writeFileSync(
  join(project, 'project.godot'),
  'config_version=5\n[application]\nrun/main_scene="res://scenes/rooms/room_test.tscn"\n[autoload]\nStudioRuntimeBridge="*res://StudioRuntimeBridge.gd"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n',
);
const options = {
  hasEnemy: true,
  enemyIndex: 0,
  hasAbilityPickup: true,
  abilityPickups: ['dash'],
  isBossRoom: false,
  bossId: 'boss_1',
  hasSavePoint: true,
  width: 960,
  height: 540,
  biomeIndex: 0,
  connections: [],
  hasTileset: false,
  tileSize: 16,
  npcs: [{ id: 'guide', name: 'Guide', role: 'merchant', questIds: [] }],
  hasItemPickup: true,
  itemId: 'potion',
  itemAmount: 1,
};
const scene = generateRoomScene('room_test', 0, options);
const precisePlacements = [{ kind: 'enemy', id: 'enemy_000', x: 92.25, y: 73.5 }];
assert.deepEqual(resolveEntityPlacements(precisePlacements, options), precisePlacements);
assert.match(
  generateRoomScene('room_test', 0, { ...options, entityPlacements: precisePlacements }),
  /position = Vector2\(92\.25, 73\.5\)/,
);

const metadataFor = (source, nodeName) => {
  const section = source.split(`[node name="${nodeName}"`)[1]?.split('\n[node ')[0];
  return (
    section
      ?.split('\n')
      .filter((line) => line.startsWith('metadata/'))
      .join('\n') ?? ''
  );
};
for (const name of ['Player', 'Enemy', 'AbilityPickup_dash', 'SavePoint', 'NPC_0', 'ItemPickup']) {
  assert.match(metadataFor(scene, name), /metroforge_room_id = "room_test"/, name);
}
assert.match(
  metadataFor(generateRoomScene('boss_room', 0, { ...options, isBossRoom: true }), 'Boss'),
  /metroforge_entity_kind = "boss"/,
);
assert.equal(metadataFor(scene, 'Sprite'), '');
const ambiguous = generateRoomScene('room_test', 0, {
  ...options,
  entityPlacements: [
    { kind: 'enemy', id: 'enemy_000', x: 20, y: 30 },
    { kind: 'enemy', id: 'enemy_000', x: 40, y: 50 },
  ],
});
assert.equal(metadataFor(ambiguous, 'Enemy'), '', 'Ambiguous placements cannot be save targets');
assert.equal(metadataFor(ambiguous, 'Player'), '', 'Unsaved fallback cannot be a save target');
writeFileSync(
  join(project, 'scenes', 'rooms', 'room_test.tscn'),
  `[gd_scene format=3]
[node name="World" type="Node2D"]
[node name="Enemy" type="Node2D" parent="."]
position = Vector2(20, 30)
${metadataFor(scene, 'Enemy')}
[node name="Sprite" type="Node2D" parent="Enemy"]
[node name="Invalid" type="Node2D" parent="."]
metadata/metroforge_room_id = "room_test"
metadata/metroforge_entity_kind = "unknown"
metadata/metroforge_entity_id = "bad"
`,
);
const roomsPath = join(project, 'data', 'rooms', 'rooms.json');
const scenePath = join(project, 'scenes', 'rooms', 'room_test.tscn');
const identity = { roomId: 'room_test', kind: 'enemy', id: 'enemy_000' };
writeFileSync(
  roomsPath,
  JSON.stringify({
    custom: 'preserve',
    rooms: {
      room_test: {
        title: 'Keep room fields',
        entityPlacements: [{ kind: 'enemy', id: 'enemy_000', x: 20, y: 30 }],
      },
    },
  }),
);
const snapshot = inspectPlacementForSave(project, identity);
const originalRooms = readFileSync(roomsPath, 'utf8');
const originalScene = readFileSync(scenePath, 'utf8');
for (const engine of ['unity', 'unreal']) {
  writeFileSync(join(project, 'engine.json'), JSON.stringify({ engine }));
  assert.equal(
    applyRoomEditAndRecompile(project, { roomId: 'room_test', width: 100 }).success,
    false,
  );
  assert.equal(
    applyWorldEditAndRecompile(project, { type: 'move_room', roomId: 'room_test', x: 1, y: 2 })
      .success,
    false,
  );
  assert.throws(
    () => saveAuthoredPlacement(project, identity, snapshot.revision, { x: 100, y: 100 }),
    /requires a Godot project/,
  );
  assert.equal(readFileSync(roomsPath, 'utf8'), originalRooms);
  assert.equal(readFileSync(scenePath, 'utf8'), originalScene);
}
unlinkSync(join(project, 'engine.json'));
assert.throws(
  () => saveAuthoredPlacement(project, identity, snapshot.revision, { x: NaN, y: 1 }),
  /finite/,
);
assert.throws(
  () => inspectPlacementForSave(project, { ...identity, roomId: '../room_test' }),
  /Invalid/,
);
writeFileSync(roomsPath, originalRooms + '\n');
assert.throws(
  () => saveAuthoredPlacement(project, identity, snapshot.revision, { x: 10, y: 10 }),
  /changed since inspection/,
);
assert.equal(readFileSync(scenePath, 'utf8'), originalScene);
writeFileSync(roomsPath, originalRooms);
// Inject failure on the second artifact write, after the scene was changed.
const originalWrite = fs.writeFileSync;
let injected = false;
try {
  fs.writeFileSync = (path, ...args) => {
    if (path === roomsPath && !injected) {
      injected = true;
      throw new Error('Injected rooms write failure');
    }
    return originalWrite(path, ...args);
  };
  syncBuiltinESMExports();
  assert.throws(
    () => saveAuthoredPlacement(project, identity, snapshot.revision, { x: 10, y: 10 }),
    /original source restored/,
  );
} finally {
  fs.writeFileSync = originalWrite;
  syncBuiltinESMExports();
}
assert.equal(injected, true);
assert.equal(readFileSync(roomsPath, 'utf8'), originalRooms);
assert.equal(readFileSync(scenePath, 'utf8'), originalScene);
try {
  const result = await startPlaytest(project, { preference: godot, headless: true });
  assert.equal(result.success, true, result.message);
  let ready;
  for (let i = 0; i < 40; i++) {
    ready = await sendPlaytestCommand(project, 'get_state');
    if (ready.ok) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(ready.ok, true, ready.error);
  const replies = await Promise.all([
    sendPlaytestCommand(project, 'pause'),
    sendPlaytestCommand(project, 'get_state'),
    sendPlaytestCommand(project, 'set_entity_position', { nodePath: 'Enemy', x: 91, y: 72 }),
  ]);
  assert(
    replies.every((r) => r.ok),
    JSON.stringify(replies),
  );
  assert.deepEqual(
    replies.map((r) => r.result.cmd),
    ['pause', 'get_state', 'set_entity_position'],
  );
  assert.equal(new Set(replies.map((r) => r.result.requestId)).size, 3);
  const inspected = await sendPlaytestCommand(project, 'get_state');
  assert.equal(inspected.result.objects.find((x) => x.nodePath === 'Enemy').x, 91);
  const enemy = inspected.result.objects.find((x) => x.nodePath === 'Enemy');
  assert.equal(typeof enemy.instanceId, 'string');
  assert.deepEqual(enemy.authored, { roomId: 'room_test', kind: 'enemy', id: 'enemy_000' });
  assert.equal(
    inspected.result.objects.find((x) => x.nodePath === 'Enemy/Sprite').authored,
    undefined,
  );
  assert.equal(inspected.result.objects.find((x) => x.nodePath === 'Invalid').authored, undefined);
  // Viewport selection: pick_at nearest Node2D at Enemy world position, then clear.
  const picked = await sendPlaytestCommand(project, 'pick_at', { x: enemy.x, y: enemy.y });
  assert.equal(picked.ok, true, picked.error);
  assert.equal(picked.result.picked, true);
  assert.equal(picked.result.selection.nodePath, 'Enemy');
  const withSelection = await sendPlaytestCommand(project, 'get_state');
  assert.equal(withSelection.result.selection.nodePath, 'Enemy');
  assert.equal((await sendPlaytestCommand(project, 'clear_selection')).ok, true);
  assert.equal((await sendPlaytestCommand(project, 'get_state')).result.selection, null);
  const miss = await sendPlaytestCommand(project, 'pick_at', { x: 99999, y: 99999 });
  assert.equal(miss.ok, true);
  assert.equal(miss.result.picked, false);
  const stale = await sendPlaytestCommand(project, 'set_entity_position', {
    nodePath: 'Enemy',
    expectedInstanceId: 'stale-instance',
    x: 0,
    y: 0,
  });
  assert.equal(stale.ok, false);
  const matching = await sendPlaytestCommand(project, 'set_entity_position', {
    nodePath: 'Enemy',
    expectedInstanceId: enemy.instanceId,
    x: 92.25,
    y: 73.5,
  });
  assert.equal(matching.ok, true);
  const protectedCommand = await sendPlaytestCommand(project, 'get_state', {
    cmd: 'set_entity_position',
    requestId: 'injected',
    nodePath: 'Enemy',
    x: 0,
    y: 0,
  });
  assert.equal(protectedCommand.result.cmd, 'get_state');
  assert.notEqual(protectedCommand.result.requestId, 'injected');
  assert.equal((await sendPlaytestCommand(project, 'resume')).ok, true);
  stopPlaytest(project);
  const restarted = await startPlaytest(project, { preference: godot, headless: true });
  assert.equal(restarted.success, true, restarted.message);
  let restored;
  for (let i = 0; i < 40; i++) {
    restored = await sendPlaytestCommand(project, 'get_state');
    if (restored.ok) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(restored.ok, true, restored.error);
  const restoredEnemy = restored.result.objects.find((x) => x.nodePath === 'Enemy');
  assert.deepEqual(restoredEnemy.authored, enemy.authored);
  assert.equal(restoredEnemy.x, 20, 'Temporary movement must not silently save source');
  assert.equal(restoredEnemy.y, 30);
  const target = {
    nodePath: 'Enemy',
    instanceId: restoredEnemy.instanceId,
    sessionStartedAt: getPlaytestSession(project).startedAt,
  };
  const inspection = await inspectLivePlacement(project, target);
  await assert.rejects(
    () =>
      saveLivePlacement(
        project,
        { ...inspection, projectPath: join(project, 'other') },
        { x: 20, y: 30 },
      ),
    /another project/,
  );
  await assert.rejects(
    () => inspectLivePlacement(project, { ...target, sessionStartedAt: 'old-session' }),
    /session changed/,
  );
  await assert.rejects(
    () => inspectLivePlacement(project, { ...target, instanceId: 'old-object' }),
    /object changed/,
  );
  await assert.rejects(
    () => saveLivePlacement(project, inspection, { x: 92.25, y: 73.5 }),
    /position changed/,
  );
  assert.equal(readFileSync(roomsPath, 'utf8'), originalRooms);
  assert.equal(
    (
      await sendPlaytestCommand(project, 'set_entity_position', {
        nodePath: 'Enemy',
        expectedInstanceId: restoredEnemy.instanceId,
        x: 92.25,
        y: 73.5,
      })
    ).ok,
    true,
  );
  const receipt = await saveLivePlacement(project, inspection, { x: 92.25, y: 73.5 });
  assert.equal(receipt.previousRoom.title, 'Keep room fields');
  assert.equal(receipt.previousRoom.entityPlacements[0].x, 20);
  assert.notEqual(receipt.saved.revision, snapshot.revision);
  recordLivePlacementEdit(project, receipt.saved, receipt.previousRoom);
  const savedRoomsText = readFileSync(roomsPath, 'utf8');
  const savedSceneText = readFileSync(scenePath, 'utf8');
  writeFileSync(roomsPath, savedRoomsText + '\n');
  assert.equal(undoRoomEdit(project).success, false, 'Source conflict must keep undo history');
  assert.equal(canUndoRoom(project), true);
  assert.equal(canRedoRoom(project), false);
  writeFileSync(roomsPath, savedRoomsText);
  assert.equal(undoRoomEdit(project).success, true);
  assert.equal(
    readFileSync(scenePath, 'utf8'),
    originalScene,
    'Undo cannot regenerate unrelated geometry',
  );
  assert.equal(
    JSON.parse(readFileSync(roomsPath, 'utf8')).rooms.room_test.entityPlacements[0].x,
    20,
  );
  assert.equal(canUndoRoom(project), false);
  assert.equal(canRedoRoom(project), true);
  assert.equal(redoRoomEdit(project).success, true);
  assert.equal(readFileSync(roomsPath, 'utf8'), savedRoomsText);
  assert.equal(readFileSync(scenePath, 'utf8'), savedSceneText);
  assert.equal(canUndoRoom(project), true);
  assert.equal(canRedoRoom(project), false);

  assert.equal(JSON.parse(readFileSync(roomsPath, 'utf8')).custom, 'preserve');
  assert.equal(
    readFileSync(scenePath, 'utf8').replace('Vector2(92.25, 73.5)', 'Vector2(20, 30)'),
    originalScene,
  );
  assert.throws(
    () => saveAuthoredPlacement(project, identity, snapshot.revision, { x: 1, y: 1 }),
    /changed since inspection/,
  );
  const second = saveAuthoredPlacement(
    project,
    identity,
    inspectPlacementForSave(project, identity).revision,
    { x: 200.5, y: 100.25 },
  );
  recordLivePlacementEdit(project, second.saved, second.previousRoom);
  assert.equal(undoRoomEdit(project).success, true);
  assert.equal(undoRoomEdit(project).success, true);
  assert.equal(readFileSync(scenePath, 'utf8'), originalScene);
  assert.equal(redoRoomEdit(project).success, true);
  assert.equal(redoRoomEdit(project).success, true);
  assert.equal(
    JSON.parse(readFileSync(roomsPath, 'utf8')).rooms.room_test.entityPlacements[0].x,
    200.5,
  );
  assert.equal(undoRoomEdit(project).success, true);
  assert.equal(readFileSync(scenePath, 'utf8'), savedSceneText);
  const unchangedRuntime = await sendPlaytestCommand(project, 'get_state');
  assert.equal(
    unchangedRuntime.result.objects.find((x) => x.nodePath === 'Enemy').x,
    92.25,
    'Source save must not alter runtime state',
  );
  stopPlaytest(project);
  assert.equal((await startPlaytest(project, { preference: godot, headless: true })).success, true);
  let savedRuntime;
  for (let i = 0; i < 40; i++) {
    savedRuntime = await sendPlaytestCommand(project, 'get_state');
    if (savedRuntime.ok) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(savedRuntime.ok, true, savedRuntime.error);
  const savedEnemy = savedRuntime.result.objects.find((x) => x.nodePath === 'Enemy');
  assert.equal(savedEnemy.x, 92.25);
  assert.equal(savedEnemy.y, 73.5);
  assert.deepEqual(savedEnemy.authored, identity);

  console.log(
    'PASS: desktop bridge + real Godot; request correlation, placement identity, source conflict/engine guards, explicit save/restart and temporary edit isolation',
  );
} finally {
  stopPlaytest(project);
}
