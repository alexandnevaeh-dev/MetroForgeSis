import { describe, it, expect } from 'vitest';
import { decodePngRgba } from '../src/png.js';
import {
  loadAuthoredCourierPng,
  shouldUseFoundryCourierKit,
  AUTHORED_COURIER_PROVIDER,
} from '../src/authored-kit.js';
import type { GameDNA } from '@metroforge/schemas';

const testDna: GameDNA = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: {
    title: 'Test Game',
    genre: 'Metroidvania',
    tone: 'dark',
    visualStyle: 'dark pixel art',
  },
  technical: {
    resolution: { width: 1280, height: 720 },
    tileSize: 16,
    targetPlaytimeHours: 2,
    difficulty: 'normal',
  },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: 8 },
  narrative: {
    premise: 'A forgotten machine civilization',
    protagonist: 'forged knight',
    centralConflict: 'restore the core',
  },
  seed: 42,
  profile: 'TINY_TEST',
};

function uniqueOpaque(png: Buffer): number {
  const { rgba } = decodePngRgba(png);
  const keys = new Set<string>();
  for (let i = 0; i < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) < 128) continue;
    keys.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
  }
  return keys.size;
}

function feetOpaque(png: Buffer): boolean {
  const { rgba, width, height } = decodePngRgba(png);
  for (let x = 0; x < width; x++) {
    if ((rgba[((height - 1) * width + x) * 4 + 3] ?? 0) > 128) return true;
  }
  return false;
}

describe('authored foundry courier kit', () => {
  it('does not replace TINY_TEST procedural actors', () => {
    expect(shouldUseFoundryCourierKit({ profile: 'TINY_TEST', gameDna: testDna })).toBe(false);
  });

  it('selects the kit for VISUAL_VERTICAL_SLICE and foundry copy', () => {
    expect(shouldUseFoundryCourierKit({ profile: 'VISUAL_VERTICAL_SLICE', gameDna: testDna })).toBe(true);
    expect(
      shouldUseFoundryCourierKit({
        profile: 'SMALL',
        gameDna: {
          ...testDna,
          identity: { ...testDna.identity, title: 'Ashen Foundry' },
          narrative: { ...testDna.narrative, protagonist: 'The Wanderer' },
        },
      }),
    ).toBe(true);
  });

  it('ships 64×64 stills with feet anchors, palette depth, and distinct roles', () => {
    const player = loadAuthoredCourierPng('player.png');
    const npc = loadAuthoredCourierPng('npc_000.png');
    expect(player).toBeTruthy();
    expect(npc).toBeTruthy();
    const p = decodePngRgba(player!);
    const n = decodePngRgba(npc!);
    expect(p.width).toBe(64);
    expect(p.height).toBe(64);
    expect(n.width).toBe(64);
    expect(n.height).toBe(64);
    expect(uniqueOpaque(player!)).toBeGreaterThan(8);
    expect(uniqueOpaque(npc!)).toBeGreaterThan(8);
    expect(feetOpaque(player!)).toBe(true);
    expect(feetOpaque(npc!)).toBe(true);
    expect(player!.equals(npc!)).toBe(false);
    expect(AUTHORED_COURIER_PROVIDER).toBe('authored-original');
  });

  it('ships 256×64 walk sheets with four unique posed frames', () => {
    const walk = loadAuthoredCourierPng('player_walk.png');
    const npcWalk = loadAuthoredCourierPng('npc_000_walk.png');
    expect(walk).toBeTruthy();
    const decoded = decodePngRgba(walk!);
    expect(decoded.width).toBe(256);
    expect(decoded.height).toBe(64);
    const hashes = new Set<string>();
    for (let f = 0; f < 4; f++) {
      let h = 0;
      for (let y = 0; y < 64; y++) {
        for (let x = 0; x < 64; x++) {
          const i = (y * 256 + f * 64 + x) * 4;
          h = (h * 33 + decoded.rgba[i]! + decoded.rgba[i + 3]!) | 0;
        }
      }
      hashes.add(String(h));
    }
    expect(hashes.size).toBe(4);
    const npcDecoded = decodePngRgba(npcWalk!);
    expect(npcDecoded.width).toBe(256);
    expect(npcDecoded.height).toBe(64);
  });
});
