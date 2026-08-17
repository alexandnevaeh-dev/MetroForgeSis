import type { BiomeVisualDNA, StorytellingDirective, VisualDNA } from '@metroforge/schemas';
import { SeededRNG } from '../rng.js';

const BEATS: Array<{ title: string; description: string; props: string[]; archetypes: string[] }> = [
  {
    title: 'Abandoned camp',
    description: 'A cold camp beside a collapsed gate, bedroll still unrolled.',
    props: ['camp', 'debris', 'lantern'],
    archetypes: ['npc', 'save', 'traversal', 'tutorial'],
  },
  {
    title: 'Broken cart',
    description: 'A wrecked cart jammed against a sealed door.',
    props: ['broken cart', 'debris', 'signage'],
    archetypes: ['traversal', 'challenge', 'combat'],
  },
  {
    title: 'Enemy remains',
    description: 'Scattered remains near a hazard, warning of what hunts here.',
    props: ['debris', 'hazard marker', 'bones'],
    archetypes: ['combat', 'arena', 'secret'],
  },
  {
    title: 'Religious shrine',
    description: 'A shrine still lit, offerings left for someone who never returned.',
    props: ['shrine', 'lantern', 'lectern'],
    archetypes: ['npc', 'ability_shrine', 'save', 'secret'],
  },
  {
    title: 'Excavation machinery',
    description: 'Abandoned tools and a half-dug wall.',
    props: ['workbench', 'debris', 'lamp'],
    archetypes: ['challenge', 'treasure', 'traversal'],
  },
  {
    title: 'Overgrown statue',
    description: 'A forgotten statue swallowed by vegetation.',
    props: ['fallen statue', 'vegetation', 'shrine'],
    archetypes: ['secret', 'treasure', 'npc'],
  },
  {
    title: 'Flooded library',
    description: 'Sodden shelves and a lectern still holding a ruined page.',
    props: ['lectern', 'debris', 'lantern'],
    archetypes: ['npc', 'lore', 'secret'],
  },
  {
    title: 'Ritual chamber',
    description: 'A marked floor and guttering lights before a sealed gate.',
    props: ['shrine', 'chain', 'lantern'],
    archetypes: ['boss', 'ability_gate', 'miniboss'],
  },
];

export function generateRoomStorytelling(input: {
  roomId: string;
  biome: BiomeVisualDNA;
  visualDNA: VisualDNA;
  archetype: string;
  seed: number;
  index: number;
  kitPropIds: string[];
}): StorytellingDirective {
  const rng = new SeededRNG((input.seed + input.index * 9973 + hash(input.roomId)) >>> 0 || 1);
  const matching = BEATS.filter((b) => b.archetypes.includes(input.archetype));
  const beat = (matching.length > 0 ? matching : BEATS)[rng.int(0, Math.max(0, (matching.length > 0 ? matching : BEATS).length - 1))]!;
  const propIds = beat.props
    .map((name) => input.kitPropIds.find((id) => id.toLowerCase().includes(name.split(' ')[0]!.toLowerCase())) ?? input.kitPropIds[rng.int(0, Math.max(0, input.kitPropIds.length - 1))])
    .filter((id): id is string => Boolean(id))
    .slice(0, 3);
  const uniqueProps = [...new Set(propIds)];
  return {
    id: `${input.roomId}_story`,
    roomId: input.roomId,
    biomeId: input.biome.biomeId,
    archetype: input.archetype,
    title: beat.title,
    description: `${beat.description} ${input.biome.atmosphere}.`,
    propIds: uniqueProps,
    placements: uniqueProps.map((propId, i) => ({
      propId,
      xNorm: 0.18 + i * 0.22 + rng.next() * 0.08,
      yNorm: 0.62 + (i % 2) * 0.06,
      scale: 1,
      zIndex: 3 + i,
    })),
  };
}

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
