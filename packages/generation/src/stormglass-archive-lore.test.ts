import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GameDNASchema } from '@metroforge/schemas';
import { generateGameContent } from '@metroforge/procedural';
import { bindStormglassArchiveLore } from './stormglass-archive-lore.js';

function fixture() {
  const input = JSON.parse(readFileSync(new URL('../../assets/src/fixtures/canopy-game-dna.json', import.meta.url), 'utf8'));
  input.archetype = 'SIDE_VIEW_METROIDVANIA'; input.identity.title = 'Stormglass Reliquary';
  const dna = GameDNASchema.parse(input);
  return { dna, content: generateGameContent(dna, 'SMALL', 42, 'room_039', ['room_000', 'room_039']) };
}
describe('original archive collectible records', () => {
  it('enriches two existing records without changing mechanics, IDs, counts, other content or the input', () => {
    const { dna, content } = fixture(), before = structuredClone(content);
    const next = bindStormglassArchiveLore(content, dna, 'stormglass-archive-wing');
    expect(content).toEqual(before); expect(next.items.map(i => i.id)).toEqual(before.items.map(i => i.id));
    expect(next.items.find(i => i.id === 'lost_echo_001')).toMatchObject({ name: "Scribe's Margin", description: expect.stringContaining('reading loft') });
    expect(next.items.find(i => i.id === 'lost_echo_002')).toMatchObject({ name: 'Vault Evacuation Ledger', description: expect.stringContaining('lower shelter') });
    for (const item of next.items) {
      const old = before.items.find(i => i.id === item.id)!;
      expect({ ...item, name: old.name, description: old.description }).toEqual(old);
    }
    expect({ ...next, items: before.items }).toEqual(before);
  });
  it.each(['stormglass-gallery', 'stormglass-expanded-region', undefined])('preserves other layout %s', layout => {
    const { dna, content } = fixture(); expect(bindStormglassArchiveLore(content, dna, layout)).toBe(content);
  });
  it.each(['TOP_DOWN_ACTION_ADVENTURE', 'QUANTUM_SIMULATION_ROGUELITE'] as const)('preserves %s content', archetype => {
    const { dna, content } = fixture(); expect(bindStormglassArchiveLore(content, { ...dna, archetype }, 'stormglass-archive-wing')).toBe(content);
  });
});
