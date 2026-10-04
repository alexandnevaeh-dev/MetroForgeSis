import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { importGameSetAssets } from './game-set-import.js';
const roots: string[] = [], png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function fixture(paths = ['assets/enemies/sprite.png']) {
  const root = mkdtempSync(join(tmpdir(), 'metroforge-game-set-')); roots.push(root);
  for (const path of paths) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), png); }
  writeFileSync(join(root, 'game_dna.json'), JSON.stringify({ archetype: 'SIDE_VIEW_METROIDVANIA' }));
  writeFileSync(join(root, 'generation_manifest.json'), JSON.stringify({ artifacts: [{ id: 'kept', path: 'assets/original.png', license: 'keep', custom: true }], custom: 'preserve' }));
  writeFileSync(join(root, 'GAME_SET.json'), JSON.stringify({ archetype: 'SIDE_VIEW_METROIDVANIA', assets: paths.map(path => ({ path, sha256: sha(png) })) })); return root;
}
afterEach(() => { for (const root of roots.splice(0)) { expect(resolve(root).startsWith(resolve(tmpdir()) + sep)).toBe(true); rmSync(root, { force: true, recursive: true }); } });
describe('game-set PNG registry import', () => {
  it('registers inventoried PNGs, preserves source bytes and registry fields, and retains a preimage', () => {
    const root = fixture(), before = readFileSync(join(root, 'generation_manifest.json'));
    const result = importGameSetAssets(root); expect(result.added).toBe(1);
    const manifest = JSON.parse(readFileSync(join(root, 'generation_manifest.json'), 'utf8'));
    expect(manifest.custom).toBe('preserve'); expect(manifest.artifacts[0].license).toBe('keep');
    expect(manifest.artifacts[1]).toMatchObject({ id: 'sprite', path: 'assets/enemies/sprite.png', productionReady: false, maturity: 'QA_REVIEW', commercialUse: 'unknown' });
    expect(manifest.artifacts[1].provider).toBeUndefined(); expect(readFileSync(join(root, 'assets/enemies/sprite.png'))).toEqual(png);
    const command = readdirSync(join(root, '.metroforge/game-set-import'))[0]!;
    expect(readFileSync(join(root, '.metroforge/game-set-import', command, 'manifest.before.json'))).toEqual(before);
  });
  it('is byte-preserving and idempotent when imported again', () => {
    const root = fixture(); importGameSetAssets(root); const before = readFileSync(join(root, 'generation_manifest.json'));
    expect(importGameSetAssets(root)).toMatchObject({ added: 0, skipped: 1 }); expect(readFileSync(join(root, 'generation_manifest.json'))).toEqual(before);
  });
  it('keeps conflicting filenames as distinct stable asset identities', () => {
    const root = fixture(['assets/enemies/sprite.png', 'assets/props/sprite.png']); importGameSetAssets(root);
    const assets = JSON.parse(readFileSync(join(root, 'generation_manifest.json'), 'utf8')).artifacts;
    expect(new Set(assets.map((row: { id: string }) => row.id)).size).toBe(3);
  });
  it('refuses changed artwork without writing any registry or backup', () => {
    const root = fixture(), before = readFileSync(join(root, 'generation_manifest.json')); writeFileSync(join(root, 'assets/enemies/sprite.png'), 'changed');
    expect(() => importGameSetAssets(root)).toThrow('changed'); expect(readFileSync(join(root, 'generation_manifest.json'))).toEqual(before); expect(existsSync(join(root, '.metroforge'))).toBe(false);
  });
  it('refuses traversal, mismatched genres, duplicate paths and corrupt registries', () => {
    const root = fixture(); const set = JSON.parse(readFileSync(join(root, 'GAME_SET.json'), 'utf8'));
    for (const value of [{ ...set, archetype: 'TOP_DOWN_ACTION_ADVENTURE' }, { ...set, assets: [{ path: 'assets/../secret.png', sha256: sha(png) }] }, { ...set, assets: [...set.assets, ...set.assets] }]) {
      writeFileSync(join(root, 'GAME_SET.json'), JSON.stringify(value)); expect(() => importGameSetAssets(root)).toThrow();
    }
    writeFileSync(join(root, 'GAME_SET.json'), JSON.stringify(set)); writeFileSync(join(root, 'generation_manifest.json'), 'invalid'); expect(() => importGameSetAssets(root)).toThrow(); expect(existsSync(join(root, '.metroforge'))).toBe(false);
  });
  it('does not import sidecars or pretend a non-PNG inventory entry is artwork', () => {
    const root = fixture(); const set = JSON.parse(readFileSync(join(root, 'GAME_SET.json'), 'utf8'));
    set.assets.push({ path: 'assets/enemies/sprite_animations.json', sha256: 'not an image' }); writeFileSync(join(root, 'GAME_SET.json'), JSON.stringify(set)); expect(importGameSetAssets(root).added).toBe(1);
  });
  it('reports diagnostic QA sheets separately without admitting them as game artwork', () => {
    const root = fixture(); const set = JSON.parse(readFileSync(join(root, 'GAME_SET.json'), 'utf8'));
    set.assets.push({ path: 'assets/qa/retired-sheet.png', sha256: sha(png) }); writeFileSync(join(root, 'GAME_SET.json'), JSON.stringify(set));
    expect(importGameSetAssets(root)).toMatchObject({ added: 1, excludedQa: 1 });
    expect(importGameSetAssets(root)).toMatchObject({ added: 0, skipped: 1, excludedQa: 1 });
  });
});
