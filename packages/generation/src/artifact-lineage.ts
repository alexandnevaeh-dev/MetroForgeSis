export interface ArtifactLineage {
  id: string;
  path: string;
  promptHash?: string | null;
  seed?: number | null;
  parentArtifactIds: string[];
  compiler?: string | null;
  model?: string | null;
  godotResourcePath?: string;
  repairCount: number;
  transformation?: string;
  sourceLicense?: string;
  derivedLicense?: string;
}

export interface LineageEdge {
  parentId: string;
  childId: string;
  reason: string;
}

export function lineageFromArtifact(artifact: {
  id?: string;
  path?: string;
  promptHash?: string | null;
  seed?: number | null;
  model?: string | null;
  compiler?: string | null;
  parentArtifactIds?: string[];
  godotResourcePath?: string;
  repairCount?: number;
  transformation?: string;
  sourceLicense?: string;
  derivedLicense?: string;
  sourcePath?: string;
}): ArtifactLineage {
  const id = String(artifact.id ?? artifact.path ?? '');
  const parents = [...(artifact.parentArtifactIds ?? [])];
  if (artifact.sourcePath && !parents.includes(artifact.sourcePath)) {
    parents.push(artifact.sourcePath);
  }
  return {
    id,
    path: String(artifact.path ?? ''),
    promptHash: artifact.promptHash ?? null,
    seed: artifact.seed ?? null,
    parentArtifactIds: parents.filter(Boolean),
    compiler: artifact.compiler ?? null,
    model: artifact.model ?? null,
    godotResourcePath: artifact.godotResourcePath ?? (artifact.path ? `res://${String(artifact.path).replace(/\\/g, '/')}` : undefined),
    repairCount: artifact.repairCount ?? 0,
    transformation: artifact.transformation,
    sourceLicense: artifact.sourceLicense,
    derivedLicense: artifact.derivedLicense,
  };
}

/** Character still → pose frames → sheet → Player.tscn. Rooms are not descendants of the player still. */
export function defaultCharacterLineageEdges(characterId = 'player'): LineageEdge[] {
  const source = characterId;
  const poses = ['idle', 'run', 'jump_start', 'jump', 'fall', 'land', 'dash', 'wall_slide', 'wall_jump'];
  const edges: LineageEdge[] = [];
  for (const pose of poses) {
    edges.push({ parentId: source, childId: `${characterId}_${pose}_pose`, reason: 'pose_from_canonical_character' });
  }
  edges.push({ parentId: source, childId: `${characterId}_walk_sheet`, reason: 'sheet_from_canonical_character' });
  edges.push({ parentId: source, childId: `${characterId}_attack_sheet`, reason: 'sheet_from_canonical_character' });
  edges.push({ parentId: source, childId: `${characterId}_hurt_sheet`, reason: 'sheet_from_canonical_character' });
  edges.push({ parentId: source, childId: `${characterId}_death_sheet`, reason: 'sheet_from_canonical_character' });
  edges.push({ parentId: `${characterId}_walk_sheet`, childId: 'Player.tscn', reason: 'scene_uses_spritesheet' });
  return edges;
}

export function descendantsOf(
  edges: LineageEdge[],
  rootId: string,
): { ids: string[]; reasons: Array<{ id: string; reason: string }> } {
  const children = new Map<string, LineageEdge[]>();
  for (const edge of edges) {
    const list = children.get(edge.parentId) ?? [];
    list.push(edge);
    children.set(edge.parentId, list);
  }
  const ids: string[] = [];
  const reasons: Array<{ id: string; reason: string }> = [];
  const seen = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const edge of children.get(current) ?? []) {
      if (seen.has(edge.childId)) continue;
      seen.add(edge.childId);
      ids.push(edge.childId);
      reasons.push({ id: edge.childId, reason: edge.reason });
      stack.push(edge.childId);
    }
  }
  return { ids, reasons };
}

export function markDescendantsDirty(
  edges: LineageEdge[],
  rootId: string,
): { dirtyIds: string[]; reason: string } {
  const { ids, reasons } = descendantsOf(edges, rootId);
  const reason = reasons.map((r) => `${r.id}:${r.reason}`).join(', ') || `no descendants of ${rootId}`;
  return { dirtyIds: ids, reason: `invalidate ${rootId} → ${reason}` };
}
