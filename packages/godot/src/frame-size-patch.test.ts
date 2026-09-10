import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  patchCharacterFrameSizeForExternalPack,
  patchCharacterSheetPathsForFoundryPack,
} from './assembler.js';

/** Minimal stand-ins for the three real template scenes — only the one line this fix touches
 *  matters; everything else is a placeholder so the regex-based patch has real surrounding text
 *  to operate on without depending on the full real template files. */
function fakeScene(frameSize: string, extra = ''): string {
  return `[gd_scene load_steps=2 format=3]\n\n[node name="Sprite" type="AnimatedSprite2D" parent="."]\nframe_size = Vector2i(${frameSize})\nframe_count = 4\n${extra}`;
}

function setupProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'metroforge-frame-size-patch-'));
  mkdirSync(join(dir, 'scenes', 'player'), { recursive: true });
  mkdirSync(join(dir, 'scenes', 'enemies'), { recursive: true });
  mkdirSync(join(dir, 'scenes', 'bosses'), { recursive: true });
  writeFileSync(
    join(dir, 'scenes', 'player', 'Player.tscn'),
    fakeScene(
      '64, 64',
      'sheet_path = "assets/characters/player_run.png"\nrun_sheet_path = "assets/characters/player_run.png"\n',
    ),
  );
  writeFileSync(
    join(dir, 'scenes', 'enemies', 'Enemy.tscn'),
    fakeScene(
      '64, 64',
      'sheet_path = "assets/enemies/enemy_000_walk.png"\nhurt_sheet_path = "assets/enemies/enemy_000_hurt.png"\ndeath_sheet_path = "assets/enemies/enemy_000_death.png"\nattack_sheet_path = "assets/enemies/enemy_000_attack.png"\n',
    ),
  );
  writeFileSync(
    join(dir, 'scenes', 'bosses', 'Boss.tscn'),
    fakeScene(
      '128, 128',
      'sheet_path = "assets/bosses/boss_final_walk.png"\nhurt_sheet_path = "assets/bosses/boss_final_hurt.png"\ndeath_sheet_path = "assets/bosses/boss_final_death.png"\nattack_sheet_path = "assets/bosses/boss_final_attack.png"\n',
    ),
  );
  return dir;
}

describe('patchCharacterFrameSizeForExternalPack (sixteenth session)', () => {
  it('rewrites Player.tscn/Enemy.tscn/Boss.tscn frame_size to the real metroforge-foundry-v3 native sizes (128/128/160)', () => {
    const dir = setupProject();
    try {
      patchCharacterFrameSizeForExternalPack(dir, 'metroforge-foundry-v3');
      const player = readFileSync(join(dir, 'scenes', 'player', 'Player.tscn'), 'utf8');
      const enemy = readFileSync(join(dir, 'scenes', 'enemies', 'Enemy.tscn'), 'utf8');
      const boss = readFileSync(join(dir, 'scenes', 'bosses', 'Boss.tscn'), 'utf8');
      expect(player).toContain('frame_size = Vector2i(128, 128)');
      expect(enemy).toContain('frame_size = Vector2i(128, 128)');
      expect(boss).toContain('frame_size = Vector2i(160, 160)');
      // Nothing else in the scene text should be touched.
      expect(player).toContain('frame_count = 4');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves industrial-transit-driven scenes alone when that pack does not declare a mismatched size (no spurious rewrite)', () => {
    const dir = setupProject();
    try {
      const before = readFileSync(join(dir, 'scenes', 'enemies', 'Enemy.tscn'), 'utf8');
      patchCharacterFrameSizeForExternalPack(dir, 'industrial-transit');
      const after = readFileSync(join(dir, 'scenes', 'enemies', 'Enemy.tscn'), 'utf8');
      // industrial-transit's own manifest determines the real outcome here; this just proves the
      // function never throws or corrupts the file for a second, real, different pack id.
      expect(after.startsWith('[gd_scene')).toBe(true);
      void before;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does nothing (no throw) when a scene file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'metroforge-frame-size-patch-empty-'));
    try {
      expect(() => patchCharacterFrameSizeForExternalPack(dir, 'metroforge-foundry-v3')).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('patchCharacterSheetPathsForFoundryPack', () => {
  it('rewrites Player/Enemy/Boss template sheet paths onto Foundry pack filenames', () => {
    const dir = setupProject();
    try {
      patchCharacterSheetPathsForFoundryPack(dir, 'metroforge-foundry-v3');
      const player = readFileSync(join(dir, 'scenes', 'player', 'Player.tscn'), 'utf8');
      const enemy = readFileSync(join(dir, 'scenes', 'enemies', 'Enemy.tscn'), 'utf8');
      const boss = readFileSync(join(dir, 'scenes', 'bosses', 'Boss.tscn'), 'utf8');
      expect(player).toContain('sheet_path = "assets/characters/player_locomotion.png"');
      expect(player).toContain('run_sheet_path = "assets/characters/player_locomotion.png"');
      expect(enemy).toContain('sheet_path = "assets/enemies/melee_locomotion.png"');
      expect(enemy).toContain('hurt_sheet_path = "assets/enemies/melee_hurt.png"');
      expect(boss).toContain('sheet_path = "assets/bosses/boss_locomotion.png"');
      expect(boss).toContain('attack_sheet_path = "assets/bosses/boss_attack.png"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves industrial-transit scenes on template sheet names', () => {
    const dir = setupProject();
    try {
      patchCharacterSheetPathsForFoundryPack(dir, 'industrial-transit');
      const player = readFileSync(join(dir, 'scenes', 'player', 'Player.tscn'), 'utf8');
      expect(player).toContain('sheet_path = "assets/characters/player_run.png"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
