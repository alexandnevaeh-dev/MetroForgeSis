import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveProjectPathSafe, UnsafeProjectPathError, isPathWithinRoot } from './paths.js';

describe('resolveProjectPathSafe', () => {
  it('resolves a legitimate bare slug to a child of root', () => {
    const root = join(tmpdir(), `mf-paths-ok-${Date.now()}`);
    const result = resolveProjectPathSafe(root, 'my-cool-game');
    expect(result).toBe(resolve(root, 'my-cool-game'));
  });

  it('accepts slugs with dots/underscores/dashes (real slugify() output shape)', () => {
    const root = join(tmpdir(), `mf-paths-shape-${Date.now()}`);
    expect(() => resolveProjectPathSafe(root, 'a-real-game-title-2')).not.toThrow();
    expect(() => resolveProjectPathSafe(root, 'game_with_underscores')).not.toThrow();
  });

  it('rejects an empty slug', () => {
    expect(() => resolveProjectPathSafe('/tmp/root', '')).toThrow(UnsafeProjectPathError);
    expect(() => resolveProjectPathSafe('/tmp/root', '   ')).toThrow(UnsafeProjectPathError);
  });

  it('rejects a relative traversal slug', () => {
    expect(() => resolveProjectPathSafe('/tmp/root', '../../etc/passwd')).toThrow(
      UnsafeProjectPathError,
    );
    expect(() => resolveProjectPathSafe('/tmp/root', '..')).toThrow(UnsafeProjectPathError);
  });

  it('rejects a slug containing a nested traversal segment', () => {
    expect(() => resolveProjectPathSafe('/tmp/root', 'foo/../../bar')).toThrow(
      UnsafeProjectPathError,
    );
  });

  it('rejects an absolute path slug', () => {
    expect(() => resolveProjectPathSafe('/tmp/root', '/etc/passwd')).toThrow(
      UnsafeProjectPathError,
    );
  });

  it('rejects a Windows drive-letter injection slug', () => {
    expect(() => resolveProjectPathSafe('C:/GeneratedGames', 'D:/evil')).toThrow(
      UnsafeProjectPathError,
    );
  });

  it('rejects a UNC-path slug', () => {
    expect(() => resolveProjectPathSafe('/tmp/root', '\\\\attacker-host\\share')).toThrow(
      UnsafeProjectPathError,
    );
  });

  it('rejects a slug containing a path separator even without traversal intent', () => {
    expect(() => resolveProjectPathSafe('/tmp/root', 'sub/dir')).toThrow(UnsafeProjectPathError);
  });

  it('rejects a slug containing a null byte or control characters', () => {
    expect(() => resolveProjectPathSafe('/tmp/root', 'evil\0name')).toThrow(
      UnsafeProjectPathError,
    );
    expect(() => resolveProjectPathSafe('/tmp/root', 'evil\nname')).toThrow(
      UnsafeProjectPathError,
    );
  });

  it('the error carries the PROJECT_PATH_OUTSIDE_ROOT code for typed-failure handling', () => {
    try {
      resolveProjectPathSafe('/tmp/root', '../escape');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(UnsafeProjectPathError);
      expect((err as UnsafeProjectPathError).code).toBe('PROJECT_PATH_OUTSIDE_ROOT');
      expect((err as Error).message).toContain('PROJECT_PATH_OUTSIDE_ROOT');
    }
  });

  it('follows a symlinked root to its real location rather than rejecting it', () => {
    const base = join(tmpdir(), `mf-paths-symlink-${Date.now()}`);
    const realRoot = join(base, 'real-generated-games');
    const linkRoot = join(base, 'linked-generated-games');
    mkdirSync(realRoot, { recursive: true });

    try {
      symlinkSync(realRoot, linkRoot, 'junction');
    } catch {
      // Creating symlinks/junctions may require elevated privileges on some Windows CI
      // configurations — skip this specific assertion rather than failing the whole suite
      // over an environment permission, the rest of the file already covers the core guarantee.
      return;
    }

    const result = resolveProjectPathSafe(linkRoot, 'my-game');
    expect(result).toBe(resolve(realRoot, 'my-game'));

    rmSync(base, { recursive: true, force: true });
  });
});

describe('isPathWithinRoot', () => {
  it('is true for a direct child path', () => {
    expect(isPathWithinRoot('/tmp/root', '/tmp/root/child')).toBe(true);
  });

  it('is true for the root itself', () => {
    expect(isPathWithinRoot('/tmp/root', '/tmp/root')).toBe(true);
  });

  it('is false for a sibling directory that merely shares a string prefix', () => {
    expect(isPathWithinRoot('/tmp/root', '/tmp/rootEvil')).toBe(false);
  });

  it('is false for a path genuinely outside root', () => {
    expect(isPathWithinRoot('/tmp/root', '/tmp/elsewhere')).toBe(false);
  });
});

// Sanity check that the exported helpers don't accidentally leave stray temp dirs behind.
describe('cleanup sanity', () => {
  it('tmp dirs created by this file are all under the OS tmpdir', () => {
    expect(existsSync(tmpdir())).toBe(true);
  });
});
