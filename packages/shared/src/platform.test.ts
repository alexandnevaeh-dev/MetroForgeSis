import { describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  classifyRuntimePlatform,
  getPlatformInfo,
  isolatedUserDataEnvironment,
  probeWorkspaceWritable,
} from './platform.js';

describe('platform abstraction', () => {
  it.each([
    ['darwin', 'arm64', 'darwin-arm64'],
    ['darwin', 'x64', 'darwin-x64'],
    ['win32', 'x64', 'win32-x64'],
    ['win32', 'arm64', 'win32-arm64'],
    ['linux', 'x64', 'linux-x64'],
    ['linux', 'arm64', 'linux-arm64'],
  ] as const)('classifies %s-%s', (os, architecture, expected) => {
    expect(classifyRuntimePlatform(os, architecture)).toBe(expected);
  });

  it('reports native Apple Silicon capabilities without pretending Metal is CUDA', () => {
    const info = getPlatformInfo('darwin', 'arm64', false);
    expect(info.runtime).toBe('darwin-arm64');
    expect(info.capabilities).toMatchObject({
      metal: true,
      directMl: false,
      nativeArm64: true,
      godotRenderingDriver: 'metal',
    });
  });

  it('reports a writable workspace using a real create/write/delete probe', () => {
    const root = join(tmpdir(), `mf-writable-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    const result = probeWorkspaceWritable(root);
    expect(result.writable).toBe(true);
    expect(result.message).toContain('writable');
    expect(() => rmSync(root, { recursive: true, force: true })).not.toThrow();
  });

  it('reports an actionable failure for a missing workspace', () => {
    const result = probeWorkspaceWritable(join(tmpdir(), `mf-missing-${Date.now()}`, 'child'));
    expect(result.writable).toBe(false);
    expect(result.message).toContain('not writable');
  });

  it('isolates child user data with platform-native environment variables', () => {
    const root = join(tmpdir(), `mf-user-data-${Date.now()}`);
    expect(isolatedUserDataEnvironment(root, 'win32')).toEqual({ APPDATA: root, LOCALAPPDATA: root });
    expect(isolatedUserDataEnvironment(root, 'darwin')).toEqual({ HOME: root });
    rmSync(root, { recursive: true, force: true });
  });
});
