import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanGodotResourceGraph, assetPathToResPath } from './godot-resource-graph.js';

describe('godot-resource-graph', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'metroforge-godot-graph-'));
    mkdirSync(join(dir, 'scenes', 'player'), { recursive: true });
    mkdirSync(join(dir, 'scripts', 'player'), { recursive: true });
    writeFileSync(
      join(dir, 'scenes', 'player', 'Player.tscn'),
      `[gd_scene load_steps=2 format=3]
[ext_resource type="Texture2D" path="res://assets/characters/player.png" id="1_tex"]
[ext_resource type="Script" path="res://scripts/player/PlayerController.gd" id="2_script"]
[node name="Player" type="CharacterBody2D"]
script = ExtResource("2_script")
`,
    );
    writeFileSync(
      join(dir, 'scripts', 'player', 'PlayerController.gd'),
      `extends CharacterBody2D
const FX := preload("res://assets/vfx/dash.png")
func _ready():
\tload("res://scenes/world/PauseMenu.tscn")
`,
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('indexes ext_resource, preload, and load references', () => {
    const graph = scanGodotResourceGraph(dir);
    expect(graph.scannedFiles).toBeGreaterThanOrEqual(2);
    expect(graph.resources.has('res://assets/characters/player.png')).toBe(true);
    expect(graph.resources.has('res://scripts/player/PlayerController.gd')).toBe(true);
    expect(graph.resources.has('res://assets/vfx/dash.png')).toBe(true);
    expect(graph.resources.has('res://scenes/world/PauseMenu.tscn')).toBe(true);
  });

  it('maps asset paths to res://', () => {
    expect(assetPathToResPath('assets/enemies/foo.png')).toBe('res://assets/enemies/foo.png');
  });
});
