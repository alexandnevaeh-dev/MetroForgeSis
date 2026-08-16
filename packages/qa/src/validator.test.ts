import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateWorldTopology } from '@metroforge/procedural';
import { encodePng } from '@metroforge/assets';
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
    for (const action of ['move_left', 'move_right', 'move_up', 'move_down', 'jump', 'attack', 'dash', 'pause', 'interact']) {
      expect(patched).toContain(`${action}=`);
    }
    expect(patched).toContain('InputEventJoypadButton');
    expect(patched).toContain('InputEventJoypadMotion');
    expect(patched).toContain('InputEventMouseButton');
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

  it('passes required_files for TOP_DOWN_ACTION_ADVENTURE with TopDownPlayerController.gd only', () => {
    const outputDir = join(tmpdir(), `metroforge-qa-topdown-pc-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const required = [
      'project.godot',
      'project.json',
      'game_dna.json',
      'world_graph.json',
      'progression_graph.json',
      'generation_manifest.json',
      'data/player/movement.json',
      'scenes/boot/Main.tscn',
      'scenes/world/World.tscn',
      'scenes/player/Player.tscn',
      'scenes/world/PauseMenu.tscn',
      'scripts/UI/PauseMenu.gd',
      'scripts/core/MapManager.gd',
      'scripts/UI/WorldMapPanel.gd',
      'scripts/UI/MinimapPanel.gd',
      'scripts/core/InventoryManager.gd',
      'scripts/UI/InventoryPanel.gd',
      'scripts/UI/QuestPanel.gd',
      'scripts/UI/QuestTrackerPanel.gd',
      'scripts/core/SettingsManager.gd',
      'scenes/world/NPC.tscn',
      'scripts/world/NPC.gd',
      'scripts/core/QuestManager.gd',
      'scripts/core/EventBus.gd',
      'scripts/core/DialogueManager.gd',
      'scripts/UI/DialogueOverlay.gd',
      'scenes/world/DialogueOverlay.tscn',
      'scripts/core/ShopManager.gd',
      'scripts/core/VFXManager.gd',
      'scripts/UI/ShopOverlay.gd',
      'scenes/world/ShopOverlay.tscn',
      'scenes/world/ItemPickup.tscn',
      'scripts/world/ItemPickup.gd',
      'scenes/enemies/Projectile.tscn',
      'scripts/combat/Projectile.gd',
      'scenes/world/WeakFloor.tscn',
      'scripts/world/WeakFloor.gd',
      // Archetype-correct controller — deliberately NO side-view PlayerController.gd
      'scripts/player/TopDownPlayerController.gd',
    ];

    for (const rel of required) {
      const full = join(outputDir, rel);
      mkdirSync(join(full, '..'), { recursive: true });
      if (rel === 'game_dna.json') {
        writeFileSync(
          full,
          JSON.stringify({
            archetype: 'TOP_DOWN_ACTION_ADVENTURE',
            identity: { title: 'Top Down Fixture' },
            world: { roomCount: 4 },
          }),
        );
      } else {
        writeFileSync(full, rel.endsWith('.json') ? '{}' : '# stub\n');
      }
    }

    // Prove the side-view controller is absent — regression target of this gate.
    expect(existsSync(join(outputDir, 'scripts/player/PlayerController.gd'))).toBe(false);
    expect(existsSync(join(outputDir, 'scripts/player/TopDownPlayerController.gd'))).toBe(true);

    const validator = new QAValidator();
    const report = validator.validateProject(outputDir, 'proj_topdown');
    const filesGate = report.results.find((r) => r.gate === 'required_files');
    expect(filesGate?.passed).toBe(true);
    expect(filesGate?.message).toBe('All required files present');
    expect(filesGate?.details?.missingFiles).toEqual([]);

    rmSync(outputDir, { recursive: true, force: true });
  });
});

describe('QAValidator gameplay screenshot gate', () => {
  it('skips when no screenshot was captured', () => {
    const outputDir = join(tmpdir(), `metroforge-qa-shot-missing-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const validator = new QAValidator();
    const gate = validator.validateGameplayScreenshot(outputDir);
    expect(gate.gate).toBe('gameplay_screenshot_qa');
    expect(gate.passed).toBe(true);
    expect(gate.state).toBe('SKIPPED');

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('RELEASE_CANDIDATE fails when gameplay screenshot is missing', () => {
    const outputDir = join(tmpdir(), `metroforge-qa-shot-rc-missing-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    const validator = new QAValidator();
    const gate = validator.validateGameplayScreenshot(outputDir, { required: true });
    expect(gate.gate).toBe('gameplay_screenshot_qa');
    expect(gate.passed).toBe(false);
    expect(gate.state).toBe('FAIL');

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('skips blank headless frames', () => {
    const outputDir = join(tmpdir(), `metroforge-qa-shot-blank-${Date.now()}`);
    mkdirSync(join(outputDir, 'qa'), { recursive: true });
    const rgba = new Uint8Array(160 * 90 * 4);
    writeFileSync(join(outputDir, 'qa', 'screenshot_gameplay.png'), encodePng(160, 90, rgba));

    const validator = new QAValidator();
    const gate = validator.validateGameplayScreenshot(outputDir);
    expect(gate.passed).toBe(true);
    expect(gate.state).toBe('SKIPPED');
    expect(gate.message.toLowerCase()).toContain('blank');

    rmSync(outputDir, { recursive: true, force: true });
  });

  it('passes a structured HUD + world screenshot', () => {
    const outputDir = join(tmpdir(), `metroforge-qa-shot-ok-${Date.now()}`);
    mkdirSync(join(outputDir, 'qa'), { recursive: true });
    const width = 160;
    const height = 90;
    const rgba = new Uint8Array(width * height * 4);
    const fill = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      color: [number, number, number, number],
    ) => {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          rgba[i] = color[0];
          rgba[i + 1] = color[1];
          rgba[i + 2] = color[2];
          rgba[i + 3] = color[3];
        }
      }
    };
    fill(0, 0, width, height, [18, 22, 40, 255]);
    fill(20, 8, 52, 48, [168, 196, 228, 255]);
    fill(70, 10, 110, 50, [150, 180, 214, 255]);
    fill(0, 68, width, height, [92, 58, 36, 255]);
    fill(4, 2, 70, 10, [48, 190, 72, 255]);
    fill(76, 3, 92, 9, [210, 50, 50, 255]);
    fill(48, 46, 60, 68, [90, 150, 230, 255]);
    writeFileSync(join(outputDir, 'qa', 'screenshot_gameplay.png'), encodePng(width, height, rgba));

    const validator = new QAValidator();
    const gate = validator.validateGameplayScreenshot(outputDir);
    expect(gate.passed).toBe(true);
    expect(gate.state).toBe('PASS');
    expect(existsSync(join(outputDir, 'qa', 'screenshot_critique.json'))).toBe(true);

    rmSync(outputDir, { recursive: true, force: true });
  });
});
