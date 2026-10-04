import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from '@metroforge/assets';
import { readBiomeBackground, saveBiomeBackground, undoBiomeBackground } from './biome-background.js';
const CONFIG = 'data/visual/biome-backgrounds.json';
function fixture() {
  mkdirSync('E:/MetroForgeData/Temp/biome-background-tests', { recursive: true });
  const project = mkdtempSync('E:/MetroForgeData/Temp/biome-background-tests/case-');
  const write = (path: string, value: string | Buffer) => { mkdirSync(join(project, path, '..'), { recursive: true }); writeFileSync(join(project, path), value); };
  const rgba = new Uint8Array(16 * 8 * 4); for (let i = 0; i < rgba.length; i += 4) rgba.set([120, 180, 90 + i / 4 % 100, 255], i);
  write('game_dna.json', JSON.stringify({ archetype: 'SIDE_VIEW_METROIDVANIA' }));
  write('scripts/world/StormglassDecor.gd', 'extends Node2D\nconst CASTLE_INTERIOR_PANORAMA = \"old\"\nfunc _spawn_authored_panorama() -> void:\n\tpass\n\nfunc _spawn_condition_decals() -> void:\n\tvar holder = Node2D.new()\n\tholder.set_meta(\"castle_base\", CASTLE_INTERIOR_PANORAMA)\n\nfunc custom_decoration() -> void:\n\tpass\n');
  write('project.godot', '[application]\nconfig/name="Stormglass Reliquary - Fixture"');
  write('data/rooms/rooms.json', JSON.stringify({ rooms: { a: { biomeId: 'biome_0' }, b: { biomeId: 'biome_0' } } }));
  write('assets/generated/castle.png', encodePng(16, 8, rgba));
  write('generation_manifest.json', JSON.stringify({ artifacts: [{ id: 'castle', path: 'assets/generated/castle.png', imagePlan: { profile: 'BACKGROUND' } }, { id: 'hero', path: 'assets/characters/hero.png', imagePlan: { profile: 'CHARACTER' } }] }));
  write('validation_report.json', '{"passed":true,"productionReady":true}');
  return { project, write, read: (path: string) => readFileSync(join(project, path), 'utf8') };
}
const choice = { assetId: 'castle', opacity: 0.85, anchorY: 1 };
describe('castle biome background editing', () => {
  it('lists only this project’s registered backgrounds and counts all affected rooms', () => {
    const f = fixture(); expect(readBiomeBackground(f.project, 'biome_0')).toMatchObject({ supported: true, roomCount: 2, settings: null, canUndo: false, options: [{ id: 'castle', width: 16, height: 8 }] });
  });
  it('saves one biome choice, preserves images/registry and invalidates runtime acceptance', () => {
    const f = fixture(); const image = readFileSync(join(f.project, 'assets/generated/castle.png')); const registry = f.read('generation_manifest.json');
    const state = saveBiomeBackground(f.project, 'biome_0', choice, readBiomeBackground(f.project, 'biome_0').revision);
    expect(state).toMatchObject({ canUndo: true, settings: { ...choice, path: 'assets/generated/castle.png' } });
    expect(f.read('generation_manifest.json')).toBe(registry); expect(readFileSync(join(f.project, 'assets/generated/castle.png'))).toEqual(image);
    expect(JSON.parse(f.read('validation_report.json'))).toMatchObject({ passed: false, productionReady: false });
  });
  it('upgrades legacy panorama logic while preserving custom decorations, and undo restores exact runtime bytes', () => {
    const f = fixture(); const before = f.read('scripts/world/StormglassDecor.gd');
    const state = saveBiomeBackground(f.project, 'biome_0', choice, readBiomeBackground(f.project, 'biome_0').revision);
    const updated = f.read('scripts/world/StormglassDecor.gd');
    expect(updated).toContain('res://data/visual/biome-backgrounds.json'); expect(updated).toContain('func custom_decoration() -> void:');
    undoBiomeBackground(f.project, 'biome_0', state.revision); expect(f.read('scripts/world/StormglassDecor.gd')).toBe(before);
  });
  it('undo restores the default background and retains the edit audit', () => {
    const f = fixture(); const state = saveBiomeBackground(f.project, 'biome_0', choice, readBiomeBackground(f.project, 'biome_0').revision);
    const restored = undoBiomeBackground(f.project, 'biome_0', state.revision);
    expect(restored).toMatchObject({ settings: null, canUndo: false }); expect(JSON.parse(f.read(CONFIG)).biomes).toEqual({});
    expect(JSON.parse(f.read('.metroforge/biome-background-history.json')).events.map((row: {action:string})=>row.action)).toEqual(['save','undo']);
  });
  it('undo of a second edit restores the exact prior settings', () => {
    const f = fixture(); let state = saveBiomeBackground(f.project, 'biome_0', choice, readBiomeBackground(f.project, 'biome_0').revision); const bytes = f.read(CONFIG);
    state = saveBiomeBackground(f.project, 'biome_0', { ...choice, opacity: 0.6 }, state.revision);
    expect(undoBiomeBackground(f.project, 'biome_0', state.revision).settings?.opacity).toBe(0.85); expect(f.read(CONFIG)).toBe(bytes);
  });
  it('rejects stale revisions after an image changes', () => {
    const f = fixture(); const revision = readBiomeBackground(f.project, 'biome_0').revision;
    const image = readFileSync(join(f.project, 'assets/generated/castle.png')); f.write('assets/generated/castle.png', Buffer.concat([image, Buffer.from('new provenance')]));
    expect(()=>saveBiomeBackground(f.project, 'biome_0', choice, revision)).toThrow('changed');
  });
  it('refuses other project assets and character sprites', () => {
    const f = fixture(); const state = readBiomeBackground(f.project, 'biome_0');
    for (const id of ['other-project-castle','hero']) expect(()=>saveBiomeBackground(f.project,'biome_0',{...choice,assetId:id},state.revision)).toThrow('registered background');
  });
  it('keeps the top-down set separate', () => {
    const f = fixture(); f.write('game_dna.json', '{"archetype":"TOP_DOWN_ACTION_ADVENTURE"}'); const state = readBiomeBackground(f.project,'biome_0'); expect(state.supported).toBe(false);
    expect(()=>saveBiomeBackground(f.project,'biome_0',choice,state.revision)).toThrow('Stormglass');
  });
  it('rejects invalid opacity and framing without changing the project', () => {
    const f = fixture(); const revision = readBiomeBackground(f.project,'biome_0').revision;
    for(const value of [{...choice,opacity:NaN},{...choice,opacity:0},{...choice,anchorY:2}]) expect(()=>saveBiomeBackground(f.project,'biome_0',value,revision)).toThrow('framing');
    expect(readBiomeBackground(f.project,'biome_0').revision).toBe(revision);
  });
  it('refuses unknown legacy renderer layouts without writing settings or validation', () => {
    const f = fixture(); f.write('scripts/world/StormglassDecor.gd', 'extends Node2D\nfunc bespoke_renderer() -> void:\n\tpass\n');
    const state = readBiomeBackground(f.project, 'biome_0'); const validation = f.read('validation_report.json');
    expect(() => saveBiomeBackground(f.project, 'biome_0', choice, state.revision)).toThrow('template refresh');
    expect(readBiomeBackground(f.project, 'biome_0').revision).toBe(state.revision); expect(f.read('validation_report.json')).toBe(validation);
  });
  it('protects a concurrently changed castle renderer from undo', () => {
    const f = fixture(); const state = saveBiomeBackground(f.project, 'biome_0', choice, readBiomeBackground(f.project, 'biome_0').revision);
    const changed = f.read('scripts/world/StormglassDecor.gd') + '\n# new authored detail\n'; f.write('scripts/world/StormglassDecor.gd', changed);
    expect(() => undoBiomeBackground(f.project, 'biome_0', state.revision)).toThrow('changed');
    expect(() => undoBiomeBackground(f.project, 'biome_0', readBiomeBackground(f.project, 'biome_0').revision)).toThrow('renderer changed'); expect(f.read('scripts/world/StormglassDecor.gd')).toBe(changed);
  });
  it('refuses incomplete renderer history records', () => {
    const f = fixture(); saveBiomeBackground(f.project, 'biome_0', choice, readBiomeBackground(f.project, 'biome_0').revision);
    const history = JSON.parse(f.read('.metroforge/biome-background-history.json')); delete history.undo[0].runtimeAfterHash;
    f.write('.metroforge/biome-background-history.json', JSON.stringify(history)); expect(() => readBiomeBackground(f.project, 'biome_0')).toThrow('history');
  });
  it('preserves corrupt history and refuses edits', () => {
    const f = fixture(); f.write('.metroforge/biome-background-history.json','{"version":1,"undo":"corrupt","events":[]}');
    expect(()=>readBiomeBackground(f.project,'biome_0')).toThrow('history'); expect(f.read('.metroforge/biome-background-history.json')).toContain('corrupt');
  });
});
