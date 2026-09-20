import { floorTopPx } from './tile-layout.js';

/** Authored entity kinds persisted on rooms.json and consumed by room scene assembly. */
export type EntityKind =
  | 'player_spawn'
  | 'enemy'
  | 'boss'
  | 'npc'
  | 'ability_pickup'
  | 'item_pickup'
  | 'checkpoint';

export interface EntityPlacement {
  kind: EntityKind;
  id: string;
  x: number;
  y: number;
}

export interface EntityPlacementDefaultsInput {
  width: number;
  height: number;
  tileSize?: number;
  hasEnemy?: boolean;
  enemyIndex?: number;
  enemyId?: string;
  isBossRoom?: boolean;
  bossId?: string;
  abilityPickups?: string[];
  hasSavePoint?: boolean;
  npcs?: Array<{ id: string }>;
  hasItemPickup?: boolean;
  itemId?: string;
}

/** Legacy assembler hardcodes — used when a room has no authored entityPlacements. */
export function defaultEntityPlacements(input: EntityPlacementDefaultsInput): EntityPlacement[] {
  const tileSize = input.tileSize ?? 16;
  const floorTop = floorTopPx(input.height, tileSize);
  const width = input.width;
  const placements: EntityPlacement[] = [
    { kind: 'player_spawn', id: 'player', x: 100, y: floorTop },
  ];

  if (input.hasEnemy && !input.isBossRoom) {
    const enemyId =
      input.enemyId ??
      `enemy_${String(input.enemyIndex ?? 0).padStart(3, '0')}`;
    placements.push({
      kind: 'enemy',
      id: enemyId,
      x: width - 150,
      y: floorTop,
    });
  }

  if (input.isBossRoom && input.bossId) {
    placements.push({
      kind: 'boss',
      id: input.bossId,
      x: width / 2,
      y: floorTop,
    });
  }

  for (let i = 0; i < (input.abilityPickups?.length ?? 0); i++) {
    const abilityId = input.abilityPickups![i]!;
    placements.push({
      kind: 'ability_pickup',
      id: abilityId,
      x: 220 + i * 40,
      y: floorTop - 28,
    });
  }

  if (input.hasSavePoint) {
    placements.push({
      kind: 'checkpoint',
      id: 'save_point',
      x: 150,
      y: floorTop,
    });
  }

  (input.npcs ?? []).forEach((npc, npcIdx) => {
    placements.push({
      kind: 'npc',
      id: npc.id,
      x: width * 0.75 - npcIdx * 60,
      y: floorTop,
    });
  });

  if (input.hasItemPickup && input.itemId) {
    placements.push({
      kind: 'item_pickup',
      id: input.itemId,
      x: width * 0.5 + 100,
      y: floorTop - 12,
    });
  }

  return placements;
}

export function isEntityPlacement(value: unknown): value is EntityPlacement {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.kind === 'string' &&
    typeof row.id === 'string' &&
    typeof row.x === 'number' &&
    Number.isFinite(row.x) &&
    typeof row.y === 'number' &&
    Number.isFinite(row.y)
  );
}

/** Keep valid authored rows; fall back to defaults when absent or empty. */
export function resolveEntityPlacements(
  authored: unknown,
  defaultsInput: EntityPlacementDefaultsInput,
): EntityPlacement[] {
  if (Array.isArray(authored)) {
    const valid = authored.filter(isEntityPlacement).map((p) => ({
      kind: p.kind as EntityKind,
      id: p.id,
      x: p.x,
      y: p.y,
    }));
    if (valid.length > 0) return valid;
  }
  return defaultEntityPlacements(defaultsInput);
}

export function findPlacement(
  placements: EntityPlacement[],
  kind: EntityKind,
  id?: string,
): EntityPlacement | undefined {
  return placements.find((p) => p.kind === kind && (id === undefined || p.id === id));
}

/**
 * When enemy/npc id lists change, keep positions for surviving ids and append
 * defaults for newly added ids (backward-compatible room edits).
 */
export function mergeEntityPlacementsForIds(
  previous: EntityPlacement[] | undefined,
  defaultsInput: EntityPlacementDefaultsInput,
  nextEnemyIds: string[],
  nextNpcIds: string[],
): EntityPlacement[] {
  const base = resolveEntityPlacements(previous, defaultsInput);
  const byKey = new Map(base.map((p) => [`${p.kind}:${p.id}`, p]));
  const defaults = defaultEntityPlacements({
    ...defaultsInput,
    hasEnemy: nextEnemyIds.length > 0 && !defaultsInput.isBossRoom,
    enemyId: nextEnemyIds[0],
    npcs: nextNpcIds.map((id) => ({ id })),
  });

  const next: EntityPlacement[] = [];
  for (const p of defaults) {
    if (p.kind === 'enemy' && !nextEnemyIds.includes(p.id) && !defaultsInput.isBossRoom) continue;
    if (p.kind === 'npc' && !nextNpcIds.includes(p.id)) continue;
    const key = `${p.kind}:${p.id}`;
    next.push(byKey.get(key) ?? p);
  }

  // Preserve extra authored enemies beyond the single default slot when ids remain.
  for (const enemyId of nextEnemyIds) {
    const key = `enemy:${enemyId}`;
    if (!next.some((p) => p.kind === 'enemy' && p.id === enemyId)) {
      const prior = byKey.get(key);
      if (prior) next.push(prior);
      else {
        const floorTop = floorTopPx(defaultsInput.height, defaultsInput.tileSize ?? 16);
        next.push({
          kind: 'enemy',
          id: enemyId,
          x: defaultsInput.width - 150 - next.filter((p) => p.kind === 'enemy').length * 48,
          y: floorTop,
        });
      }
    }
  }

  return next;
}
