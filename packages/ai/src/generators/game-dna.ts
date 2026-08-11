import type { GameDNA } from '@metroforge/schemas';
import { GameDNASchema } from '@metroforge/schemas';
import { PRODUCT, PROFILE_DEFAULTS, type GenerationProfile } from '@metroforge/shared';
import type { TextGenerationProvider } from '../types.js';

export interface GameDNAInput {
  prompt: string;
  profile: GenerationProfile;
  seed: number;
}

export function createDeterministicGameDNA(input: GameDNAInput): GameDNA {
  const defaults = PROFILE_DEFAULTS[input.profile];
  const title = input.prompt.slice(0, 60).replace(/\.$/, '') || 'Untitled Metroidvania';

  return GameDNASchema.parse({
    version: PRODUCT.schemaVersion,
    identity: {
      title,
      tagline: input.prompt.slice(0, 120),
      genre: 'Metroidvania',
      subgenre: 'Action-Adventure',
      tone: 'dark',
      visualStyle: 'HD pixel art',
    },
    technical: {
      resolution: { width: 1920, height: 1080 },
      tileSize: 16,
      targetPlaytimeHours: input.profile === 'TINY_TEST' ? 0.5 : 4,
      difficulty: 'normal',
    },
    combat: {
      style: 'fast melee',
      meleeEnabled: true,
      rangedEnabled: false,
    },
    movement: {
      walkSpeed: 200,
      runSpeed: 350,
      jumpHeight: 120,
      gravity: 980,
    },
    abilities: Array.from({ length: defaults.abilities }, (_, i) => ({
      id: i === 0 ? 'dash' : `ability_${i}`,
      name: i === 0 ? 'Dash' : `Ability ${i + 1}`,
      category: 'movement',
      enabled: true,
    })),
    world: {
      biomeCount: defaults.biomes,
      roomCount: defaults.roomsMax,
    },
    narrative: {
      premise: input.prompt,
      protagonist: 'The Wanderer',
      centralConflict: 'Restore balance to a fractured world',
    },
    seed: input.seed,
    profile: input.profile,
  });
}

export async function generateGameDNA(
  input: GameDNAInput,
  provider: TextGenerationProvider | null,
): Promise<{ dna: GameDNA; source: 'ai' | 'deterministic' }> {
  if (!provider || provider.health === 'unavailable') {
    return { dna: createDeterministicGameDNA(input), source: 'deterministic' };
  }

  try {
    const defaults = PROFILE_DEFAULTS[input.profile];
    const response = await provider.generateText({
      systemPrompt: `You are a game designer. Output ONLY valid JSON matching this structure:
{
  "version": "0.1.0",
  "identity": { "title": string, "tagline": string, "genre": "Metroidvania", "tone": string, "visualStyle": string },
  "technical": { "resolution": { "width": 1920, "height": 1080 }, "tileSize": 16, "targetPlaytimeHours": number, "difficulty": "easy"|"normal"|"hard" },
  "combat": { "style": string, "meleeEnabled": boolean, "rangedEnabled": boolean },
  "movement": { "walkSpeed": 200, "runSpeed": 350, "jumpHeight": 120, "gravity": 980 },
  "abilities": [{ "id": string, "name": string, "category": string, "enabled": boolean }],
  "world": { "biomeCount": ${defaults.biomes}, "roomCount": ${defaults.roomsMax} },
  "narrative": { "premise": string, "protagonist": string, "centralConflict": string },
  "seed": ${input.seed},
  "profile": "${input.profile}"
}`,
      prompt: `Create Game DNA for: ${input.prompt}`,
      jsonMode: true,
      temperature: 0.7,
    });

    const parsed = JSON.parse(response.text);
    return { dna: GameDNASchema.parse(parsed), source: 'ai' };
  } catch {
    return { dna: createDeterministicGameDNA(input), source: 'deterministic' };
  }
}
