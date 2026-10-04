import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { refreshProjectTemplate } from './project-template-refresh.js';

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, writeFileSync: vi.fn(fs.writeFileSync) };
});
const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
let root: string;
let resourceRoot: string | undefined;
function put(path: string, bytes: string) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, bytes);
}
function fixture(genre = 'SIDE_VIEW_METROIDVANIA') {
  const project = join(root, 'game');
  put(
    join(project, 'project.godot'),
    '[application]\nconfig/name="Old"\n[rendering]\nquality="custom hd2d"\n[input]\ncustom="binding"\n[autoload]\nCustom="*res://custom.gd"\n',
  );
  put(
    join(project, 'game_dna.json'),
    JSON.stringify({ archetype: genre, identity: { title: 'A "Quoted" $& Castle' } }),
  );
  put(join(project, 'data/rooms.json'), 'authored rooms');
  put(join(project, 'assets/hero.png'), 'generated art');
  put(join(project, 'scenes/rooms/Keep.tscn'), 'authored scene');
  put(
    join(project, 'validation_report.json'),
    JSON.stringify({ passed: true, productionReady: true, validationLevel: 'RUNTIME_VALIDATED' }),
  );
  for (const [folder, marker] of [
    ['godot-metroidvania', 'sideview'],
    ['godot-topdown-adventure', 'topdown'],
  ]) {
    const template = join(root, 'templates', folder!);
    put(
      join(template, 'project.godot'),
      '[application]\nconfig/name="Template"\n[autoload]\nCustom="*res://wrong.gd"\nMapManager="*res://scripts/core/Map.gd"\n[input]\ncustom={\n"deadzone":0.8\n}\nspell={\n"deadzone":0.5,\n"events":[]\n}\n[rendering]\nquality="template"\n',
    );
    put(join(template, 'scripts/core/Map.gd'), marker!);
    put(join(template, 'scripts/core/Player.gd'), marker! + ' player');
    put(
      join(template, 'scenes/boot/Main.tscn'),
      '[node name="Title" type="Label"]\ntext = "MetroForge Game"\n',
    );
    put(join(template, 'scenes/rooms/Keep.tscn'), 'template room');
    put(join(template, 'assets/hero.png'), 'template art');
  }
  return project;
}
beforeEach(() => {
  vi.mocked(writeFileSync).mockImplementation(actualFs.writeFileSync);
  root = mkdtempSync(join(tmpdir(), 'metroforge-refresh-'));
  resourceRoot = process.env.METROFORGE_RESOURCE_ROOT;
  process.env.METROFORGE_RESOURCE_ROOT = root;
});
afterEach(() => {
  vi.mocked(writeFileSync).mockImplementation(actualFs.writeFileSync);
  if (resourceRoot === undefined) delete process.env.METROFORGE_RESOURCE_ROOT;
  else process.env.METROFORGE_RESOURCE_ROOT = resourceRoot;
  rmSync(root, { recursive: true, force: true });
});
describe('reviewed genre runtime refresh', () => {
  it('reviews without writes, selects the topdown resource template and leaves sideview orphans alone', () => {
    const project = fixture('TOP_DOWN_ACTION_ADVENTURE');
    put(join(project, 'scripts/world/AbilityGate.gd'), 'topdown custom gate');
    const plan = refreshProjectTemplate(project, { dryRun: true });
    expect(plan.success).toBe(true);
    expect(plan.planDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.templateName).toContain('Top-Down');
    expect(plan.removed).toEqual([]);
    expect(existsSync(join(project, '.metroforge'))).toBe(false);
    expect(JSON.parse(readFileSync(join(project, 'validation_report.json'), 'utf8')).passed).toBe(
      true,
    );
    const applied = refreshProjectTemplate(project, { expectedPlanDigest: plan.planDigest });
    expect(applied.success).toBe(true);
    expect(readFileSync(join(project, 'scripts/core/Map.gd'), 'utf8')).toBe('topdown');
    expect(readFileSync(join(project, 'scripts/world/AbilityGate.gd'), 'utf8')).toBe(
      'topdown custom gate',
    );
  });
  it('preserves settings, rooms and art, escapes titles literally, backs up preimages and invalidates stale validation', () => {
    const project = fixture();
    const previous = readFileSync(join(project, 'project.godot'));
    put(join(project, 'scripts/world/AbilityGate.gd'), 'old gate');
    const result = refreshProjectTemplate(project);
    expect(result.success).toBe(true);
    expect(result.removed).toContain('scripts/world/AbilityGate.gd');
    const config = readFileSync(join(project, 'project.godot'), 'utf8');
    expect(config).toContain('quality="custom hd2d"');
    expect(config).toContain('custom="binding"');
    expect(config).toContain('spell={\n"deadzone":0.5,\n"events":[]\n}');
    expect(config.match(/^custom=/gm)).toHaveLength(1);
    expect(config).toContain('Custom="*res://custom.gd"');
    expect(config).not.toContain('wrong.gd');
    expect(config.match(/^MapManager=/gm)).toHaveLength(1);
    expect(config).toContain('config/name=' + JSON.stringify('A "Quoted" $& Castle'));
    expect(readFileSync(join(project, 'scenes/boot/Main.tscn'), 'utf8')).toContain(
      'text = ' + JSON.stringify('A "Quoted" $& Castle'),
    );
    expect(readFileSync(join(project, 'data/rooms.json'), 'utf8')).toBe('authored rooms');
    expect(readFileSync(join(project, 'scenes/rooms/Keep.tscn'), 'utf8')).toBe('authored scene');
    expect(readFileSync(join(project, 'assets/hero.png'), 'utf8')).toBe('generated art');
    expect(readFileSync(join(result.backupPath!, 'files/project.godot'))).toEqual(previous);
    expect(
      readFileSync(join(result.backupPath!, 'files/scripts/world/AbilityGate.gd'), 'utf8'),
    ).toBe('old gate');
    expect(JSON.parse(readFileSync(join(result.backupPath!, 'receipt.json'), 'utf8')).status).toBe(
      'applied',
    );
    expect(JSON.parse(readFileSync(join(project, 'validation_report.json'), 'utf8'))).toMatchObject(
      { passed: false, productionReady: false, validationLevel: 'NEEDS_RUNTIME_VALIDATION' },
    );
    expect(result.validationInvalidated).toBe(true);
    const second = refreshProjectTemplate(project);
    expect(second.success).toBe(true);
    expect(second.copied).toEqual([]);
    expect(second.backupPath).toBeUndefined();
  });
  it('rejects a stale reviewed plan without overwriting concurrent edits', () => {
    const project = fixture();
    const plan = refreshProjectTemplate(project, { dryRun: true });
    put(join(project, 'scripts/core/Map.gd'), 'new user edit');
    const result = refreshProjectTemplate(project, { expectedPlanDigest: plan.planDigest });
    expect(result.success).toBe(false);
    expect(result.errors.join()).toContain('Files changed');
    expect(readFileSync(join(project, 'scripts/core/Map.gd'), 'utf8')).toBe('new user edit');
    expect(existsSync(join(project, '.metroforge'))).toBe(false);
  });
  it.each(['QUANTUM_SIMULATION_ROGUELITE', 'UNKNOWN_GENRE'])(
    'rejects unsupported %s without writes',
    (genre) => {
      const project = fixture(genre);
      const before = readFileSync(join(project, 'project.godot'));
      expect(refreshProjectTemplate(project).success).toBe(false);
      expect(readFileSync(join(project, 'project.godot'))).toEqual(before);
      expect(existsSync(join(project, 'scripts'))).toBe(false);
    },
  );
  it('fails closed for malformed or contradictory metadata', () => {
    const project = fixture();
    put(join(project, 'project.json'), '{broken');
    expect(refreshProjectTemplate(project).success).toBe(false);
    put(join(project, 'project.json'), JSON.stringify({ archetype: 'TOP_DOWN_ACTION_ADVENTURE' }));
    expect(refreshProjectTemplate(project).errors.join()).toContain('disagrees');
    expect(existsSync(join(project, 'scripts'))).toBe(false);
  });
  it('rejects linked project destinations before touching a different project', () => {
    const project = fixture(),
      other = join(root, 'other');
    mkdirSync(other);
    actualFs.symlinkSync(other, join(project, 'scripts'), 'junction');
    expect(refreshProjectTemplate(project).success).toBe(false);
    expect(readdirSync(other)).toEqual([]);
    actualFs.unlinkSync(join(project, 'scripts'));
  });
  it('restores touched files and preserves a rollback receipt after a partial write failure', () => {
    const project = fixture();
    put(join(project, 'scripts/core/Map.gd'), 'old runtime');
    const before = readFileSync(join(project, 'project.godot'));
    let failed = false;
    vi.mocked(writeFileSync).mockImplementation((...args) => {
      if (String(args[0]) === join(project, 'scripts/core/Player.gd') && !failed) {
        failed = true;
        throw new Error('disk fixture');
      }
      return actualFs.writeFileSync(...args);
    });
    const result = refreshProjectTemplate(project);
    expect(result.success).toBe(false);
    expect(result.errors.join()).toContain('disk fixture');
    expect(readFileSync(join(project, 'scripts/core/Map.gd'), 'utf8')).toBe('old runtime');
    expect(readFileSync(join(project, 'project.godot'))).toEqual(before);
    expect(existsSync(join(project, 'scripts/core/Player.gd'))).toBe(false);
    expect(JSON.parse(readFileSync(join(result.backupPath!, 'rollback.json'), 'utf8')).status).toBe(
      'rolled_back',
    );
  });
  it('preserves an edit made during backup preparation and aborts all runtime writes', () => {
    const project = fixture();
    let changed = false;
    vi.mocked(writeFileSync).mockImplementation((...args) => {
      const output = actualFs.writeFileSync(...args);
      if (String(args[0]).endsWith('receipt.json') && !changed) {
        changed = true;
        actualFs.writeFileSync(join(project, 'project.godot'), 'concurrent custom settings');
      }
      return output;
    });
    const result = refreshProjectTemplate(project);
    expect(result.success).toBe(false);
    expect(result.errors.join()).toContain('during refresh preparation');
    expect(readFileSync(join(project, 'project.godot'), 'utf8')).toBe('concurrent custom settings');
    expect(existsSync(join(project, 'scripts'))).toBe(false);
    expect(JSON.parse(readFileSync(join(result.backupPath!, 'receipt.json'), 'utf8')).status).toBe(
      'prepared',
    );
  });
});
