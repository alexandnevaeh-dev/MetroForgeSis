import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateWorldTopology } from '@metroforge/procedural';
import { QAValidator, RepairEngineer } from './validator.js';

describe('RepairEngineer', () => {
  it('recreates a missing generation_manifest.json', () => {
    const outputDir = join(tmpdir(), `metroforge-repair-manifest-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const repair = new RepairEngineer();
    const result = repair.repair(outputDir, {
      passed: false,
      results: [{ gate: 'required_files', passed: false, message: 'missing' }],
      validationResults: [],
    });

    expect(result.repaired).toBe(true);
    expect(existsSync(join(outputDir, 'generation_manifest.json'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(outputDir, 'generation_manifest.json'), 'utf-8'));
    expect(manifest.repaired).toBe(true);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('restores missing InputMap actions in project.godot from the runtime template', () => {
    const outputDir = join(tmpdir(), `metroforge-repair-input-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    // A project.godot with the [input] section stripped out entirely.
    writeFileSync(
      join(outputDir, 'project.godot'),
      [
        '; Engine configuration file.',
        '',
        '[application]',
        '',
        'config/name="Test Game"',
        'run/main_scene="res://scenes/boot/Main.tscn"',
        '',
        '[display]',
        '',
        'window/size/viewport_width=1920',
        '',
      ].join('\n'),
    );

    const repair = new RepairEngineer();
    const result = repair.repair(outputDir, {
      passed: false,
      results: [{ gate: 'input_actions_exist', passed: false, message: 'Missing input actions' }],
      validationResults: [],
    });

    expect(result.repaired).toBe(true);
    const patched = readFileSync(join(outputDir, 'project.godot'), 'utf-8');
    for (const action of ['move_left', 'move_right', 'jump', 'attack', 'dash', 'pause']) {
      expect(patched).toContain(`${action}=`);
    }
    // The other sections must survive the patch untouched.
    expect(patched).toContain('run/main_scene="res://scenes/boot/Main.tscn"');
    expect(patched).toContain('window/size/viewport_width=1920');

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('restores a missing Player.tscn from the runtime template', () => {
    const outputDir = join(tmpdir(), `metroforge-repair-player-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const repair = new RepairEngineer();
    const result = repair.repair(outputDir, {
      passed: false,
      results: [{ gate: 'player_spawn_valid', passed: false, message: 'Player scene missing' }],
      validationResults: [],
    });

    expect(result.repaired).toBe(true);
    expect(existsSync(join(outputDir, 'scenes', 'player', 'Player.tscn'))).toBe(true);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('restores a missing Main.tscn and reapplies the game title from game_dna.json', () => {
    const outputDir = join(tmpdir(), `metroforge-repair-mainscene-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      join(outputDir, 'game_dna.json'),
      JSON.stringify({ identity: { title: 'Repaired Realm' } }),
    );

    const repair = new RepairEngineer();
    const result = repair.repair(outputDir, {
      passed: false,
      results: [{ gate: 'main_scene_starts', passed: false, message: 'Main scene invalid' }],
      validationResults: [],
    });

    expect(result.repaired).toBe(true);
    const mainScenePath = join(outputDir, 'scenes', 'boot', 'Main.tscn');
    expect(existsSync(mainScenePath)).toBe(true);
    expect(readFileSync(mainScenePath, 'utf-8')).toContain('Repaired Realm');

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('restores a missing project.godot and reapplies the game title from game_dna.json', () => {
    const outputDir = join(tmpdir(), `metroforge-repair-projectgodot-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      join(outputDir, 'game_dna.json'),
      JSON.stringify({ identity: { title: 'Restored Kingdom' } }),
    );

    const repair = new RepairEngineer();
    const result = repair.repair(outputDir, {
      passed: false,
      results: [{ gate: 'main_scene_starts', passed: false, message: 'Main scene invalid' }],
      validationResults: [],
    });

    expect(result.repaired).toBe(true);
    const projectGodotPath = join(outputDir, 'project.godot');
    expect(existsSync(projectGodotPath)).toBe(true);
    expect(readFileSync(projectGodotPath, 'utf-8')).toContain('config/name="Restored Kingdom"');

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('is a no-op when the gate already passes', () => {
    const outputDir = join(tmpdir(), `metroforge-repair-noop-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const repair = new RepairEngineer();
    const result = repair.repair(outputDir, {
      passed: true,
      results: [{ gate: 'required_files', passed: true, message: 'ok' }],
      validationResults: [],
    });

    expect(result.repaired).toBe(false);
    expect(result.actions).toHaveLength(0);

    rmSync(outputDir, { recursive: true, force: true });
  });
});

describe('QAValidator', () => {
  it('reports missing required files on an empty project directory', () => {
    const outputDir = join(tmpdir(), `metroforge-qa-empty-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const validator = new QAValidator();
    const report = validator.validateProject(outputDir, 'proj_test');

    expect(report.passed).toBe(false);
    const filesGate = report.results.find((r) => r.gate === 'required_files');
    expect(filesGate?.passed).toBe(false);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('passes world_connectivity for a normally generated world', () => {
    const outputDir = join(tmpdir(), `metroforge-qa-connected-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const { worldGraph } = generateWorldTopology({
      seed: 1,
      roomCount: 12,
      biomeCount: 2,
      abilities: ['dash'],
      bossCount: 1,
    });
    writeFileSync(join(outputDir, 'world_graph.json'), JSON.stringify(worldGraph));

    const validator = new QAValidator();
    const report = validator.validateProject(outputDir, 'proj_test');
    const gate = report.results.find((r) => r.gate === 'world_connectivity');
    expect(gate?.passed).toBe(true);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('fails world_connectivity when a room is disconnected from start', () => {
    const outputDir = join(tmpdir(), `metroforge-qa-disconnected-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const { worldGraph } = generateWorldTopology({
      seed: 1,
      roomCount: 12,
      biomeCount: 2,
      abilities: ['dash'],
      bossCount: 1,
    });
    const brokenGraph = {
      ...worldGraph,
      edges: worldGraph.edges.filter((e) => e.from !== 'room_005' && e.to !== 'room_005'),
    };
    writeFileSync(join(outputDir, 'world_graph.json'), JSON.stringify(brokenGraph));

    const validator = new QAValidator();
    const report = validator.validateProject(outputDir, 'proj_test');
    const gate = report.results.find((r) => r.gate === 'world_connectivity');
    expect(gate?.passed).toBe(false);
    expect(report.passed).toBe(false);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('passes asset_references_valid when every ext_resource path resolves', () => {
    const outputDir = join(tmpdir(), `metroforge-qa-refs-ok-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(join(outputDir, 'scenes', 'rooms'), { recursive: true });
    mkdirSync(join(outputDir, 'assets', 'tilesets', 'biome_0'), { recursive: true });
    writeFileSync(join(outputDir, 'assets', 'tilesets', 'biome_0', 'source.png'), 'fake-png');
    writeFileSync(
      join(outputDir, 'scenes', 'rooms', 'room_000.tscn'),
      '[ext_resource type="Texture2D" path="res://assets/tilesets/biome_0/source.png" id="1"]\n',
    );

    const validator = new QAValidator();
    const report = validator.validateProject(outputDir, 'proj_test');
    const gate = report.results.find((r) => r.gate === 'asset_references_valid');
    expect(gate?.passed).toBe(true);

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('fails asset_references_valid when a referenced texture is missing on disk', () => {
    const outputDir = join(tmpdir(), `metroforge-qa-refs-missing-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    mkdirSync(join(outputDir, 'scenes', 'rooms'), { recursive: true });
    // Note: no file written at assets/tilesets/biome_0/source.png — simulates the asset
    // pipeline silently failing to produce a texture the assembler still referenced.
    writeFileSync(
      join(outputDir, 'scenes', 'rooms', 'room_000.tscn'),
      '[ext_resource type="Texture2D" path="res://assets/tilesets/biome_0/source.png" id="1"]\n',
    );

    const validator = new QAValidator();
    const report = validator.validateProject(outputDir, 'proj_test');
    const gate = report.results.find((r) => r.gate === 'asset_references_valid');
    expect(gate?.passed).toBe(false);
    expect(gate?.details?.missingReferences).toEqual([
      { scene: 'scenes/rooms/room_000.tscn', resource: 'assets/tilesets/biome_0/source.png' },
    ]);

    rmSync(outputDir, { recursive: true, force: true });
  });
});
