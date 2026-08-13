import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  deleteProject,
  duplicateProject,
  renameProject,
  resolveProjectBySlug,
  refreshProjectTemplate,
  refreshAllProjectTemplates,
  listGeneratedProjects,
} from './project-lifecycle.js';

function stubProject(root: string, slug: string): string {
  const path = join(root, slug);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'project.godot'), 'config/name="Old Game"');
  return path;
}

function stubTemplate(root: string): string {
  const template = join(root, 'template');
  mkdirSync(join(template, 'scripts', 'core'), { recursive: true });
  mkdirSync(join(template, 'scripts', 'world'), { recursive: true });
  mkdirSync(join(template, 'scripts', 'UI'), { recursive: true });
  mkdirSync(join(template, 'scenes', 'boot'), { recursive: true });
  writeFileSync(join(template, 'project.godot'), 'config/name="MetroForge Template"\n[autoload]\nMapManager="*"\n');
  writeFileSync(join(template, 'scripts', 'core', 'SaveManager.gd'), 'const SAVE_VERSION := 2\nfunc _migrate_save_data():\n\tpass\n');
  writeFileSync(join(template, 'scripts', 'UI', 'MinimapPanel.gd'), 'extends WorldMapPanel\n');
  writeFileSync(join(template, 'scripts', 'UI', 'QuestTrackerPanel.gd'), 'extends Control\n');
  writeFileSync(
    join(template, 'scenes', 'boot', 'Main.tscn'),
    '[node name="Title" type="Label"]\ntext = "MetroForge Game"\n',
  );
  return template;
}

describe('project-lifecycle', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'metroforge-projects-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resolves slug safely', () => {
    const path = stubProject(root, 'my-game');
    const resolved = resolveProjectBySlug(root, 'my-game');
    expect(resolved.success).toBe(true);
    expect(resolved.projectPath).toBe(path);
    expect(resolveProjectBySlug(root, '../escape').success).toBe(false);
  });

  it('duplicates and deletes projects', () => {
    stubProject(root, 'source-game');
    const dup = duplicateProject(join(root, 'source-game'), 'copy-game', root);
    expect(dup.success).toBe(true);
    expect(existsSync(join(root, 'copy-game', 'project.godot'))).toBe(true);

    const del = deleteProject(join(root, 'copy-game'));
    expect(del.success).toBe(true);
    expect(existsSync(join(root, 'copy-game'))).toBe(false);
  });

  it('renames a project folder', () => {
    stubProject(root, 'old-name');
    const result = renameProject(join(root, 'old-name'), 'new-name', root);
    expect(result.success).toBe(true);
    expect(existsSync(join(root, 'new-name', 'project.godot'))).toBe(true);
    expect(existsSync(join(root, 'old-name'))).toBe(false);
  });

  it('refreshes runtime template files and removes orphans without touching generated data', () => {
    const template = stubTemplate(root);
    const project = stubProject(root, 'old-game');
    mkdirSync(join(project, 'scripts', 'world'), { recursive: true });
    mkdirSync(join(project, 'data'), { recursive: true });
    writeFileSync(join(project, 'scripts', 'world', 'AbilityGate.gd'), 'extends Area2D\n');
    writeFileSync(join(project, 'data', 'rooms.json'), '{"rooms":{}}');
    writeFileSync(
      join(project, 'game_dna.json'),
      JSON.stringify({ identity: { title: 'Ruined Temple' } }),
    );

    const result = refreshProjectTemplate(project, { templateDir: template });
    expect(result.success).toBe(true);
    expect(result.copied).toContain('scripts/core/SaveManager.gd');
    expect(result.copied).toContain('scripts/UI/MinimapPanel.gd');
    expect(result.copied).toContain('scripts/UI/QuestTrackerPanel.gd');
    expect(result.copied).toContain('project.godot');
    expect(result.removed).toContain('scripts/world/AbilityGate.gd');
    expect(existsSync(join(project, 'scripts', 'world', 'AbilityGate.gd'))).toBe(false);
    expect(readFileSync(join(project, 'scripts', 'core', 'SaveManager.gd'), 'utf-8')).toContain(
      '_migrate_save_data',
    );
    expect(readFileSync(join(project, 'project.godot'), 'utf-8')).toContain('config/name="Ruined Temple"');
    expect(readFileSync(join(project, 'scenes', 'boot', 'Main.tscn'), 'utf-8')).toContain('Ruined Temple');
    expect(readFileSync(join(project, 'data', 'rooms.json'), 'utf-8')).toBe('{"rooms":{}}');
  });

  it('refreshes every generated project under the root', () => {
    const template = stubTemplate(join(root, 'fixtures'));
    stubProject(root, 'alpha');
    stubProject(root, 'beta');
    mkdirSync(join(root, 'not-a-project'), { recursive: true });

    expect(listGeneratedProjects(root)).toHaveLength(2);
    const results = refreshAllProjectTemplates(root, { templateDir: template });
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
    expect(existsSync(join(root, 'alpha', 'scripts', 'UI', 'MinimapPanel.gd'))).toBe(true);
    expect(existsSync(join(root, 'beta', 'scripts', 'core', 'SaveManager.gd'))).toBe(true);
  });
});
