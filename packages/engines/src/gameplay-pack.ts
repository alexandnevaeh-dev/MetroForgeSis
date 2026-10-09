import { parseTerrainPresentation } from './terrain-presentation.js';
import { readBackgroundFraming } from './background-framing.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AssemblyInput } from '@metroforge/godot';
import {
  buildPublishedRoomRecord,
  buildRoomAssemblyOptions,
  collectRoomCollisionRects,
  floorTopPx,
  prepareRoomAssemblyContext,
  SIDE_DOOR_ROWS,
  spawnSideForEntry,
} from '@metroforge/godot';
import { buildMovementJson } from '@metroforge/shared';
import { readPngSize } from './png-size.js';
import type {
  GameplayDoor,
  GameplayGate,
  GameplayPack,
  GameplayRoom,
  GameplaySpriteClip,
} from './types.js';

const COMBAT = {
  attackDamage: 10,
  invulnerableSeconds: 20 / 60,
  hitboxSeconds: 0.15,
  comboWindowMul: 1.4,
  cooldownMul: 0.75,
  maxHealth: 100,
} as const;

interface ClipSpec {
  pixelsPerUnit?: number;
  smoothFiltering?: boolean;
  pivotX?: number;
  pivotY?: number;
  frameWidth?: number;
  frameHeight?: number;
  frameCount: number;
  fps: number;
  loop: boolean;
  impactFrame?: number;
}

function loadClipSpecs(jsonPath: string, supplied?: Buffer): Record<string, ClipSpec> {
  if (!supplied && !existsSync(jsonPath)) return {};
  try {
    const parsed = JSON.parse(supplied ? supplied.toString('utf-8') : readFileSync(jsonPath, 'utf-8')) as Record<string, Partial<ClipSpec>>;
    const out: Record<string, ClipSpec> = {};
    for (const [clip, spec] of Object.entries(parsed)) {
      out[clip] = {
        pixelsPerUnit: spec.pixelsPerUnit,
        smoothFiltering: spec.smoothFiltering,
        pivotX: spec.pivotX,
        pivotY: spec.pivotY,
        frameWidth: spec.frameWidth,
        frameHeight: spec.frameHeight,
        frameCount: Number(spec.frameCount) || 1,
        fps: Number(spec.fps) || 8,
        loop: spec.loop !== false,
        impactFrame: spec.impactFrame,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function textureBuffer(input: AssemblyInput, rel: string): Buffer | null {
  const fromMap = input.textureFiles?.get(rel);
  if (fromMap) return fromMap;
  const disk = join(input.outputDir, rel);
  if (existsSync(disk)) return readFileSync(disk);
  return null;
}

function clipFromSheet(
  ownerId: string,
  clip: string,
  rel: string,
  input: AssemblyInput,
  specs: Record<string, ClipSpec>,
  pivotY: number,
): GameplaySpriteClip | null {
  const buf = textureBuffer(input, rel);
  if (!buf) return null;
  const size = readPngSize(buf);
  if (!size) return null;
  const spec = specs[clip];
  if (spec?.pixelsPerUnit !== undefined && (!Number.isFinite(spec.pixelsPerUnit) || spec.pixelsPerUnit <= 0))
    throw new Error(`Invalid animation scale for ${rel}`);
  for (const pivot of [spec?.pivotX, spec?.pivotY])
    if (pivot !== undefined && (!Number.isFinite(pivot) || pivot < 0 || pivot > 1))
      throw new Error(`Invalid animation pivot for ${rel}`);
  if (spec?.smoothFiltering !== undefined && typeof spec.smoothFiltering !== 'boolean')
    throw new Error(`Invalid animation filtering for ${rel}`);
  const authoredLayout = spec?.frameWidth !== undefined || spec?.frameHeight !== undefined;
  const frameHeight = spec?.frameHeight ?? size.height;
  const guessedCount = spec?.frameCount ?? Math.max(1, Math.round(size.width / frameHeight));
  const frameWidth = spec?.frameWidth ?? Math.max(1, Math.round(size.width / guessedCount));
  if (authoredLayout && (
    ![frameWidth, frameHeight, guessedCount].every(value => Number.isInteger(value) && value > 0)
    || guessedCount > Math.floor(size.width / frameWidth) * Math.floor(size.height / frameHeight)
  )) {
    throw new Error(`Invalid animation frame layout for ${rel}: ${frameWidth}x${frameHeight}, ${guessedCount} frames in ${size.width}x${size.height}`);
  }
  if (spec?.impactFrame !== undefined && (!Number.isInteger(spec.impactFrame) || spec.impactFrame < 0 || spec.impactFrame >= guessedCount))
    throw new Error(`Invalid animation impact frame for ${rel}`);
  return {
    ownerId,
    clip,
    relativePath: rel,
    frameWidth,
    frameHeight,
    frameCount: guessedCount,
    fps: spec?.fps ?? 8,
    loop: spec?.loop ?? true,
    impactFrame: spec?.impactFrame ?? Math.floor(guessedCount / 2),
    hasImpactFrame: spec?.impactFrame !== undefined,
    pivotX: spec?.pivotX ?? 0.5,
    pivotY: spec?.pivotY ?? pivotY,
    pixelsPerUnit: spec?.pixelsPerUnit,
    smoothFiltering: spec?.smoothFiltering,
  };
}

function collectSprites(input: AssemblyInput, enemyIds: string[]): GameplaySpriteClip[] {
  for (const [path, settings] of input.textureFiles ?? []) {
    if (!/^assets\/tilesets\/biome_\d+\/(floor|wall)\.presentation\.json$/.test(path)) continue;
    const pngPath = path.replace('.presentation.json', '.png');
    const png = textureBuffer(input, pngPath);
    const size = png ? readPngSize(png) : null;
    if (!size) throw new Error(`Terrain image is missing or invalid: ${pngPath}`);
    parseTerrainPresentation(JSON.parse(settings.toString('utf8')), size);
  }
  const sprites: GameplaySpriteClip[] = [];
  const playerSpecs = loadClipSpecs(join(input.outputDir, 'assets/characters/player_animations.json'), input.textureFiles?.get('assets/characters/player_animations.json'));
  const playerClips = [
    'idle',
    'walk',
    'run',
    'jump',
    'jump_start',
    'fall',
    'land',
    'attack',
    'attack_2',
    'attack_3',
    'hurt',
    'death',
    'dash',
    'wall_slide',
    'wall_jump',
    'swim',
  ];
  for (const clip of playerClips) {
    const rel = `assets/characters/player_${clip}.png`;
    const sprite = clipFromSheet('player', clip, rel, input, playerSpecs, 0);
    if (sprite) sprites.push(sprite);
  }
  if (!sprites.some((s) => s.ownerId === 'player' && s.clip === 'idle')) {
    const loco = clipFromSheet(
      'player',
      'idle',
      'assets/characters/player_locomotion.png',
      input,
      playerSpecs,
      0,
    );
    if (loco) sprites.push(loco);
  }

  for (const enemyId of enemyIds) {
    const folder = input.gameContent?.bosses.some((boss) => boss.id === enemyId) ? 'bosses' : 'enemies';
    const settings = `assets/${folder}/${enemyId}_animations.json`;
    const specs = loadClipSpecs(join(input.outputDir, settings), input.textureFiles?.get(settings));
    for (const clip of ['idle', 'walk', 'run', 'telegraph', 'attack', 'attack_projectile', 'attack_burst', 'recovery', 'hurt', 'death']) {
      const sprite = clipFromSheet(enemyId, clip, `assets/${folder}/${enemyId}_${clip}.png`, input, specs, 0);
      if (sprite) sprites.push(sprite);
    }
  }
  for (const [owner, asset] of [['checkpoint', 'save_shrine'], ['victory', 'victory']] as const) {
    const settings = `assets/props/interact/${asset}_animations.json`;
    const sprite = clipFromSheet(owner, 'idle', `assets/props/interact/${asset}.png`, input,
      loadClipSpecs(join(input.outputDir, settings), input.textureFiles?.get(settings)), 0);
    if (sprite) sprites.push(sprite);
  }
  for (const spriteId of new Set((input.gameContent?.npcs ?? []).map(npc => npc.spriteId ?? npc.id))) {
    const settings = `assets/npcs/${spriteId}_animations.json`;
    const specs = loadClipSpecs(join(input.outputDir, settings), input.textureFiles?.get(settings));
    for (const clip of ['idle', 'walk', 'run', 'talk', 'listen']) {
      const sprite = clipFromSheet(spriteId, clip, `assets/npcs/${spriteId}_${clip}.png`, input, specs, 0);
      if (sprite) sprites.push(sprite);
    }
  }
  return sprites;
}

function doorPlacement(
  direction: GameplayDoor['direction'],
  width: number,
  floorY: number,
  slot: number,
): { x: number; y: number; width: number; height: number } {
  switch (direction) {
    case 'up':
      return { x: width / 2 - 24 + slot * 48, y: 8, width: 48, height: 32 };
    case 'down':
      return { x: width / 2 - 24 + slot * 48, y: floorY + 64, width: 48, height: 48 };
    case 'right':
      return { x: width - 32 - slot * 48, y: floorY - 112, width: 32, height: 96 };
    case 'left':
      return { x: slot * 48, y: floorY - 112, width: 32, height: 96 };
  }
}

export function buildGameplayPack(input: AssemblyInput): GameplayPack {
  const movement = buildMovementJson(input.gameDna.movement);
  const textureExists = (rel: string) =>
    (input.textureFiles?.has(rel) ?? false) || existsSync(join(input.outputDir, rel));
  const castleInterior = 'assets/backgrounds/stormglass/reliquary_interior.png';
  const usesCastleInterior = input.gameDna.archetype === 'SIDE_VIEW_METROIDVANIA' && textureExists(castleInterior);
  const castleConditionTints = [[0.72, 0.72, 0.82, 0.76], [0.48, 0.66, 0.76, 0.74],
    [0.62, 0.58, 0.72, 0.73], [0.58, 0.70, 0.84, 0.76]];
  const ctx = prepareRoomAssemblyContext(input.worldGraph, input.gameContent, input.roomIds);
  const enemyCounter = { value: 0 };
  const rooms: GameplayRoom[] = [];
  const enemyIds: string[] = [];
  const startRoomId = input.roomIds[0] ?? 'room_000';
  const finalBoss =
    input.gameContent?.bosses.find((b) => b.id === 'boss_final') ??
    input.gameContent?.bosses[input.gameContent.bosses.length - 1];
  const victoryRoomId =
    finalBoss?.arenaRoomId ?? input.roomIds[input.roomIds.length - 1] ?? startRoomId;

  for (let i = 0; i < input.roomIds.length; i++) {
    const roomId = input.roomIds[i]!;
    const opts = buildRoomAssemblyOptions(
      roomId,
      i,
      ctx,
      input.gameDna,
      input.gameContent,
      enemyCounter,
      textureExists,
      {
        visualKit: input.foundryThemed || input.externalVisualPack === 'metroforge-foundry-v3' ? 'foundry' : undefined,
        authoredParallax: Boolean(input.foundryThemed && !input.externalVisualPack),
      },
    );
    const published = buildPublishedRoomRecord(roomId, i, opts);
    const tileSize = opts.tileSize;
    const floorTop = opts.hasTileset
      ? floorTopPx(opts.height, tileSize)
      : opts.height - 96;
    const floorY = floorTop + (opts.hasTileset ? tileSize : 32);
    const doorSlots: Record<string, number> = {};
    const doors: GameplayDoor[] = opts.connections.map((conn) => {
      const slot = doorSlots[conn.direction] ?? 0;
      doorSlots[conn.direction] = slot + 1;
      const box = doorPlacement(conn.direction, opts.width, floorY, slot);
      return {
        direction: conn.direction,
        targetRoomId: conn.targetRoomId,
        ...box,
        spawnSide: spawnSideForEntry(conn.direction),
        requirements: [...conn.requirements],
        optional: conn.optional ?? false,
      };
    });
    const doorTop = Math.max(0, (Math.floor(floorTop / tileSize) - SIDE_DOOR_ROWS) * tileSize);
    const openingHeight = SIDE_DOOR_ROWS * tileSize;
    const gates: GameplayGate[] = [];
    for (const conn of opts.connections) {
      if (conn.requirements.length === 0) continue;
      const requiredAbility = conn.requirements[0]!;
      if (conn.direction === 'left') {
        gates.push({
          requiredAbility,
          x: 0,
          y: doorTop,
          width: tileSize,
          height: openingHeight,
          targetRoomId: conn.targetRoomId,
        });
      } else if (conn.direction === 'right') {
        gates.push({
          requiredAbility,
          x: opts.width - tileSize,
          y: doorTop,
          width: tileSize,
          height: openingHeight,
          targetRoomId: conn.targetRoomId,
        });
      }
    }

    const bossDef = input.gameContent?.bosses.find((boss) => boss.arenaRoomId === roomId);
    const enemyId = bossDef?.id ?? (
      opts.hasEnemy && !opts.isBossRoom
        ? `enemy_${opts.enemyIndex.toString().padStart(3, '0')}`
        : undefined);
    if (enemyId) enemyIds.push(enemyId);
    const enemyDef = enemyId
      ? input.gameContent?.enemies.find((e) => e.id === enemyId)
      : undefined;

    rooms.push({
      id: roomId,
      index: i,
      width: opts.width,
      height: opts.height,
      biomeId: published.biomeId,
      archetype: published.archetype,
      tileSize,
      floorTop,
      spawnX: 100,
      spawnY: floorTop,
      solids: collectRoomCollisionRects(opts).map(rect => opts.platformerStage && rect.name?.startsWith('Platform_')
        ? { ...rect, oneWay: true } : rect),
      doors,
      gates,
      npcs: opts.npcs.map((npc, index) => {
        const definitionId = npc.definitionId ?? npc.id;
        const definition = input.gameContent?.npcs.find(entry => entry.id === definitionId);
        const placement = opts.entityPlacements?.find(entry => entry.kind === 'npc' && entry.id === npc.id);
        return { id: npc.id, definitionId, spriteId: definition?.spriteId ?? definitionId,
          name: npc.name, role: npc.role, x: placement?.x ?? opts.width * 0.75 - index * 60,
          y: placement?.y ?? floorTop, dialogueIds: [...(definition?.dialogueIds ?? [])],
          questIds: [...npc.questIds], shopId: npc.shopId };
      }),
      enemy: enemyId
        ? {
            id: enemyId,
            x: bossDef ? opts.width * 0.65 : opts.width - 150,
            y: floorTop,
            health: bossDef?.health ?? enemyDef?.health ?? 30,
            damage: bossDef ? 18 : enemyDef?.damage ?? 8,
            ...(bossDef ? { isBoss: true, name: bossDef.name, bossPhases: bossDef.phases.map((phase) => ({ ...phase, attacks: [...phase.attacks] })) } : {}),
            movement: enemyDef?.movement ?? 'patrol',
            combat: enemyDef?.combat?.type ?? 'melee',
          }
        : undefined,
      abilityPickups: opts.abilityPickups.map((id, index) => ({ id, x: Math.min(220 + index * 48, opts.width - 40), y: floorTop - 28 })),
      abilityPickup:
        opts.abilityPickups[0] != null
          ? { id: opts.abilityPickups[0], x: 220, y: floorTop - 28 }
          : undefined,
      checkpoint: opts.hasSavePoint || i === 0 ? { x: 150, y: floorTop } : undefined,
      victory: roomId === victoryRoomId,
      backgrounds: {
        ...(usesCastleInterior ? {
          interior: castleInterior,
          interiorTint: castleConditionTints[Math.min(3, Math.floor(i / 10))],
        } : {}),
        ...readBackgroundFraming(input, opts.biomeIndex),
        far: textureExists(`assets/backgrounds/biome_${opts.biomeIndex}/far.png`)
          ? `assets/backgrounds/biome_${opts.biomeIndex}/far.png`
          : undefined,
        mid: textureExists(`assets/backgrounds/biome_${opts.biomeIndex}/mid.png`)
          ? `assets/backgrounds/biome_${opts.biomeIndex}/mid.png`
          : undefined,
        near: textureExists(`assets/backgrounds/biome_${opts.biomeIndex}/near.png`)
          ? `assets/backgrounds/biome_${opts.biomeIndex}/near.png`
          : undefined,
        foreground: textureExists(`assets/backgrounds/biome_${opts.biomeIndex}/foreground.png`)
          ? `assets/backgrounds/biome_${opts.biomeIndex}/foreground.png`
          : undefined,
      },
    });
  }

  if (!rooms.some((room) => room.enemy) && rooms.length > 0) {
    const host =
      rooms.find((room) => !room.victory && room.id !== startRoomId) ??
      rooms.find((room) => room.id !== startRoomId) ??
      rooms[0]!;
    const enemyId = 'enemy_000';
    host.enemy = {
      id: enemyId,
      x: Math.max(160, host.width - 150),
      y: host.floorTop,
      health: 30,
      damage: 8,
      movement: 'patrol',
      combat: 'melee',
    };
    enemyIds.push(enemyId);
  }

  return {
    version: '1',
    title: input.gameDna.identity.title,
    seed: input.gameDna.seed,
    tileSize: input.gameDna.technical.tileSize,
    resolution: input.gameDna.technical.resolution,
    startRoomId,
    victoryRoomId,
    movement: {
      walkSpeed: movement.walkSpeed,
      runSpeed: movement.runSpeed,
      jumpHeight: movement.jumpHeight,
      gravity: movement.gravity,
      coyoteTime: movement.coyoteTime,
      jumpBufferTime: movement.jumpBufferTime,
      acceleration: movement.acceleration,
      deceleration: movement.deceleration,
      airAcceleration: movement.airAcceleration,
      maxFallSpeed: movement.maxFallSpeed,
      dashSpeed: movement.dashSpeed,
      dashDuration: movement.dashDuration,
      dashCooldown: movement.dashCooldown,
    },
    combat: { ...COMBAT },
    abilities: input.gameDna.abilities
      .filter((a) => a.enabled !== false)
      .map((a) => ({ id: a.id, name: a.name })),
    rooms,
    sprites: collectSprites(input, enemyIds),
    dialogues: (input.gameContent?.dialogues ?? []).map(dialogue => ({ ...dialogue,
      lines: dialogue.lines.map(line => ({ ...line, ...(line.choices ? { choices: line.choices.map(choice => ({ ...choice })) } : {}) })) })),
  };
}
