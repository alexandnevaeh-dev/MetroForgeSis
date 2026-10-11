import { describe, it, expect, vi } from 'vitest';
const writeFailure = vi.hoisted(() => ({ target: '' }));
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: (from: any, to: any) => {
      if (String(to) === writeFailure.target) {
        writeFailure.target = '';
        throw new Error('Injected second rename failure');
      }
      return actual.renameSync(from, to);
    },
  };
});
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GameplayPack } from './types.js';
import { roomSolidObjects, withRoomSolids } from './room-solid-edit.js';
import { withRoomFurnishingEdits, readUnityFurnishingRequests } from './furnishing-edit.js';
import {
  readUnityRoomEdit,
  saveUnityRoomEdit,
  restoreUnityRoomEdit,
} from './unity-room-edit-store.js';

const root = join('E:/MetroForgeData/Temp', 'unity-furnishing-authoring-tests-' + randomUUID());
const base = (): GameplayPack =>
  ({
    version: '1',
    title: 'Original archive fixture',
    seed: 7,
    tileSize: 32,
    resolution: { width: 1280, height: 720 },
    startRoomId: 'room_046',
    victoryRoomId: 'room_047',
    movement: {
      walkSpeed: 180,
      runSpeed: 280,
      jumpHeight: 160,
      gravity: 1200,
      coyoteTime: 0.1,
      jumpBufferTime: 0.1,
      acceleration: 1200,
      deceleration: 1200,
      airAcceleration: 800,
      maxFallSpeed: 900,
      dashSpeed: 500,
      dashDuration: 0.2,
      dashCooldown: 0.4,
    },
    combat: {
      attackDamage: 10,
      invulnerableSeconds: 0.6,
      hitboxSeconds: 0.1,
      comboWindowMul: 1,
      cooldownMul: 1,
    },
    sprites: [],
    abilities: [],
    rooms: [
      {
        id: 'room_046',
        index: 46,
        width: 1536,
        height: 1536,
        biomeId: 'archive',
        archetype: 'secret',
        tileSize: 32,
        floorTop: 1472,
        spawnX: 112,
        spawnY: 1472,
        enemy: {
          id: 'archive_sentinel',
          x: 1200,
          y: 1472,
          health: 40,
          damage: 8,
          movement: 'patrol',
          combat: 'melee',
        },
        npcs: [
          {
            id: 'scribe',
            definitionId: 'scribe',
            spriteId: 'scribe_sprite',
            name: 'Scribe',
            role: 'lore',
            x: 1400,
            y: 1472,
            dialogueIds: ['archive_lore'],
            questIds: ['archive_quest'],
          },
        ],
        abilityPickup: { id: 'archive_reward', x: 1200, y: 1472, abilityId: 'double_jump' },
        solids: [
          { name: 'Floor', x: 0, y: 1472, width: 1536, height: 64 },
          { name: 'Platform_8', x: 64, y: 128, width: 608, height: 32, oneWay: true },
          { name: 'Platform_9', x: 864, y: 128, width: 608, height: 32, oneWay: true },
        ],
        doors: [],
        gates: [],
        victory: false,
        backgrounds: {},
        furnishings: [
          {
            id: 'RecordsReadingDesk',
            role: 'records-desk',
            asset: 'assets/architecture/test-desk.png',
            x: 480,
            floorY: 128,
            width: 80,
            height: 40,
            mounting: 'floor',
            renderLayer: 'rear',
            layer: 'rear',
            collision: 'none',
            anchor: 'Platform_8',
            frameRegion: { x: 0, y: 0, width: 80, height: 40, pivotX: 0.5, pivotY: 0 },
          },
        ],
        furnishingOmissions: [],
      },
      {
        id: 'room_047',
        index: 47,
        width: 1024,
        height: 768,
        biomeId: 'vault',
        archetype: 'combat',
        tileSize: 32,
        floorTop: 704,
        spawnX: 112,
        spawnY: 704,
        solids: [{ name: 'VaultFloor', x: 0, y: 704, width: 1024, height: 64 }],
        doors: [],
        gates: [],
        victory: true,
        backgrounds: {},
      },
    ],
  }) as GameplayPack;
function fixture(name: string) {
  const pack = base(),
    room = pack.rooms.find((r) => r.id === 'room_046')!;
  room.furnishingRequests = structuredClone(room.furnishings!);
  const project = join(root, name);
  mkdirSync(join(project, 'Assets/StreamingAssets'), { recursive: true });
  const text = JSON.stringify(pack, null, 2);
  writeFileSync(join(project, 'gameplay.json'), text);
  writeFileSync(join(project, 'Assets/StreamingAssets/gameplay.json'), text);
  return {
    pack,
    room,
    project,
    files: [join(project, 'gameplay.json'), join(project, 'Assets/StreamingAssets/gameplay.json')],
  };
}
describe('authored native furnishings and metadata preservation', () => {
  it('preserves original one-way flags and metadata when a solid moves', () => {
    const pack = base(),
      room = pack.rooms.find((r) => r.id === 'room_046')!,
      before = structuredClone(room.solids);
    const objects = roomSolidObjects(pack, room.id),
      index = room.solids.findIndex((s) => s.oneWay === true);
    expect(index).toBeGreaterThanOrEqual(0);
    objects[index]!.x += 8;
    const saved = withRoomSolids(pack, room.id, objects);
    expect(saved.rooms.find((r) => r.id === room.id)!.solids[index]).toEqual({
      ...before[index],
      editorId: objects[index]!.id,
      x: before[index]!.x + 8,
    });
    expect(room.solids).toEqual(before);
  });
  it('keeps solid metadata stable across deletion and a second save without reloading', () => {
    const pack = base(),
      room = pack.rooms.find((r) => r.id === 'room_046')!;
    const objects = roomSolidObjects(pack, room.id).slice(1),
      once = withRoomSolids(pack, room.id, objects);
    const twice = withRoomSolids(once, room.id, objects);
    expect(twice.rooms.find((r) => r.id === room.id)!.solids).toEqual(
      once.rooms.find((r) => r.id === room.id)!.solids,
    );
    expect(roomSolidObjects(twice, room.id).map((o) => o.id)).toEqual(objects.map((o) => o.id));
  });
  it('refuses corrupt duplicate saved identities rather than guessing metadata', () => {
    const pack = base(),
      room = pack.rooms.find((r) => r.id === 'room_046')!;
    room.solids[0]!.editorId = 'duplicated';
    room.solids[1]!.editorId = 'duplicated';
    expect(() => roomSolidObjects(pack, room.id)).toThrow(/identity/);
  });
  it('retains a request over the authored archive floor gap and omits its decoration', () => {
    const f = fixture('gap'),
      before = structuredClone(f.pack),
      request = f.room.furnishingRequests!.find((p) => p.id === 'RecordsReadingDesk')!;
    const saved = withRoomFurnishingEdits(f.pack, f.room.id, [
      { id: request.id, x: 768, floorY: 128, height: request.height },
    ]);
    const room = saved.rooms.find((r) => r.id === f.room.id)!;
    expect(room.furnishingRequests!.find((p) => p.id === request.id)?.x).toBe(768);
    expect(room.furnishings!.some((p) => p.id === request.id)).toBe(false);
    expect(room.furnishingOmissions!.find((p) => p.id === request.id)?.reason).toBe(
      'unsupported-full-footprint',
    );
    expect(room.solids).toEqual(before.rooms.find((r) => r.id === room.id)!.solids);
    expect(f.pack).toEqual(before);
  });
  it('allows an explicit return to a supported anchor without changing the image or aspect ratio', () => {
    const f = fixture('supported'),
      original = f.room.furnishingRequests!.find((p) => p.id === 'RecordsReadingDesk')!;
    const saved = withRoomFurnishingEdits(f.pack, f.room.id, [
      { id: original.id, x: 480, floorY: 128, height: 32 },
    ]);
    const request = saved.rooms
      .find((r) => r.id === f.room.id)!
      .furnishingRequests!.find((p) => p.id === original.id)!;
    expect(request.asset).toBe(original.asset);
    expect(request.frameRegion).toEqual(original.frameRegion);
    expect(request.width / request.height).toBeCloseTo(original.width / original.height);
    expect(
      saved.rooms.find((r) => r.id === f.room.id)!.furnishings!.some((p) => p.id === original.id),
    ).toBe(true);
  });
  it('revalidates the saved requests after intentional support geometry changes', () => {
    const f = fixture('geometry'),
      objects = roomSolidObjects(f.pack, f.room.id);
    const index = f.room.solids.findIndex((s) => s.name === 'Platform_8');
    expect(index).toBeGreaterThanOrEqual(0);
    objects[index]!.x = 1000;
    const saved = withRoomFurnishingEdits(withRoomSolids(f.pack, f.room.id, objects), f.room.id);
    expect(
      saved.rooms
        .find((r) => r.id === f.room.id)!
        .furnishingOmissions!.find((p) => p.id === 'RecordsReadingDesk')?.reason,
    ).toBe('unsupported-full-footprint');
  });
  it('does not accept asset/collision patches or unknown/duplicate furnishing identities', () => {
    const f = fixture('invalid'),
      edit = { id: 'RecordsReadingDesk', x: 480, floorY: 128, height: 40 };
    expect(() =>
      withRoomFurnishingEdits(f.pack, f.room.id, [{ ...edit, asset: '../private.png' } as any]),
    ).toThrow();
    expect(() =>
      withRoomFurnishingEdits(f.pack, f.room.id, [{ ...edit, collision: 'solid' } as any]),
    ).toThrow();
    expect(() =>
      withRoomFurnishingEdits(f.pack, f.room.id, [{ ...edit, id: 'invented' }]),
    ).toThrow();
    expect(() => withRoomFurnishingEdits(f.pack, f.room.id, [edit, edit])).toThrow();
  });
  it('rejects nonfinite or out-of-contract coordinates and height without mutating input', () => {
    const f = fixture('bounds'),
      before = JSON.stringify(f.pack),
      edit = { id: 'RecordsReadingDesk', x: 480, floorY: 128, height: 40 };
    for (const change of [
      { x: NaN },
      { floorY: Infinity },
      { height: 0 },
      { x: -1 },
      { height: 10000 },
    ])
      expect(() => withRoomFurnishingEdits(f.pack, f.room.id, [{ ...edit, ...change }])).toThrow();
    expect(JSON.stringify(f.pack)).toBe(before);
  });
  it('exposes safe authored scalar data rather than source assets', () => {
    const f = fixture('safe');
    const values = readUnityFurnishingRequests(f.room);
    expect(values.some((p) => p.id === 'RecordsReadingDesk')).toBe(true);
    expect(JSON.stringify(values)).not.toContain('assets/');
  });
  it('atomically persists both gameplay copies, original intent and a recovery backup', () => {
    const f = fixture('save'),
      loaded = readUnityRoomEdit(f.project, f.room.id),
      before = f.files.map((p) => readFileSync(p, 'utf8'));
    const result = saveUnityRoomEdit(
      f.project,
      f.room.id,
      loaded.objects,
      loaded.fingerprints,
      undefined,
      undefined,
      [{ id: 'RecordsReadingDesk', x: 768, floorY: 128, height: 40 }],
    );
    const text = f.files.map((p) => readFileSync(p, 'utf8'));
    expect(text[0]).toBe(text[1]);
    const room = JSON.parse(text[0]!).rooms.find((r: any) => r.id === f.room.id);
    expect(room.furnishingRequests.find((p: any) => p.id === 'RecordsReadingDesk').x).toBe(768);
    expect(room.solids.map(({ editorId, ...solid }: any) => solid)).toEqual(f.room.solids);
    expect(readFileSync(join(result.backup, '0.json'), 'utf8')).toBe(before[0]);
    expect(readFileSync(join(result.backup, '1.json'), 'utf8')).toBe(before[1]);
  });
  it('rolls the first copy back when the second rename fails and preserves recovery data', () => {
    const f = fixture('rollback'),
      loaded = readUnityRoomEdit(f.project, f.room.id),
      before = f.files.map((p) => readFileSync(p, 'utf8'));
    writeFailure.target = f.files[1]!;
    expect(() =>
      saveUnityRoomEdit(
        f.project,
        f.room.id,
        loaded.objects,
        loaded.fingerprints,
        undefined,
        undefined,
        [{ id: 'RecordsReadingDesk', x: 768, floorY: 128, height: 40 }],
      ),
    ).toThrow(/Injected/);
    expect(f.files.map((p) => readFileSync(p, 'utf8'))).toEqual(before);
    expect(readdirSync(join(f.project, '.metroforge/room-edit-backups')).length).toBe(1);
    expect(readdirSync(f.project).some((name) => name.endsWith('.tmp'))).toBe(false);
  });
  it('undoes and redoes a saved furnishing edit using revision-bound recovery tokens', () => {
    const f = fixture('history'),
      loaded = readUnityRoomEdit(f.project, f.room.id),
      original = f.files.map((p) => readFileSync(p, 'utf8'));
    const saved = saveUnityRoomEdit(
      f.project,
      f.room.id,
      loaded.objects,
      loaded.fingerprints,
      undefined,
      undefined,
      [{ id: 'RecordsReadingDesk', x: 768, floorY: 128, height: 40 }],
    );
    const edited = f.files.map((p) => readFileSync(p, 'utf8'));
    const undone = restoreUnityRoomEdit(f.project, f.room.id, saved.backupId, saved.fingerprints);
    expect(f.files.map((p) => readFileSync(p, 'utf8'))).toEqual(original);
    restoreUnityRoomEdit(f.project, f.room.id, undone.backupId, undone.fingerprints);
    expect(f.files.map((p) => readFileSync(p, 'utf8'))).toEqual(edited);
  });
  it('rejects foreign-room, stale and traversing undo requests without changing current files', () => {
    const f = fixture('history-conflict'),
      loaded = readUnityRoomEdit(f.project, f.room.id);
    const saved = saveUnityRoomEdit(f.project, f.room.id, loaded.objects, loaded.fingerprints);
    const before = f.files.map((p) => readFileSync(p, 'utf8'));
    expect(() =>
      restoreUnityRoomEdit(f.project, 'room_047', saved.backupId, saved.fingerprints),
    ).toThrow(/revision/);
    expect(() =>
      restoreUnityRoomEdit(f.project, f.room.id, '../../private', saved.fingerprints),
    ).toThrow(/token/);
    expect(() =>
      restoreUnityRoomEdit(f.project, f.room.id, saved.backupId, loaded.fingerprints),
    ).toThrow(/changed/);
    expect(f.files.map((p) => readFileSync(p, 'utf8'))).toEqual(before);
  });
  it('refuses damaged recovery contents rather than partially restoring them', () => {
    const f = fixture('damaged-history'),
      loaded = readUnityRoomEdit(f.project, f.room.id);
    const saved = saveUnityRoomEdit(f.project, f.room.id, loaded.objects, loaded.fingerprints),
      before = f.files.map((p) => readFileSync(p, 'utf8'));
    writeFileSync(join(saved.backup, '0.json'), '{}');
    expect(() =>
      restoreUnityRoomEdit(f.project, f.room.id, saved.backupId, saved.fingerprints),
    ).toThrow(/invalid/);
    expect(f.files.map((p) => readFileSync(p, 'utf8'))).toEqual(before);
  });
  it('rejects stale revisions and divergent gameplay copies before creating a backup', () => {
    const f = fixture('stale'),
      loaded = readUnityRoomEdit(f.project, f.room.id);
    writeFileSync(f.files[0]!, readFileSync(f.files[0]!, 'utf8') + '\n');
    const before = f.files.map((p) => readFileSync(p, 'utf8'));
    expect(() =>
      saveUnityRoomEdit(f.project, f.room.id, loaded.objects, loaded.fingerprints),
    ).toThrow(/changed/);
    expect(f.files.map((p) => readFileSync(p, 'utf8'))).toEqual(before);
    expect(existsSync(join(f.project, '.metroforge/room-edit-backups'))).toBe(false);
    expect(() => readUnityRoomEdit(f.project, f.room.id)).not.toThrow();
    const changed = JSON.parse(before[0]!);
    changed.title = 'external change';
    writeFileSync(f.files[0]!, JSON.stringify(changed));
    expect(() => readUnityRoomEdit(f.project, f.room.id)).toThrow(/differ/);
  });
  it('preserves every other room, player settings, doors, actors and progression during furnishing edits', () => {
    const f = fixture('scope'),
      saved = withRoomFurnishingEdits(f.pack, f.room.id, [
        { id: 'RecordsReadingDesk', x: 480, floorY: 128, height: 32 },
      ]);
    const original = structuredClone(f.pack),
      normalized = structuredClone(saved);
    for (const p of [original, normalized]) {
      const room = p.rooms.find((r) => r.id === f.room.id)!;
      delete room.furnishingRequests;
      delete room.furnishingSourceOmissions;
      delete room.furnishings;
      delete room.furnishingOmissions;
    }
    expect(normalized).toEqual(original);
  });
});
