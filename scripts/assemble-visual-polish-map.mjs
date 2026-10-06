#!/usr/bin/env node
/**
 * QA fixture — not production campaign content.
 * Assembles a 12-room, 3-biome Foundry slice via the same GodotProjectAssembler path
 * `metroforge create` uses, without running the full image-generation pipeline.
 * Output: GeneratedGames/visual-polish-pass3-fixture/
 */
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'GeneratedGames', 'visual-polish-pass3-fixture');

async function load(pkg, file = 'index.js') {
  const url = pathToFileURL(join(root, 'packages', pkg, 'dist', file)).href;
  return import(url);
}

const { generateWorldTopology, generateGameContent } = await load('procedural');
const { GodotProjectAssembler } = await load('godot', 'assembler.js');

const seed = 20260911;
const profile = 'VISUAL_VERTICAL_SLICE';
const dna = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  profile,
  identity: {
    title: 'Foundry Courier Slice',
    genre: 'Metroidvania',
    tone: 'metro-industrial',
    visualStyle: 'industrial sci-fi pixel art',
    tagline: 'A courier runs foundry shafts',
  },
  technical: {
    resolution: { width: 1920, height: 1080 },
    tileSize: 32,
    targetPlaytimeHours: 1,
    difficulty: 'normal',
  },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: true },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 3, roomCount: 12 },
  narrative: {
    premise: 'A courier runs industrial Foundry transit shafts, flooded utility tunnels, and an overgrown reactor core.',
    protagonist: 'Courier',
    centralConflict: 'The overgrown core must be shut down.',
  },
  seed,
};

const { worldGraph, progressionGraph, roomIds } = generateWorldTopology({
  seed,
  roomCount: 12,
  biomeCount: 3,
  abilities: ['dash'],
  bossCount: 1,
  profile,
});
const bossRoomId = roomIds[roomIds.length - 1];
const gameContent = generateGameContent(dna, profile, seed, bossRoomId, roomIds);
if (gameContent.enemies.length >= 3) {
  gameContent.enemies[0].movement = 'patrol';
  gameContent.enemies[0].combat = { type: 'melee', cooldown: 1.5, range: 80 };
  gameContent.enemies[1].movement = 'patrol';
  gameContent.enemies[1].combat = { type: 'projectile', cooldown: 1.6, range: 220 };
  gameContent.enemies[2].movement = 'fly';
  gameContent.enemies[2].combat = { type: 'projectile', cooldown: 1.8, range: 200 };
}
gameContent.enemies = gameContent.enemies.slice(0, 3);

mkdirSync(outDir, { recursive: true });
const assembler = new GodotProjectAssembler();
const result = assembler.assemble({
  outputDir: outDir,
  gameDna: dna,
  worldGraph,
  progressionGraph,
  roomIds,
  gameContent,
  foundryThemed: true,
});
if (!result.success) {
  console.error(result.errors.join('\n'));
  process.exit(1);
}

const roomsDir = join(outDir, 'scenes', 'rooms');
if (existsSync(roomsDir)) {
  for (const name of readdirSync(roomsDir)) {
    if (!name.endsWith('.tscn')) continue;
    const path = join(roomsDir, name);
    let next = readFileSync(path, 'utf8').replace(/enemy_(\d{3})/g, (_m, digits) => {
      const idx = Number(digits) % 3;
      return `enemy_${String(idx).padStart(3, '0')}`;
    });
    writeFileSync(path, next);
  }
}

const biome1Room = join(roomsDir, 'room_001.tscn');
if (existsSync(biome1Room)) {
  let scene = readFileSync(biome1Room, 'utf8');
  if (!scene.includes('WaterZone.tscn')) {
    scene = scene.replace(
      /load_steps=(\d+)/,
      (_m, n) => `load_steps=${Number(n) + 1}`,
    );
    scene = scene.replace(
      '[sub_resource',
      '[ext_resource type="PackedScene" path="res://scenes/world/WaterZone.tscn" id="11_water"]\n\n[sub_resource',
    );
    scene += `\n[node name="WaterZone" parent="." instance=ExtResource("11_water")]\nposition = Vector2(480, 780)\n`;
    writeFileSync(biome1Room, scene);
  }
}

writeFileSync(
  join(outDir, 'PASS3_QA_FIXTURE.txt'),
  [
    'QA fixture — not production campaign content.',
    'Assembled with GodotProjectAssembler + VISUAL_VERTICAL_SLICE topology.',
    'Art: authored Foundry polish overlay (64px courier, 160px boss_final).',
    'Launch: Godot 4.7 — open this folder, play scenes/world/World.tscn',
    `Rooms: ${roomIds.join(', ')}`,
    '',
  ].join('\n'),
);

const roomsJson = JSON.parse(readFileSync(join(outDir, 'data', 'rooms', 'rooms.json'), 'utf8'));
const biomes = new Set(Object.values(roomsJson.rooms).map((r) => r.biomeId));
console.log(`assembled ${outDir}`);
console.log(`rooms=${roomIds.length} biomes=${[...biomes].join(',')}`);
console.log(`boss=${gameContent.bosses.map((b) => b.id).join(',')} npcs=${gameContent.npcs.map((n) => n.id).join(',')}`);
