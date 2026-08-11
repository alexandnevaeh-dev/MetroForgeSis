import type { GameDNA, Enemy, Boss, Quest, Item } from '@metroforge/schemas';
import { EnemySchema, BossSchema, QuestSchema, ItemSchema } from '@metroforge/schemas';
import { PROFILE_DEFAULTS, type GenerationProfile } from '@metroforge/shared';
import { SeededRNG } from '@metroforge/procedural';

export interface GameContent {
  enemies: Enemy[];
  bosses: Boss[];
  quests: Quest[];
  items: Item[];
}

const ENEMY_NAMES = ['Scrap Drone', 'Rust Crawler', 'Arc Wisp', 'Gear Mite', 'Void Sentinel'];
const BOSS_NAMES = ['Guardian Core', 'Forge Titan', 'Echo Warden', 'Machine Sovereign'];

export function generateGameContent(
  gameDna: GameDNA,
  profile: GenerationProfile,
  seed: number,
  bossRoomId: string,
): GameContent {
  const rng = new SeededRNG(seed);
  const defaults = PROFILE_DEFAULTS[profile];

  const enemies: Enemy[] = [];
  for (let i = 0; i < defaults.enemies; i++) {
    enemies.push(
      EnemySchema.parse({
        id: `enemy_${i.toString().padStart(3, '0')}`,
        name: rng.pick(ENEMY_NAMES),
        biomeId: `biome_${i % defaults.biomes}`,
        health: 20 + rng.int(0, 30),
        damage: 5 + rng.int(0, 10),
        speed: 60 + rng.int(0, 40),
        movement: rng.pick(['patrol', 'hop', 'crawl', 'stationary'] as const),
        perception: { radius: 120 + rng.int(0, 80), lineOfSight: true },
        combat: { type: rng.pick(['melee', 'projectile'] as const), cooldown: 1.5 },
      }),
    );
  }

  const bosses: Boss[] = [];
  for (let i = 0; i < defaults.bosses; i++) {
    const isFinal = i === defaults.bosses - 1;
    bosses.push(
      BossSchema.parse({
        id: isFinal ? 'boss_final' : `boss_${i.toString().padStart(3, '0')}`,
        name: isFinal ? BOSS_NAMES[0]! : rng.pick(BOSS_NAMES),
        lore: `A powerful guardian of the ${gameDna.identity.title} depths.`,
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
    const boss = bosses[Math.min(i, bosses.length - 1)]!;
    quests.push(
      QuestSchema.parse({
        id: `quest_${i.toString().padStart(3, '0')}`,
        name: i === 0 ? 'Awakening' : `Trial ${i + 1}`,
        description: `Complete objective ${i + 1} in ${gameDna.identity.title}.`,
        prerequisites: i > 0 ? [`quest_${(i - 1).toString().padStart(3, '0')}`] : [],
        objectives: [
          {
            id: `obj_${i}_1`,
            type: i === defaults.quests - 1 ? 'BossKill' : 'Reach',
            target: i === defaults.quests - 1 ? boss.id : `room_${(i + 2).toString().padStart(3, '0')}`,
            description:
              i === defaults.quests - 1
                ? `Defeat ${boss.name}`
                : `Reach room ${i + 2}`,
          },
        ],
        rewards: [{ type: 'currency', id: 'scrap', amount: 50 + i * 25 }],
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
  ];

  return { enemies, bosses, quests, items };
}
