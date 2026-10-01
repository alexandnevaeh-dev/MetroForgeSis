import type { GameDNA, GameArchetype } from '@metroforge/schemas';
import { GameDNASchema } from '@metroforge/schemas';
import {
  PRODUCT,
  PROFILE_DEFAULTS,
  pickRegisteredAbilities,
  pickTopDownDungeonItems,
  inferGameArchetypeFromPrompt,
  genreSupports,
  genreUsesDungeonTools,
  getGenreDefinition,
  resolveGameArchetype,
  TOP_DOWN_PROFILE_DEFAULTS,
  DEFAULT_TOP_DOWN_MOVEMENT,
  type GenerationProfile,
} from '@metroforge/shared';
import type { ProviderHealth, TextGenerationRequest } from '../types.js';
import { buildGenreDesignBrief } from './genre-design-brief.js';

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

/** Recognize explicit rendering-medium phrases only; generic fantasy/painted objects do not
 * change legacy defaults. A conflicting explicit pixel-art request keeps pixel mode.
 */
function fallbackVisualStyle(prompt: string): string {
  const positive = prompt.replace(/\b(?:no|not|without)\s+(?:hand[ -]?painted|painterly|pixel\s+art)\b/gi, '');
  if (/\bpixel\s+art\b/i.test(positive)) return 'HD pixel art';
  if (/\b(?:hand[ -]?painted|painterly)\b/i.test(positive)) return 'hand-painted 2D illustration';
  return 'HD pixel art';
}

export function createDeterministicGameDNA(input: GameDNAInput): GameDNA {
  const defaults = PROFILE_DEFAULTS[input.profile];
  const archetype = resolveGameArchetype(input.archetype ?? inferGameArchetypeFromPrompt(input.prompt));
  const genre = getGenreDefinition(archetype);
  const topDown = genre.perspective === 'TOP_DOWN';
  const title = input.prompt.slice(0, 60).replace(/\.$/, '') || genre.displayName;
  const td = TOP_DOWN_PROFILE_DEFAULTS[input.profile];

  return GameDNASchema.parse({
    version: PRODUCT.schemaVersion,
    identity: {
      title,
      tagline: input.prompt.slice(0, 120),
      genre: genre.displayName.includes('Metroidvania') ? 'Metroidvania' : 'Action-Adventure',
      subgenre: 'Action-Adventure',
      tone: 'dark',
      visualStyle: fallbackVisualStyle(input.prompt),
    },
    technical: {
      resolution: { width: 1920, height: 1080 },
      tileSize: input.profile === 'VISUAL_VERTICAL_SLICE' ? 32 : 16,
      targetPlaytimeHours:
        input.profile === 'TINY_TEST' || input.profile === 'VISUAL_VERTICAL_SLICE'
          ? 0.5
          : input.profile === 'RELEASE_CANDIDATE'
            ? 3
            : 4,
      difficulty: 'normal',
    },
    combat: {
      style: genreSupports(archetype, 'supportsDirectionalCombat') ? 'directional melee' : 'fast melee',
      meleeEnabled: true,
      rangedEnabled: genreSupports(archetype, 'supportsDirectionalCombat'),
    },
    movement: genreSupports(archetype, 'supportsFreePlanarMovement')
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
    abilities: genreUsesDungeonTools(archetype)
      ? pickTopDownDungeonItems(input.profile)
      : pickRegisteredAbilities(input.profile),
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
  "technical": { "resolution": { "width": 1920, "height": 1080 }, "tileSize": ${input.profile === 'VISUAL_VERTICAL_SLICE' ? 32 : 16}, "targetPlaytimeHours": number, "difficulty": "easy"|"normal"|"hard" },
  "combat": { "style": string, "meleeEnabled": boolean, "rangedEnabled": boolean },
  "movement": { "walkSpeed": 200, "runSpeed": 350, "jumpHeight": 120, "gravity": 980, "grappleSpeed": 620, "swimSpeed": 180, "phaseDuration": 0.22 },
  "abilities": [{ "id": string, "name": string, "category": string, "enabled": boolean }],
  "world": { "biomeCount": ${defaults.biomes}, "roomCount": ${defaults.roomsMax} },
  "narrative": { "premise": string, "protagonist": string, "centralConflict": string },
  "seed": ${input.seed},
  "profile": "${input.profile}"
}`,
      prompt: `Create Game DNA for: ${input.prompt}\n\n${buildGenreDesignBrief(resolveGameArchetype(input.archetype ?? inferGameArchetypeFromPrompt(input.prompt)))}`,
      jsonMode: true,
      temperature: 0.7,
    });

    const parsed = JSON.parse(response.text);
    const dna = GameDNASchema.parse(parsed);
    if (input.archetype) dna.archetype = input.archetype;
    dna.abilities = genreUsesDungeonTools(dna.archetype)
      ? pickTopDownDungeonItems(input.profile)
      : pickRegisteredAbilities(input.profile);
    return { dna, source: 'ai' };
  } catch {
    return { dna: createDeterministicGameDNA(input), source: 'deterministic' };
  }
}
