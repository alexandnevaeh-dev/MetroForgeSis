import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExternalVisualPack, EXTERNAL_VISUAL_PACKS } from './external-visual-pack.js';

// Repo root: packages/godot/src/../../.. -> Forged/
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('external visual packs — registry and manifest loading', () => {
  it('lists both the original test pack and the eleventh-session QA-approved Foundry V3 pack', () => {
    expect(EXTERNAL_VISUAL_PACKS).toContain('industrial-transit');
    expect(EXTERNAL_VISUAL_PACKS).toContain('metroforge-foundry-v3');
    expect(EXTERNAL_VISUAL_PACKS).toContain('conduit-foundry-heat');
    expect(EXTERNAL_VISUAL_PACKS).toContain('conduit-foundry-heat-v2');
  });

  it('still loads industrial-transit unchanged (regression for adding a second pack)', () => {
    const manifest = loadExternalVisualPack(REPO_ROOT, 'industrial-transit');
    expect(manifest.id).toBe('industrial-transit');
    expect(manifest.assets.length).toBeGreaterThan(0);
  });

  it('loads the Foundry V3 pack — twelfth session: all 20 character clips plus terrain/backdrop/props now QA-approved and included', () => {
    const manifest = loadExternalVisualPack(REPO_ROOT, 'metroforge-foundry-v3');
    expect(manifest.id).toBe('metroforge-foundry-v3');
    // 4 actors x 5 clips (idle/run-or-walk/attack/hurt/death) + projectile + exit + 4 sliced props
    // + terrain + backdrop = 28. The eleventh session held hurt/death/terrain/backdrop back at
    // NEEDS_REWORK; the twelfth session's targeted revisions (extra recoil frame, per-actor death
    // progression, 2 new floor variants, an alternate backdrop module, prop slicing) fixed all of
    // them, verified by direct inspection, and they were then added here.
    // 30, not 28: the thirteenth session's real-generation verification found terrain/backdrop/
    // props all present in a generated project but never actually wired into any room (wrong
    // destination convention). Fixed against the real, confirmed "biome_0" id; backdrop split
    // into 3 required layer files (far/mid/near), so it grew from 1 entry to 3.
    expect(manifest.assets).toHaveLength(30);
    const ids = manifest.assets.map((a) => a.id);
    const destinations = manifest.assets.map((a) => a.destination);
    expect(ids).toContain('player_idle');
    expect(ids).toContain('player_hurt');
    expect(ids).toContain('player_death');
    expect(ids).toContain('boss_attack');
    expect(destinations).toContain('assets/characters/player_idle.png');
    expect(destinations).toContain('assets/bosses/boss_idle.png');
    expect(destinations).toContain('assets/tilesets/biome_0/source.png');
    expect(destinations).toContain('assets/backgrounds/biome_0/far.png');
    expect(destinations).toContain('assets/backgrounds/biome_0/mid.png');
    expect(destinations).toContain('assets/backgrounds/biome_0/near.png');
    expect(destinations).toContain('assets/props/biome_0/biome_0_prop_0.png');
  });

  it('loads the Unity conduit-foundry-heat pack from compiled destinations', () => {
    const manifest = loadExternalVisualPack(REPO_ROOT, 'conduit-foundry-heat');
    expect(manifest.id).toBe('conduit-foundry-heat');
    expect(manifest.playerReferenceHeight).toBe(48);
    const destinations = manifest.assets.map((a) => a.destination);
    expect(destinations).toContain('assets/characters/player_idle.png');
    expect(destinations).toContain('assets/enemies/enemy_000_idle.png');
    expect(destinations).toContain('assets/backgrounds/biome_1/far.png');
    expect(destinations).toContain('assets/backgrounds/biome_2/far.png');
    expect(destinations).toContain('assets/bosses/boss_idle.png');
  });

  it('loads the Unity conduit-foundry-heat-v2 pack from compiled destinations', () => {
    const manifest = loadExternalVisualPack(REPO_ROOT, 'conduit-foundry-heat-v2');
    expect(manifest.id).toBe('conduit-foundry-heat-v2');
    expect(manifest.playerReferenceHeight).toBe(48);
    const destinations = manifest.assets.map((a) => a.destination);
    expect(destinations).toContain('assets/characters/player_idle.png');
    expect(destinations).toContain('assets/vfx/ambient_steam.png');
    expect(destinations).toContain('assets/props/biome_1/biome_1_prop_0.png');
    expect(destinations).toContain('assets/backgrounds/biome_2/near.png');
  });
});
