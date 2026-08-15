import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodePng } from '@metroforge/assets';
import { QualityDirector } from './quality-director.js';
import { QualityRepairEngine } from './quality-repair-engine.js';
import { combineQualityScores, scorePresentation, scoreTechnical } from './quality-scoring.js';

function structuredPng(): Buffer {
  const width = 160;
  const height = 90;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = x < 40 ? 220 : y > 60 ? 90 : 18;
      rgba[i + 1] = y < 12 ? 200 : 28;
      rgba[i + 2] = 40 + (x % 50);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
}

describe('quality scoring', () => {
  it('separates technical and presentation scores', () => {
    const technical = scoreTechnical({
      validationPassed: true,
      playtestPassed: true,
      transitionsCompleted: 30,
      transitionsPlanned: 30,
      commercialSafe: true,
      placeholderCount: 0,
      godotImportPassed: true,
    });
    expect(technical).toBeGreaterThanOrEqual(90);
    const presentation = scorePresentation({
      criticScore: 55,
      lumaStdDev: 2.42,
      uniqueColors: 30,
      occupancy: 0.85,
      criticPassed: false,
      criticIssues: ['looks flat'],
    });
    expect(presentation).toBeLessThan(70);
    const combined = combineQualityScores(technical, presentation);
    expect(combined.technicalScore).toBeGreaterThanOrEqual(90);
    expect(combined.presentationScore).toBeLessThan(70);
    expect(combined.qualityScore).toBeGreaterThan(0);
  });
});

describe('QualityDirector', () => {
  it('emits typed repair actions without writing project files', () => {
    const dir = join(tmpdir(), `mf-qd-${Date.now()}`);
    mkdirSync(join(dir, 'qa'), { recursive: true });
    mkdirSync(join(dir, 'scenes', 'rooms'), { recursive: true });
    writeFileSync(join(dir, 'game_dna.json'), JSON.stringify({ profile: 'RELEASE_CANDIDATE', identity: { title: 'T' } }));
    writeFileSync(
      join(dir, 'style_bible.json'),
      JSON.stringify({
        lighting: 'low-key rim lighting',
        palette: [{ name: 'Shadow', hex: '#141820', usage: 'backgrounds' }],
      }),
    );
    writeFileSync(
      join(dir, 'qa', 'screenshot_critique.json'),
      JSON.stringify({
        passed: false,
        score: 55,
        lumaStdDev: 2.42,
        uniqueColors: 30,
        occupancy: 0.85,
        issues: ['Gameplay screenshot lacks spatial structure (looks flat)'],
      }),
    );
    writeFileSync(
      join(dir, 'scenes', 'rooms', 'room_000.tscn'),
      '[node name="Background" type="TextureRect" parent="."]\nstretch_mode = 6\n',
    );
    writeFileSync(
      join(dir, 'validation_report.json'),
      JSON.stringify({
        passed: true,
        results: [
          { gate: 'godot_imports', passed: true },
          { gate: 'godot_playtest', passed: true },
        ],
      }),
    );
    writeFileSync(
      join(dir, 'playtest_telemetry.json'),
      JSON.stringify({
        transitionsCompleted: 30,
        transitionsPlanned: 30,
        victoryState: true,
        inputSimulationUsed: true,
      }),
    );
    writeFileSync(join(dir, 'license_report.json'), JSON.stringify({ commercialSafe: true }));
    writeFileSync(
      join(dir, 'generation_manifest.json'),
      JSON.stringify({ artifacts: [{ path: 'assets/characters/player_death.png', maturity: 'REJECTED' }] }),
    );

    const marker = join(dir, 'SHOULD_NOT_EXIST.txt');
    const plan = new QualityDirector().analyze(dir);
    expect(existsSync(marker)).toBe(false);
    expect(plan.provenance.rejectedDeathSheets).toBe(1);
    expect(plan.provenance.placeholderCount).toBe(0);
    expect(plan.snapshot.criticScore).toBe(55);
    expect(plan.issues.some((i) => i.category === 'CONTRAST' || i.category === 'DEPTH')).toBe(true);
    const kinds = plan.actions.map((a) => a.kind);
    expect(kinds).toContain('APPLY_LIGHTING_PROFILE');
    expect(kinds).toContain('PLACE_ROOM_DECOR');
    expect(kinds).toContain('APPLY_CAMERA_PROFILE');
    expect(kinds).toContain('APPLY_COMBAT_FEEDBACK');
    expect(plan.actions.every((a) => typeof a.kind === 'string' && typeof a.payload === 'object')).toBe(true);
    expect(plan.budgets.maxRegenerationsPerAsset).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('QualityRepairEngine', () => {
  it('applies typed commands as file copies and quality data, not ad-hoc scatter', () => {
    const dir = join(tmpdir(), `mf-qr-${Date.now()}`);
    mkdirSync(join(dir, 'scenes', 'player'), { recursive: true });
    mkdirSync(join(dir, 'scenes', 'world'), { recursive: true });
    writeFileSync(
      join(dir, 'project.godot'),
      '[application]\nconfig/name="Heart"\n\n[autoload]\nVFXManager="*res://scripts/core/VFXManager.gd"\n\n[rendering]\n\ntextures/canvas_textures/default_texture_filter=0\n',
    );
    writeFileSync(
      join(dir, 'scenes', 'player', 'Player.tscn'),
      `[gd_scene load_steps=9 format=3]
[ext_resource type="Script" path="res://scripts/player/AbilityController.gd" id="6_ability"]
[node name="Camera2D" type="Camera2D" parent="."]
position = Vector2(0, -20)
zoom = Vector2(1.5, 1.5)
`,
    );
    writeFileSync(
      join(dir, 'scenes', 'world', 'World.tscn'),
      `[gd_scene load_steps=7 format=3]
[node name="HealthBar" type="ProgressBar" parent="GameHUD/HUD/MarginContainer/VBox"]
custom_minimum_size = Vector2(200, 20)
layout_mode = 2
max_value = 100.0
value = 100.0
show_percentage = false
[node name="AbilityLabel" type="Label" parent="GameHUD/HUD/MarginContainer/VBox"]
layout_mode = 2
text = "Abilities: None"
[node name="VictoryOverlay" type="ColorRect" parent="GameHUD"]
color = Color(0, 0, 0, 0.7)
[node name="VictoryLabel" type="Label" parent="GameHUD/VictoryOverlay"]
theme_override_font_sizes/font_size = 36
text = "Victory!"
`,
    );

    const director = new QualityDirector();
    const plan = director.analyze(dir, { tier: 'LOW' });
    const applied = new QualityRepairEngine().apply(plan);
    expect(applied.some((a) => a.ok)).toBe(true);
    expect(existsSync(join(dir, 'scripts', 'core', 'QualityPresentation.gd'))).toBe(true);
    expect(existsSync(join(dir, 'data', 'quality', 'apply_lighting_profile.json'))).toBe(true);
    expect(existsSync(join(dir, 'data', 'quality', 'apply_combat_feedback.json'))).toBe(true);
    const godot = readFileSync(join(dir, 'project.godot'), 'utf-8');
    expect(godot).toContain('QualityPresentation=');
    expect(godot).toContain('CombatFeedback=');
    expect(godot).toContain('default_clear_color');
    rmSync(dir, { recursive: true, force: true });
  });

  it('patches CRLF project.godot autoloads', () => {
    const dir = join(tmpdir(), `mf-qr-crlf-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'project.godot'),
      '[application]\r\nconfig/name="Heart"\r\n\r\n[autoload]\r\nVFXManager="*res://scripts/core/VFXManager.gd"\r\n\r\n[rendering]\r\n\r\ntextures/canvas_textures/default_texture_filter=0\r\n',
    );
    const engine = new QualityRepairEngine();
    engine.applyOne(dir, {
      kind: 'PATCH_PROJECT_AUTOLOADS',
      category: 'VISUAL_COHERENCE',
      reason: 'test',
      payload: {},
    });
    engine.applyOne(dir, {
      kind: 'SET_CLEAR_COLOR',
      category: 'CONTRAST',
      reason: 'test',
      payload: { color: [0.08, 0.09, 0.12] },
    });
    const godot = readFileSync(join(dir, 'project.godot'), 'utf-8');
    expect(godot).toContain('QualityPresentation=');
    expect(godot).toContain('CombatFeedback=');
    expect(godot).toContain('default_clear_color');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('structured screenshot helper stays local to tests', () => {
  it('encodes a png', () => {
    expect(structuredPng().length).toBeGreaterThan(32);
  });
});
