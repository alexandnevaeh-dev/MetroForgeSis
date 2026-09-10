import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const spawnSyncMock = vi.fn();
vi.mock('node:child_process', () => ({
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

// Imported after the mock so the module under test picks up the mocked spawnSync.
const {
  exportGodotMacOSApp,
  exportGodotWindowsBinary,
  ensureMacOSExportPreset,
  ensureWindowsExportPreset,
} = await import('./godot-export.js');

describe('godot-export', () => {
  let dir: string;

  beforeEach(() => {
    dir = join(tmpdir(), `mf-godot-export-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    spawnSyncMock.mockReset();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a Windows Desktop export preset when none exists and preserves an existing matching preset', () => {
    const cfgPath = ensureWindowsExportPreset(dir);
    expect(existsSync(cfgPath)).toBe(true);
    expect(readFileSync(cfgPath, 'utf-8')).toContain('platform="Windows Desktop"');

    writeFileSync(cfgPath, '[preset.0]\n\nname="custom-user-preset"\nplatform="Windows Desktop"\n');
    ensureWindowsExportPreset(dir);
    expect(readFileSync(cfgPath, 'utf-8')).toContain('name="custom-user-preset"');
    expect(readFileSync(cfgPath, 'utf-8').match(/platform="Windows Desktop"/g)).toHaveLength(1);
  });

  it('appends a missing platform preset without overwriting a user preset', () => {
    const cfgPath = join(dir, 'export_presets.cfg');
    writeFileSync(cfgPath, '[preset.0]\n\nname="Web"\nplatform="Web"\n');

    ensureMacOSExportPreset(dir);

    const cfg = readFileSync(cfgPath, 'utf-8');
    expect(cfg).toContain('name="Web"');
    expect(cfg).toContain('[preset.1]');
    expect(cfg).toContain('platform="macOS"');
  });

  it('invokes real --export-release and reports success only when the binary actually exists', () => {
    const outputExePath = join(dir, 'out', 'Game.exe');
    spawnSyncMock.mockImplementation((_cmd: string, _args: string[]) => {
      mkdirSync(join(dir, 'out'), { recursive: true });
      writeFileSync(outputExePath, Buffer.from('MZ-fake-binary'));
      return { status: 0, stdout: 'export ok', stderr: '', signal: null, error: undefined };
    });

    const result = exportGodotWindowsBinary({
      projectPath: dir,
      godotExecutable: 'C:/fake/Godot.exe',
      outputExePath,
    });

    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnSyncMock.mock.calls[0]!;
    expect(cmd).toBe('C:/fake/Godot.exe');
    expect(args).toEqual(['--headless', '--path', dir, '--export-release', 'Windows Desktop', outputExePath]);

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.outputExists).toBe(true);
    expect(result.outputSizeBytes).toBeGreaterThan(0);
  });

  it('does not report success when Godot exits nonzero even if a stale binary is present', () => {
    const outputExePath = join(dir, 'out', 'Game.exe');
    mkdirSync(join(dir, 'out'), { recursive: true });
    writeFileSync(outputExePath, Buffer.from('stale-from-a-previous-run'));
    spawnSyncMock.mockReturnValue({ status: 1, stdout: '', stderr: 'export failed', signal: null, error: undefined });

    const result = exportGodotWindowsBinary({
      projectPath: dir,
      godotExecutable: 'C:/fake/Godot.exe',
      outputExePath,
    });

    expect(result.exitCode).toBe(1);
    // A stale file existing from a prior run must not be mistaken for evidence this run succeeded.
    expect(result.success).toBe(false);
  });

  it('does not report success when Godot exits 0 but produced no binary', () => {
    const outputExePath = join(dir, 'out', 'Game.exe');
    spawnSyncMock.mockReturnValue({ status: 0, stdout: '', stderr: '', signal: null, error: undefined });

    const result = exportGodotWindowsBinary({
      projectPath: dir,
      godotExecutable: 'C:/fake/Godot.exe',
      outputExePath,
    });

    expect(result.outputExists).toBe(false);
    expect(result.success).toBe(false);
  });

  it('writes a universal ad-hoc signed macOS preset with a native ARM64 slice and invokes a real app ZIP export', () => {
    const outputZipPath = join(dir, 'out', 'Game.zip');
    const cfgPath = ensureMacOSExportPreset(dir);
    const cfg = readFileSync(cfgPath, 'utf-8');
    expect(cfg).toContain('platform="macOS"');
    expect(cfg).toContain('binary_format/architecture="universal"');
    expect(cfg).toContain('texture_format/etc2_astc=true');
    expect(cfg).toContain('codesign/codesign=1');

    spawnSyncMock.mockImplementation((_cmd: string, _args: string[]) => {
      mkdirSync(join(dir, 'out'), { recursive: true });
      writeFileSync(outputZipPath, Buffer.from('PK-fake-zip'));
      return { status: 0, stdout: 'export ok', stderr: '', signal: null, error: undefined };
    });
    const result = exportGodotMacOSApp({
      projectPath: dir,
      godotExecutable: '/Applications/Godot.app/Contents/MacOS/Godot',
      outputZipPath,
    });
    expect(result.success).toBe(true);
    expect(spawnSyncMock.mock.calls.at(-1)?.[1]).toEqual([
      '--headless', '--path', dir, '--export-release', 'macOS', outputZipPath,
    ]);
  });
});
