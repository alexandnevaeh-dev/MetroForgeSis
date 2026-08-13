import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getProjectAllowPlaceholders, setProjectAllowPlaceholders } from './project-meta.js';

describe('setProjectAllowPlaceholders', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'metroforge-project-meta-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes allowPlaceholders onto project.json and is readable by get', () => {
    writeFileSync(
      join(dir, 'project.json'),
      JSON.stringify({ slug: 'demo', profile: 'TINY_TEST' }, null, 2),
      'utf-8',
    );

    const before = getProjectAllowPlaceholders(dir);
    expect(before.success).toBe(true);
    expect(before.allowPlaceholders).toBe(false);

    const set = setProjectAllowPlaceholders(dir, true);
    expect(set.success).toBe(true);
    expect(set.allowPlaceholders).toBe(true);

    const raw = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf-8')) as {
      allowPlaceholders?: boolean;
      slug?: string;
    };
    expect(raw.allowPlaceholders).toBe(true);
    expect(raw.slug).toBe('demo');

    expect(getProjectAllowPlaceholders(dir).allowPlaceholders).toBe(true);
    expect(setProjectAllowPlaceholders(dir, false).allowPlaceholders).toBe(false);
  });

  it('creates project.json when missing but project dir exists', () => {
    expect(existsSync(join(dir, 'project.json'))).toBe(false);
    const set = setProjectAllowPlaceholders(dir, true);
    expect(set.success).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf-8')).allowPlaceholders).toBe(true);
  });
});
