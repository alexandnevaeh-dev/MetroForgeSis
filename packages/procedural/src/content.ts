import type { GameDNA, Enemy, Boss, Quest, Item, NPC, Dialogue, Shop, LootTable } from '@metroforge/schemas';
import {
  validateLootCatalog,
  EnemySchema,
  BossSchema,
  QuestSchema,
  ItemSchema,
  NPCSchema,
  DialogueSchema,
  ShopSchema,
} from '@metroforge/schemas';
import { PROFILE_DEFAULTS, genreUsesDungeonTools, pickTopDownDungeonItems, type GenerationProfile } from '@metroforge/shared';
import { SeededRNG } from './rng.js';
import { interiorRoomId, npcRoomIndex } from './room-archetypes.js';

export interface GameContent {
  enemies: Enemy[];
  bosses: Boss[];
  quests: Quest[];
  items: Item[];
  npcs: NPC[];
  dialogues: Dialogue[];
  shops: Shop[];
  lootTables?: LootTable[];
}

const ENEMY_NAMES = ['Scrap Drone', 'Rust Crawler', 'Arc Wisp', 'Gear Mite', 'Void Sentinel'];
const BOSS_NAMES = ['Guardian Core', 'Forge Titan', 'Echo Warden', 'Machine Sovereign'];
export const ENEMY_COMBAT_TYPES = [
  'melee',
  'projectile',
  'burst',
  'beam',
  'area',
  'summon',
  'trap',
] as const;
const ENEMY_EXTRA_COMBAT_TYPES = ['burst', 'beam', 'area', 'summon', 'trap'] as const;
const ENEMY_GROUND_MOVEMENT = ['patrol', 'hop', 'crawl'] as const;
const ENEMY_EXTRA_MOVEMENT = ['fly', 'hover', 'charge', 'teleport', 'burrow'] as const;

/** First two enemies are always melee + projectile so TINY_TEST (2 enemies) keeps the core loop.
 *  Remaining slots rotate through burst/beam/area/summon/trap so SMALL+ actually produce them. */
export function enemyCombatTypeForIndex(index: number): (typeof ENEMY_COMBAT_TYPES)[number] {
  if (index <= 0) return 'melee';
  if (index === 1) return 'projectile';
  return ENEMY_EXTRA_COMBAT_TYPES[(index - 2) % ENEMY_EXTRA_COMBAT_TYPES.length]!;
}

/** Trap combat stays stationary. TINY_TEST gets patrol then hop. SMALL+ also get crawl, then
 *  rotate fly/hover/charge/teleport/burrow on non-trap slots so every schema value appears. */
export function enemyMovementForIndex(
  index: number,
  combatType: (typeof ENEMY_COMBAT_TYPES)[number],
): (typeof ENEMY_GROUND_MOVEMENT)[number] | (typeof ENEMY_EXTRA_MOVEMENT)[number] | 'stationary' {
  if (combatType === 'trap') return 'stationary';
  if (index < ENEMY_GROUND_MOVEMENT.length) return ENEMY_GROUND_MOVEMENT[index]!;
  let extraSlot = 0;
  for (let j = ENEMY_GROUND_MOVEMENT.length; j < index; j++) {
    if (enemyCombatTypeForIndex(j) !== 'trap') extraSlot += 1;
  }
  return ENEMY_EXTRA_MOVEMENT[extraSlot % ENEMY_EXTRA_MOVEMENT.length]!;
}

export function buildBossVisualPrompt(
  name: string,
  lore: string,
  gameDna: GameDNA,
  opts: { isFinal: boolean; attacks: string[] },
): string {
  const role = opts.isFinal ? 'final boss creature' : 'mini boss guardian';
  const attackHint =
    opts.attacks.length > 0 ? `, attacks: ${opts.attacks.join(', ')}` : '';
  return [
    gameDna.identity.visualStyle,
    'pixel art game sprite',
    role,
    `"${name}"`,
    lore,
    `for ${gameDna.identity.title}`,
    `${gameDna.identity.tone} tone${attackHint}`,
  ].join(', ');
}

const COLLECTIBLE_NAMES = [
  'Lost Echo',
  'Silent Keepsake',
  'Forgotten Crest',
  'Ashen Token',
  'Hollow Sigil',
  'Pale Reliquary',
  'Dim Lantern',
  'Sealed Verse',
] as const;

/** TINY_TEST always gets one so smoke tests can grant it. SMALL+ add more unique echoes
 *  so secret rooms have distinct collectibles to find. */
export function collectibleCountForProfile(profile: GenerationProfile): number {
  switch (profile) {
    case 'TINY_TEST':
    case 'VISUAL_VERTICAL_SLICE':
      return 1;
    case 'SMALL':
      return 3;
    case 'MEDIUM':
      return 5;
    case 'LARGE':
      return 8;
    case 'RELEASE_CANDIDATE':
      return 4;
  }
}

function buildCollectibleItems(profile: GenerationProfile): Item[] {
  const count = collectibleCountForProfile(profile);
  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    items.push(
      ItemSchema.parse({
        id: i === 0 ? 'lost_echo' : `lost_echo_${i.toString().padStart(3, '0')}`,
        name: COLLECTIBLE_NAMES[i] ?? `Lost Echo ${i + 1}`,
        description: 'A remnant hidden in the ruins. Collect them all.',
        category: 'collectible',
        value: 50,
      }),
    );
  }
  return items;
}

const NPC_NAMES = ['Corvin', 'Tessa Vane', 'Old Marrow', 'Ashen Reed', 'Quen Isley'];
const NPC_ROLES = ['quest_giver', 'merchant', 'lore', 'neutral'] as const;

const INTERMEDIATE_QUEST_OBJECTIVES = [
  'Reach',
  'Kill',
  'Collect',
  'Talk',
  'AbilityAcquire',
  'Discover',
  'Activate',
  'Interact',
  'Choice',
] as const;

type IntermediateQuestObjective = (typeof INTERMEDIATE_QUEST_OBJECTIVES)[number];

function buildQuestObjective(
  questIndex: number,
  questId: string,
  defaults: (typeof PROFILE_DEFAULTS)[GenerationProfile],
  bosses: Boss[],
  enemies: Enemy[],
  gameDna: GameDNA,
  roomIds: string[],
): { type: IntermediateQuestObjective | 'BossKill'; target: string; description: string } {
  const isFinal = questIndex === defaults.quests - 1;
  if (isFinal) {
    const finalBoss = bosses[bosses.length - 1]!;
    return {
      type: 'BossKill',
      target: finalBoss.id,
      description: `Defeat ${finalBoss.name}`,
    };
  }

  const type = INTERMEDIATE_QUEST_OBJECTIVES[questIndex % INTERMEDIATE_QUEST_OBJECTIVES.length]!;
  switch (type) {
    case 'Reach':
      return {
        type,
        target: `room_${(questIndex + 2).toString().padStart(3, '0')}`,
        description: `Reach room ${questIndex + 2}`,
      };
    case 'Kill': {
      const enemy = enemies[Math.min(questIndex, enemies.length - 1)]!;
      return { type, target: enemy.id, description: `Defeat ${enemy.name}` };
    }
    case 'Collect':
      return { type, target: 'lost_echo', description: 'Collect a Lost Echo' };
    case 'Talk':
      return {
        type,
        target: `npc_${Math.min(questIndex, Math.max(defaults.npcs, 1) - 1).toString().padStart(3, '0')}`,
        description: 'Speak with a local',
      };
    case 'AbilityAcquire': {
      const ability = gameDna.abilities[Math.min(questIndex, gameDna.abilities.length - 1)];
      return {
        type,
        target: ability?.id ?? 'dash',
        description: `Acquire ${ability?.name ?? 'Dash'}`,
      };
    }
    case 'Discover': {
      const roomId = roomIds[Math.min(questIndex + 3, Math.max(roomIds.length - 2, 1))] ?? roomIds[0]!;
      return { type, target: roomId, description: `Discover ${roomId}` };
    }
    case 'Activate': {
      const roomId = roomIds[Math.min(questIndex + 2, Math.max(roomIds.length - 2, 1))] ?? roomIds[0]!;
      return { type, target: `save_${roomId}`, description: `Activate the save point in ${roomId}` };
    }
    case 'Interact': {
      const merchantNpcId = `npc_${String(Math.min(1, Math.max(defaults.npcs, 1) - 1)).padStart(3, '0')}`;
      return {
        type,
        target: `shop_${merchantNpcId}`,
        description: 'Browse the merchant wares',
      };
    }
    case 'Choice':
      return {
        type,
        target: `${questId}_accept`,
        description: 'Accept the quest offer',
      };
  }
}

function isFoundrySetting(gameDna: GameDNA): boolean {
  const hay = [
    gameDna.identity.title,
    gameDna.identity.tagline,
    gameDna.identity.tone,
    gameDna.identity.visualStyle,
    gameDna.narrative.premise,
    gameDna.narrative.protagonist,
    gameDna.narrative.centralConflict,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
  return /\bfoundry\b|\bcourier\b/.test(hay);
}

function questTitleAndBlurb(
  gameDna: GameDNA,
  index: number,
  objective: { type: string; description: string },
): { name: string; description: string } {
  if (isFoundrySetting(gameDna) && objective.type === 'BossKill') {
    const bossName = objective.description.replace(/^Defeat\s+/i, '');
    return {
      name: 'Quiet the Core',
      description: `Put down ${bossName} in the foundry core.`,
    };
  }
  if (isFoundrySetting(gameDna)) {
    return {
      name: index === 0 ? 'Quiet the Core' : `Shaft ${index + 1}`,
      description: objective.description,
    };
  }
  return {
    name: index === 0 ? 'Awakening' : `Trial ${index + 1}`,
    description: `Complete objective ${index + 1} in ${gameDna.identity.title}.`,
  };
}

export function generateGameContent(
  gameDna: GameDNA,
  profile: GenerationProfile,
  seed: number,
  bossRoomId: string,
  roomIds: string[],
): GameContent {
  const rng = new SeededRNG(seed);
  const defaults = PROFILE_DEFAULTS[profile];

  const enemies: Enemy[] = [];
  for (let i = 0; i < defaults.enemies; i++) {
    const combatType = enemyCombatTypeForIndex(i);
    const cooldown =
      combatType === 'summon' ? 3.5 : combatType === 'trap' ? 2.2 : combatType === 'beam' ? 2.0 : 1.5;
    enemies.push(
      EnemySchema.parse({
        id: `enemy_${i.toString().padStart(3, '0')}`,
        name: rng.pick(ENEMY_NAMES),
        biomeId: `biome_${i % defaults.biomes}`,
        health: 20 + rng.int(0, 30),
        damage: 5 + rng.int(0, 10),
        speed: 60 + rng.int(0, 40),
        movement: enemyMovementForIndex(i, combatType),
        perception: { radius: 120 + rng.int(0, 80), lineOfSight: true },
        combat: { type: combatType, cooldown },
      }),
    );
  }

  const bosses: Boss[] = [];
  for (let i = 0; i < defaults.bosses; i++) {
    const isFinal = i === defaults.bosses - 1;
    const name = isFinal ? BOSS_NAMES[0]! : rng.pick(BOSS_NAMES);
    const lore = `A powerful guardian of the ${gameDna.identity.title} depths.`;
    const attacks = ['slam', 'projectile'] as string[];
    bosses.push(
      BossSchema.parse({
        id: isFinal ? 'boss_final' : `boss_${i.toString().padStart(3, '0')}`,
        name,
        lore,
        visualPrompt: buildBossVisualPrompt(name, lore, gameDna, {
          isFinal,
          attacks: isFinal ? [...attacks, 'area_burst'] : attacks,
        }),
        arenaRoomId: isFinal ? bossRoomId : `room_${(i * 2 + 3).toString().padStart(3, '0')}`,
        health: isFinal ? 200 : 100 + rng.int(0, 50),
        phases: [
          {
            phase: 1,
            healthThreshold: 1.0,
            attacks: ['slam', 'projectile'],
            telegraphDuration: 0.8,
            recoveryWindow: 1.2,
          },
          ...(isFinal
            ? [
                {
                  phase: 2,
                  healthThreshold: 0.5,
                  attacks: ['slam', 'projectile', 'area_burst'],
                  telegraphDuration: 0.6,
                  recoveryWindow: 0.8,
                },
              ]
            : []),
        ],
        weaknesses: ['dash_through'],
        rewardAbilityId: isFinal ? undefined : gameDna.abilities[0]?.id,
      }),
    );
  }

  const quests: Quest[] = [];
  for (let i = 0; i < defaults.quests; i++) {
    const questId = `quest_${i.toString().padStart(3, '0')}`;
    const objective = buildQuestObjective(i, questId, defaults, bosses, enemies, gameDna, roomIds);
    const copy = questTitleAndBlurb(gameDna, i, objective);
    quests.push(
      QuestSchema.parse({
        id: questId,
        name: copy.name,
        description: copy.description,
        prerequisites: i > 0 ? [`quest_${(i - 1).toString().padStart(3, '0')}`] : [],
        objectives: [
          {
            id: `obj_${i}_1`,
            type: objective.type,
            target: objective.target,
            description: objective.description,
          },
        ],
        rewards: [
          { type: 'currency', id: 'scrap', amount: 50 + i * 25 },
          ...(i === 0 ? [{ type: 'item', id: 'warden_seal', amount: 1 }] : []),
        ],
        dialogueStartId: `${questId}_offer`,
        dialogueCompleteId: `${questId}_complete`,
      }),
    );
  }

  const dialogues: Dialogue[] = [];
  const foundryVoice = isFoundrySetting(gameDna);
  for (const quest of quests) {
    const choiceObjective = quest.objectives.find((o) => o.type === 'Choice');
    const acceptChoice = {
      text: foundryVoice ? "I'll walk it." : 'Yes, I will help.',
      end: true as const,
      action: 'accept_quest' as const,
      ...(choiceObjective ? { id: choiceObjective.target } : {}),
    };
    const offerLines = foundryVoice
      ? [
          { speaker: 'Quest Giver', portrait: 'quest_giver', text: 'The core still turns in the lowest shaft.' },
          { text: quest.description },
          {
            text: 'Will you take the run?',
            choices: [
              acceptChoice,
              { text: 'Not yet.', nextDialogueId: `${quest.id}_decline` },
            ],
          },
        ]
      : [
          { speaker: 'Quest Giver', portrait: 'quest_giver', text: `I need help with "${quest.name}".` },
          { text: quest.description },
          {
            text: 'Will you take this on?',
            choices: [
              acceptChoice,
              { text: 'Not right now.', nextDialogueId: `${quest.id}_decline` },
            ],
          },
        ];
    dialogues.push(
      DialogueSchema.parse({
        id: `${quest.id}_offer`,
        lines: offerLines,
      }),
      DialogueSchema.parse({
        id: `${quest.id}_decline`,
        lines: [
          {
            portrait: 'quest_giver',
            text: foundryVoice ? 'Then keep off the catwalks.' : 'Come back when you are ready.',
          },
        ],
      }),
      DialogueSchema.parse({
        id: `${quest.id}_active`,
        lines: [
          {
            portrait: 'quest_giver',
            text: foundryVoice ? 'The core is still turning.' : `Any progress on "${quest.name}" yet?`,
          },
        ],
      }),
      DialogueSchema.parse({
        id: `${quest.id}_complete`,
        lines: [
          {
            portrait: 'quest_giver',
            text: foundryVoice
              ? 'The shafts are quiet. That is enough.'
              : `Thank you for finishing "${quest.name}".`,
          },
        ],
      }),
    );
  }

  const shops: Shop[] = [];

  // Reserve room_000 (tutorial/start) and the final boss room; spread NPCs evenly across the
  // remaining interior rooms so each gets a distinct room even for small profiles. A NPC role
  // rotates through quest_giver/merchant/lore/neutral; quest_givers reference a real generated
  // quest id (data association only — no runtime dialogue/quest-triggering wired yet, that's a
  // separate follow-up once NPCs actually exist in the runtime).
  const npcs: NPC[] = [];
  const interiorRoomIds = roomIds.slice(1, -1);
  for (let i = 0; i < defaults.npcs; i++) {
    const roomId =
      interiorRoomIds.length > 0
        ? interiorRoomId(roomIds, npcRoomIndex(i, defaults.npcs, interiorRoomIds.length))
        : bossRoomId;
    const role = NPC_ROLES[i % NPC_ROLES.length]!;
    const linkedQuest = quests[i % quests.length];
    const npcId = `npc_${i.toString().padStart(3, '0')}`;
    const npcName = rng.pick(NPC_NAMES);
    let shopId: string | undefined;
    let dialogueIds: string[] = [];

    if (role === 'merchant') {
      shopId = `shop_${npcId}`;
      shops.push(
        ShopSchema.parse({
          id: shopId,
          name: `${npcName}'s Wares`,
          currencyId: 'scrap',
          entries: [
            { itemId: 'health_vial', price: 30 + i * 10 },
            { itemId: 'power_charm', price: 80 + i * 20 },
            { itemId: 'forged_blade', price: 120 + i * 25 },
          ],
        }),
      );
      const greetId = `dlg_${npcId}_greet`;
      dialogues.push(
        DialogueSchema.parse({
          id: greetId,
          lines: [
            { portrait: 'merchant', text: foundryVoice ? 'Scrap only. No credit in the foundry.' : 'Welcome, traveler.' },
            {
              text: foundryVoice ? 'Vials and an edge, if you have the metal.' : 'Looking to trade scrap for supplies?',
              choices: [
                { text: 'Show me your wares.', end: true, action: 'open_shop' },
                { text: 'Maybe later.', nextDialogueId: `dlg_${npcId}_later` },
              ],
            },
          ],
        }),
        DialogueSchema.parse({
          id: `dlg_${npcId}_later`,
          lines: [{ portrait: 'merchant', text: foundryVoice ? 'Stay off the open grates.' : 'Safe travels.' }],
        }),
      );
      dialogueIds = [greetId];
    } else if (role === 'lore') {
      const loreId = `dlg_${npcId}_lore`;
      dialogues.push(
        DialogueSchema.parse({
          id: loreId,
          lines: [
            { portrait: 'lore', text: foundryVoice ? `These halls remember the foundry.` : `These halls remember ${gameDna.identity.title}.` },
            {
              text: 'What would you like to know?',
              choices: [
                { text: 'Tell me about the conflict.', nextDialogueId: `dlg_${npcId}_conflict` },
                { text: 'Any advice?', nextDialogueId: `dlg_${npcId}_advice` },
                { text: 'Farewell.', end: true },
              ],
            },
          ],
        }),
        DialogueSchema.parse({
          id: `dlg_${npcId}_conflict`,
          lines: [
            { portrait: 'lore', text: gameDna.narrative.centralConflict },
            { portrait: 'lore', text: 'Tread carefully.' },
          ],
        }),
        DialogueSchema.parse({
          id: `dlg_${npcId}_advice`,
          lines: [{ portrait: 'lore', text: foundryVoice ? 'Learn the shafts before you face the core.' : 'Upgrade your abilities before facing the final boss.' }],
        }),
      );
      dialogueIds = [loreId];
    } else if (role === 'quest_giver' && linkedQuest) {
      dialogueIds = [`${linkedQuest.id}_offer`, `${linkedQuest.id}_active`, `${linkedQuest.id}_complete`];
    } else {
      const neutralId = `dlg_${npcId}_neutral`;
      dialogues.push(
        DialogueSchema.parse({
          id: neutralId,
          lines: [
            { portrait: 'neutral', text: foundryVoice ? 'Keep your visor sealed.' : 'Stay safe out there.' },
            {
              text: 'Need directions?',
              choices: [
                { text: 'Where is the boss?', nextDialogueId: `dlg_${npcId}_boss_hint` },
                { text: 'Thanks.', end: true },
              ],
            },
          ],
        }),
        DialogueSchema.parse({
          id: `dlg_${npcId}_boss_hint`,
          lines: [{ portrait: 'neutral', text: foundryVoice ? 'The core sits at the far end of the line.' : 'The final chamber lies at the far end of the world.' }],
        }),
      );
      dialogueIds = [neutralId];
    }

    npcs.push(
      NPCSchema.parse({
        id: npcId,
        name: npcName,
        role,
        roomId,
        questIds: role === 'quest_giver' && linkedQuest ? [linkedQuest.id] : [],
        shopId,
        dialogueIds,
        spriteId: npcId,
      }),
    );
  }

  const items: Item[] = [
    ItemSchema.parse({
      id: 'scrap',
      name: 'Scrap',
      description: 'Currency salvaged from the ruins.',
      category: 'currency',
      stackable: true,
      maxStack: 9999,
      value: 1,
    }),
    ItemSchema.parse({
      id: 'health_vial',
      name: 'Health Vial',
      description: 'Restores health.',
      category: 'consumable',
      stackable: true,
      maxStack: 10,
      value: 25,
      effects: [{ type: 'heal', value: 30 }],
    }),
    ItemSchema.parse({
      id: 'heart_relic',
      name: 'Heart Relic',
      description: 'Permanently increases maximum health.',
      category: 'relic',
      value: 100,
      effects: [{ type: 'max_health', value: 25 }],
    }),
    ItemSchema.parse({
      id: 'power_charm',
      name: 'Power Charm',
      description: 'Permanently increases melee attack power.',
      category: 'charm',
      value: 80,
      effects: [{ type: 'attack', value: 5 }],
    }),
    ItemSchema.parse({
      id: 'rusted_key',
      name: 'Rusted Key',
      description: 'An old key found in the ruins.',
      category: 'key',
      value: 15,
    }),
    ItemSchema.parse({
      id: 'upgrade_shard',
      name: 'Upgrade Shard',
      description: 'Material used to strengthen equipment.',
      category: 'upgrade_material',
      stackable: true,
      maxStack: 99,
      value: 10,
    }),
    ItemSchema.parse({
      id: 'forged_blade',
      name: 'Forged Blade',
      description: 'A restored weapon. Increases melee damage while equipped.',
      category: 'weapon',
      value: 120,
      effects: [{ type: 'attack', value: 8 }],
    }),
    ItemSchema.parse({
      id: 'warden_mail',
      name: 'Warden Mail',
      description: 'Weathered armor. Reduces incoming damage while equipped.',
      category: 'armor',
      value: 100,
      effects: [{ type: 'armor', value: 25 }],
    }),
    ItemSchema.parse({
      id: 'warden_seal',
      name: 'Warden Seal',
      description: 'Proof of a completed trial.',
      category: 'quest',
      value: 0,
    }),
    ...buildCollectibleItems(profile),
  ];

  if (genreUsesDungeonTools(gameDna.archetype)) {
    for (const tool of pickTopDownDungeonItems(profile)) {
      if (items.some((item) => item.id === tool.id)) continue;
      items.push(
        ItemSchema.parse({
          id: tool.id,
          name: tool.name,
          description: 'A field tool used in combat, puzzles, and traversal.',
          category: 'relic',
          value: 0,
        }),
      );
    }
  }

  // Explicit utility/equipment drops: never include progression keys, quest items,
  // permanent stat relics or top-down dungeon tools in repeatable enemy loot.
  const lootTables = validateLootCatalog(enemies.map((enemy) => ({
    id: `loot_${enemy.id}`,
    name: `${enemy.name} drops`,
    entries: [
      { itemId: 'health_vial', chance: 0.15, minQuantity: 1, maxQuantity: 1 },
      { itemId: 'upgrade_shard', chance: 0.3, minQuantity: 1, maxQuantity: 2 },
      { itemId: 'warden_mail', chance: 0.03, minQuantity: 1, maxQuantity: 1 },
    ],
  })), items);
  for (const enemy of enemies) enemy.lootTableId = `loot_${enemy.id}`;

  return { enemies, bosses, quests, items, npcs, dialogues, shops, lootTables };
}
