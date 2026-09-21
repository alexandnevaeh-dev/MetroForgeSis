export interface AuthoredEntity {
  kind: string;
  id: string;
  definitionId?: string;
  x: number;
  y: number;
}

/** Use an existing project definition, never an enemy count as an asset identifier. */
export function enemyDefinitionForPlacement(rooms: Array<{ enemies?: string[]; entityPlacements?: AuthoredEntity[] }>): string | undefined {
  for (const room of rooms) {
    const enemy = room.entityPlacements?.find((p) => p.kind === 'enemy');
    if (enemy) return enemy.definitionId ?? enemy.id;
    const id = room.enemies?.find((value) => value.startsWith('enemy_'));
    if (id) return id;
  }
  return undefined;
}

export function unusedEntityId(placements: AuthoredEntity[], kind: string, base: string): string {
  let id = base;
  let suffix = 2;
  while (placements.some((p) => p.kind === kind && p.id === id)) id = `${base}_${suffix++}`;
  return id;
}
