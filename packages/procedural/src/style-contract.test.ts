import { describe, it, expect } from 'vitest';
import { generateStyleBible, generateArtBible, buildVisualStyleContract, applyVisualStyleContract } from '../src/index.js';
import type { GameDNA } from '@metroforge/schemas';

const dna: GameDNA = {
  version: '0.1.0',
  archetype: 'SIDE_VIEW_METROIDVANIA',
  identity: { title: 'Contract Game', genre: 'Metroidvania', tone: 'grim', visualStyle: 'moonlit pixel art' },
  technical: { resolution: { width: 1280, height: 720 }, tileSize: 16, targetPlaytimeHours: 2, difficulty: 'normal' },
  combat: { style: 'melee', meleeEnabled: true, rangedEnabled: false },
  movement: { walkSpeed: 200, runSpeed: 350, jumpHeight: 120, gravity: 980 },
  abilities: [{ id: 'dash', name: 'Dash', category: 'movement', enabled: true }],
  world: { biomeCount: 1, roomCount: 8 },
  narrative: { premise: 'x', protagonist: 'warden', centralConflict: 'y' },
  audio: { musicStyle: 'industrial ambient' },
  seed: 9,
  profile: 'TINY_TEST',
};

describe('visual style contract', () => {
  it('derives a machine-readable contract from the StyleBible', () => {
    const art = generateArtBible(dna, 9);
    const bible = generateStyleBible(dna, art);
    const contract = buildVisualStyleContract(bible);
    expect(contract.artStyle).toContain('pixel');
    expect(contract.palette.length).toBeGreaterThan(0);
    expect(contract.promptFragment).toContain(contract.outlineRules.split(',')[0] ?? '');
    expect(contract.negativeFragment).toContain('UI');
    expect(contract.negativeFragment).toContain('pine trees');
    expect(contract.negativeFragment).toContain('outdoor landscape');
    expect(applyVisualStyleContract('player sprite', bible)).toContain(contract.promptFragment.split(',')[0]!);
    expect(applyVisualStyleContract('player sprite', bible)).toContain('player sprite');
  });
});
