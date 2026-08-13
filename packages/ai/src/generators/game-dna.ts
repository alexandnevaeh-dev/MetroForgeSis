import type { GameDNA, GameArchetype } from '@metroforge/schemas';
import { GameDNASchema } from '@metroforge/schemas';
import {
  PRODUCT,
  PROFILE_DEFAULTS,
  pickRegisteredAbilities,
  pickTopDownDungeonItems,
  inferGameArchetypeFromPrompt,
  isTopDownArchetype,
  resolveGameArchetype,
  TOP_DOWN_PROFILE_DEFAULTS,
  DEFAULT_TOP_DOWN_MOVEMENT,
  type GenerationProfile,
} from '@metroforge/shared';
import type { ProviderHealth, TextGenerationRequest } from '../types.js';

/**
 * The minimal shape generateGameDNA actually needs — deliberately narrower than the full
 * `TextGenerationProvider` interface so callers can pass a lightweight adapter (e.g. one
 * backed by `GenerationRouter.generate()`) without implementing the entire provider
 * interface just to satisfy the type. Any real `TextGenerationProvider` already structurally
 * satisfies this, so existing direct-provider callers need no changes.
 */
export interface GameDNATextSource {
  health: ProviderHealth;
  generateText(request: TextGenerationRequest): Promise<{ text: string }>;
}

export interface GameDNAInput {
  prompt: string;
  profile: GenerationProfile;
  seed: number;
  archetype?: GameArchetype;
}

export function createDeterministicGameDNA(input: GameDNAInput): GameDNA {
  const defaults = PROFILE_DEFAULTS[input.profile];
  const archetype = resolveGameArchetype(input.archetype ?? inferGameArchetypeFromPrompt(input.prompt));
  const topDown = isTopDownArchetype(archetype);
  const title = input.prompt.slice(0, 60).replace(/\.$/, '') || (topDown ? 'Untitled Adventure' : 'Untitled Metroidvania');
  const td = TOP_DOWN_PROFILE_DEFAULTS[input.profile];

  return GameDNASchema.parse({
    version: PRODUCT.schemaVersion,
    identity: {
      title,
      tagline: input.prompt.slice(0, 120),
      genre: topDown ? 'Action-Adventure' : 'Metroidvania',
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
      style: topDown ? 'directional melee' : 'fast melee',
      meleeEnabled: true,
      rangedEnabled: topDown,
    },
    movement: topDown
      ? {
          walkSpeed: DEFAULT_TOP_DOWN_MOVEMENT.walkSpeed,
          runSpeed: DEFAULT_TOP_DOWN_MOVEMENT.runSpeed,
          jumpHeight: 0,
          gravity: 0,
          acceleration: DEFAULT_TOP_DOWN_MOVEMENT.acceleration,
          deceleration: DEFAULT_TOP_DOWN_MOVEMENT.deceleration,
          knockbackDecay: DEFAULT_TOP_DOWN_MOVEMENT.knockbackDecay,
        }
      : {
          walkSpeed: 200,
          runSpeed: 350,
          jumpHeight: 120,
          gravity: 980,
        },
    abilities: topDown ? pickTopDownDungeonItems(input.profile) : pickRegisteredAbilities(input.profile),
    world: {
      biomeCount: topDown ? td.regions : defaults.biomes,
      roomCount: topDown ? td.dungeonCount * 4 + 1 : defaults.roomsMax,
      regionCount: topDown ? td.regions : undefined,
    },
    narrative: {
      premise: input.prompt,
      protagonist: topDown ? 'The Relic Hunter' : 'The Wanderer',
      centralConflict: topDown
        ? 'Recover the scattered relics and restore the buried kingdom'
        : 'Restore balance to a fractured world',
    },
    seed: input.seed,
    profile: input.profile,
    archetype,
    topDown: topDown
      ? {
          movementDirections: 8,
          worldStyle: 'continuous',
          dungeonCount: td.dungeonCount,
          townCount: td.townCount,
          worldVariantEnabled: false,
          dungeonItemProgression: true,
        }
      : undefined,
  });
}

export async function generateGameDNA(
  input: GameDNAInput,
  provider: GameDNATextSource | null,
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
  "movement": { "walkSpeed": 200, "runSpeed": 350, "jumpHeight": 120, "gravity": 980, "grappleSpeed": 620, "swimSpeed": 180, "phaseDuration": 0.22 },
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
    const dna = GameDNASchema.parse(parsed);
    if (input.archetype) dna.archetype = input.archetype;
    dna.abilities = isTopDownArchetype(dna.archetype)
      ? pickTopDownDungeonItems(input.profile)
      : pickRegisteredAbilities(input.profile);
    return { dna, source: 'ai' };
  } catch {
    return { dna: createDeterministicGameDNA(input), source: 'deterministic' };
  }
}
