import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { remapGameDnaAbilities, remapProjectAbilities } from './remap-project-abilities.js';

function writeDna(dir: string, abilities: unknown[]) {
  writeFileSync(
    join(dir, 'game_dna.json'),
    JSON.stringify(
      {
        version: '1',
        identity: { title: 'Test', genre: 'mv', tone: 'dark', visualStyle: 'pixel' },
        abilities,
      },
      null,
      2,
    ),
  );
}

describe('remapProjectAbilities', () => {
  it('returns error when game_dna.json is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-remap-missing-'));
    const result = remapProjectAbilities(dir);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/missing/i);
  });

  it('remaps wind_disc and removes unknowns on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-remap-'));
    writeDna(dir, [
      { id: 'wind_disc', name: 'Wind Disc', category: 'movement', enabled: true },
      { id: 'mystery_orb', name: 'Orb', category: 'movement', enabled: true },
      { id: 'double_jump', name: 'Double Jump', category: 'movement', enabled: true },
    ]);

    const result = remapProjectAbilities(dir);
    expect(result.success).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.remapped).toEqual([{ from: 'wind_disc', to: 'dash' }]);
    expect(result.removed).toEqual(['mystery_orb']);

    const dna = JSON.parse(readFileSync(join(dir, 'game_dna.json'), 'utf-8')) as {
      abilities: Array<{ id: string; name: string }>;
    };
    expect(dna.abilities.map((a) => a.id).sort()).toEqual(['dash', 'double_jump']);
    expect(dna.abilities.find((a) => a.id === 'dash')?.name).toBe('Dash');
  });

  it('dryRun does not write', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-remap-dry-'));
    writeDna(dir, [{ id: 'wind', name: 'Wind', category: 'movement', enabled: true }]);
    const before = readFileSync(join(dir, 'game_dna.json'), 'utf-8');
    const result = remapProjectAbilities(dir, { dryRun: true });
    expect(result.success).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.remapped).toEqual([{ from: 'wind', to: 'dash' }]);
    expect(readFileSync(join(dir, 'game_dna.json'), 'utf-8')).toBe(before);
  });

  it('is idempotent when already registered', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-remap-idem-'));
    writeDna(dir, [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }]);
    const result = remapProjectAbilities(dir);
    expect(result.success).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.remapped).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('remapGameDnaAbilities remaps in memory without disk', () => {
    const result = remapGameDnaAbilities({
      version: '1',
      abilities: [{ id: 'wind_disc', name: 'Wind Disc', category: 'tool', enabled: true }],
    });
    expect(result.changed).toBe(true);
    expect(result.remapped).toEqual([{ from: 'wind_disc', to: 'dash' }]);
    expect(result.dna.abilities?.[0]?.id).toBe('dash');
  });

  it('syncs data/abilities/abilities.json when present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-remap-sync-'));
    writeDna(dir, [{ id: 'gale', name: 'Gale', category: 'tool', enabled: true }]);
    const abilitiesDir = join(dir, 'data', 'abilities');
    mkdirSync(abilitiesDir, { recursive: true });
    writeFileSync(
      join(abilitiesDir, 'abilities.json'),
      JSON.stringify({
        abilities: [{ id: 'gale', displayName: 'Gale', category: 'tool', enabled: true }],
      }),
    );

    const result = remapProjectAbilities(dir);
    expect(result.success).toBe(true);
    expect(result.abilitiesDataUpdated).toBe(true);
    const data = JSON.parse(readFileSync(join(abilitiesDir, 'abilities.json'), 'utf-8')) as {
      abilities: Array<{ id: string; displayName: string }>;
    };
    expect(data.abilities[0]?.id).toBe('dash');
    expect(data.abilities[0]?.displayName).toBe('Dash');
  });

  it('rewrites item/world/progression wind_disc reward strings to dash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mf-remap-refs-'));
    writeDna(dir, [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }]);
    mkdirSync(join(dir, 'data', 'items'), { recursive: true });
    mkdirSync(join(dir, 'data', 'world'), { recursive: true });
    writeFileSync(
      join(dir, 'data', 'items', 'items.json'),
      JSON.stringify({
        items: [
          { id: 'wind_disc', name: 'Wind Disc', category: 'relic' },
          { id: 'wind_disc', name: 'Wind Disc', category: 'tool' },
          { id: 'key', name: 'Key' },
        ],
      }),
    );
    writeFileSync(
      join(dir, 'world_graph.json'),
      JSON.stringify({
        nodes: [{ id: 'boss', metadata: { grantsAbilities: ['wind_disc'] } }],
      }),
    );
    writeFileSync(
      join(dir, 'progression_graph.json'),
      JSON.stringify({
        nodes: [{ id: 'item_wind_disc', label: 'wind_disc' }],
        edges: [{ from: 'item_wind_disc', requires: ['wind_disc'] }],
        abilities: ['wind_disc'],
        criticalPath: ['item_wind_disc'],
      }),
    );
    writeFileSync(
      join(dir, 'data', 'world', 'overworld.json'),
      JSON.stringify({
        dungeonItemId: 'wind_disc',
        dungeonItemsById: { dungeon_000: 'wind_disc' },
        pois: [{ metadata: { rewardItemId: 'wind_disc' } }],
      }),
    );

    const result = remapProjectAbilities(dir);
    expect(result.success).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.referenceFilesUpdated.length).toBeGreaterThan(0);

    const items = JSON.parse(readFileSync(join(dir, 'data', 'items', 'items.json'), 'utf-8')) as {
      items: Array<{ id: string }>;
    };
    expect(items.items.map((i) => i.id)).toEqual(['dash', 'key']);

    const world = JSON.parse(readFileSync(join(dir, 'world_graph.json'), 'utf-8')) as {
      nodes: Array<{ metadata: { grantsAbilities: string[] } }>;
    };
    expect(world.nodes[0]?.metadata.grantsAbilities).toEqual(['dash']);

    const prog = JSON.parse(readFileSync(join(dir, 'progression_graph.json'), 'utf-8')) as {
      nodes: Array<{ id: string; label: string }>;
      abilities: string[];
      criticalPath: string[];
    };
    expect(prog.nodes[0]?.id).toBe('item_dash');
    expect(prog.nodes[0]?.label).toBe('dash');
    expect(prog.abilities).toEqual(['dash']);
    expect(prog.criticalPath).toEqual(['item_dash']);

    const overworld = JSON.parse(
      readFileSync(join(dir, 'data', 'world', 'overworld.json'), 'utf-8'),
    ) as {
      dungeonItemId: string;
      dungeonItemsById: Record<string, string>;
    };
    expect(overworld.dungeonItemId).toBe('dash');
    expect(overworld.dungeonItemsById.dungeon_000).toBe('dash');
  });
});
