import { z } from 'zod';

export const Vec2Schema = z.object({ x: z.number(), y: z.number() });

export const GraphNodeSchema = z.object({
  id: z.string(),
  type: z.enum([
    'room',
    'zone',
    'boss',
    'ability',
    'key',
    'switch',
    'event',
    'region',
    'hub',
  ]),
  label: z.string(),
  metadata: z.record(z.unknown()).default({}),
});

export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  requirements: z.array(z.string()).default([]),
  optional: z.boolean().default(false),
  bidirectional: z.boolean().default(true),
  transition: z.enum(['left', 'right', 'up', 'down']).optional(),
});

export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const WorldGraphSchema = z.object({
  version: z.string(),
  seed: z.number().int(),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  regions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      biomeId: z.string(),
      roomIds: z.array(z.string()),
    }),
  ),
});

export type WorldGraph = z.infer<typeof WorldGraphSchema>;

export const ProgressionNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['room', 'boss', 'ability', 'key', 'switch', 'event']),
  label: z.string(),
  required: z.boolean().default(true),
});

export const ProgressionEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  requires: z.array(z.string()).default([]),
});

export const ProgressionGraphSchema = z.object({
  version: z.string(),
  seed: z.number().int(),
  startNodeId: z.string(),
  endNodeId: z.string(),
  nodes: z.array(ProgressionNodeSchema),
  edges: z.array(ProgressionEdgeSchema),
  abilities: z.array(z.string()),
  criticalPath: z.array(z.string()).default([]),
});

export type ProgressionGraph = z.infer<typeof ProgressionGraphSchema>;

export const BiomeSchema = z.object({
  id: z.string(),
  name: z.string(),
  palette: z.array(z.string()),
  architecture: z.string(),
  traversalIdentity: z.string(),
  enemyFamilies: z.array(z.string()),
  hazards: z.array(z.string()),
  musicId: z.string().optional(),
  ambienceId: z.string().optional(),
  bossId: z.string().optional(),
  lighting: z.string().optional(),
  tilesetId: z.string().optional(),
});

export type Biome = z.infer<typeof BiomeSchema>;

export const RoomEntranceSchema = z.object({
  id: z.string(),
  direction: z.enum(['north', 'south', 'east', 'west', 'up', 'down']),
  targetRoomId: z.string().optional(),
  locked: z.boolean().default(false),
  keyId: z.string().optional(),
});

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  biomeId: z.string(),
  archetype: z.enum([
    'connector',
    'traversal',
    'combat',
    'arena',
    'puzzle',
    'ability_gate',
    'npc',
    'shop',
    'save',
    'ability_shrine',
    'secret',
    'treasure',
    'challenge',
    'boss',
    'set_piece',
    'tutorial',
    'transition',
  ]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  entrances: z.array(RoomEntranceSchema).default([]),
  requiredAbilities: z.array(z.string()).default([]),
  enemies: z.array(z.string()).default([]),
  secrets: z.array(z.string()).default([]),
  collectibles: z.array(z.string()).default([]),
  npcs: z.array(z.string()).default([]),
  events: z.array(z.string()).default([]),
  musicId: z.string().optional(),
});

export type Room = z.infer<typeof RoomSchema>;

export const AbilitySchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  category: z.enum(['movement', 'combat', 'utility', 'passive']),
  input: z.string(),
  cooldown: z.number().nonnegative(),
  resourceCost: z.number().nonnegative().default(0),
  animationId: z.string().optional(),
  vfxId: z.string().optional(),
  sfxId: z.string().optional(),
  progressionRequirement: z.string().optional(),
  tags: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

export type Ability = z.infer<typeof AbilitySchema>;

export const EnemySchema = z.object({
  id: z.string(),
  name: z.string(),
  biomeId: z.string().optional(),
  health: z.number().positive(),
  damage: z.number().nonnegative(),
  speed: z.number().nonnegative(),
  movement: z.enum([
    'stationary',
    'patrol',
    'crawl',
    'hop',
    'fly',
    'hover',
    'charge',
    'teleport',
    'burrow',
  ]),
  perception: z.object({
    radius: z.number().nonnegative(),
    visionCone: z.number().optional(),
    lineOfSight: z.boolean().default(true),
  }),
  combat: z.object({
    type: z.enum(['melee', 'projectile', 'burst', 'beam', 'area', 'summon', 'trap']),
    range: z.number().nonnegative().optional(),
    cooldown: z.number().nonnegative().optional(),
  }),
  spriteId: z.string().optional(),
  lootTableId: z.string().optional(),
});

export type Enemy = z.infer<typeof EnemySchema>;

export const BossPhaseSchema = z.object({
  phase: z.number().int().positive(),
  healthThreshold: z.number().min(0).max(1),
  attacks: z.array(z.string()),
  telegraphDuration: z.number().nonnegative(),
  recoveryWindow: z.number().nonnegative(),
});

export const BossSchema = z.object({
  id: z.string(),
  name: z.string(),
  lore: z.string(),
  arenaRoomId: z.string(),
  health: z.number().positive(),
  phases: z.array(BossPhaseSchema),
  weaknesses: z.array(z.string()).default([]),
  rewardAbilityId: z.string().optional(),
  rewardItemId: z.string().optional(),
  musicId: z.string().optional(),
  spriteId: z.string().optional(),
});

export type Boss = z.infer<typeof BossSchema>;

export const NPCSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['quest_giver', 'merchant', 'lore', 'companion', 'neutral']),
  roomId: z.string(),
  dialogueIds: z.array(z.string()).default([]),
  questIds: z.array(z.string()).default([]),
  shopId: z.string().optional(),
  spriteId: z.string().optional(),
});

export type NPC = z.infer<typeof NPCSchema>;

export const QuestObjectiveSchema = z.object({
  id: z.string(),
  type: z.enum([
    'Kill',
    'Collect',
    'Reach',
    'Discover',
    'Talk',
    'Activate',
    'Interact',
    'BossKill',
    'AbilityAcquire',
    'Choice',
  ]),
  target: z.string(),
  count: z.number().int().positive().default(1),
  description: z.string(),
});

export const QuestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  prerequisites: z.array(z.string()).default([]),
  objectives: z.array(QuestObjectiveSchema),
  rewards: z.array(z.object({ type: z.string(), id: z.string(), amount: z.number().optional() })),
  dialogueStartId: z.string().optional(),
  dialogueCompleteId: z.string().optional(),
});

export type Quest = z.infer<typeof QuestSchema>;

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum([
    'weapon',
    'relic',
    'charm',
    'currency',
    'key',
    'consumable',
    'quest',
    'collectible',
    'upgrade_material',
  ]),
  stackable: z.boolean().default(false),
  maxStack: z.number().int().positive().default(1),
  value: z.number().nonnegative().default(0),
  iconId: z.string().optional(),
  effects: z.array(z.object({ type: z.string(), value: z.number() })).default([]),
});

export type Item = z.infer<typeof ItemSchema>;
