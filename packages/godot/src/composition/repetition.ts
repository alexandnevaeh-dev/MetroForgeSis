import { SURFACE_ROLES, atlasKey, type SurfaceRole, type VisualCell } from './surface-roles.js';

export interface RepetitionBudget {
  maxIdenticalAdjacentRun: number;
  maxRepeatedModuleCount: number;
  minHeroPropDistance: number;
  maxDuplicatePropPercent: number;
}

export const DEFAULT_REPETITION_BUDGET: RepetitionBudget = {
  maxIdenticalAdjacentRun: 4,
  maxRepeatedModuleCount: 6,
  minHeroPropDistance: 8,
  maxDuplicatePropPercent: 0.35,
};

export interface RepetitionAnalysis {
  longestRun: number;
  dominantAtlasShare: number;
  violations: string[];
  score: number;
}

const GROUND_CYCLE: SurfaceRole[] = ['ground', 'ground_wear', 'top_edge', 'ground_moss', 'ground_crack', 'ground_rare'];
const WALL_CYCLE: SurfaceRole[] = ['wall', 'wall_wear', 'left_edge', 'wall_moss', 'wall_crack', 'wall_rare'];
const PLATFORM_CYCLE: SurfaceRole[] = ['platform', 'platform_wear', 'platform_moss', 'one_way'];
const CEILING_CYCLE: SurfaceRole[] = ['ceiling', 'ceiling_wear', 'ceiling_moss', 'top_edge'];

function cycleFor(col: number, row: number): SurfaceRole[] | null {
  if (col === 5 && row === 2) return null;
  if (col === 6 && row === 2) return null;
  if (col === 7 && row === 2) return null;
  if (col === 3 && row === 2) return null;
  if (col === 4 && row === 2) return null;
  if (col === 0 && (row === 0 || row === 3 || row === 4)) return GROUND_CYCLE;
  if (col === 6 && row === 0) return GROUND_CYCLE;
  if (col === 7 && row === 0) return GROUND_CYCLE;
  if (col === 4 && (row === 3 || row === 4)) return GROUND_CYCLE;
  if (col === 1 && (row === 0 || row === 3 || row === 4)) return WALL_CYCLE;
  if ((col === 4 || col === 5) && row === 0) return WALL_CYCLE;
  if (col === 5 && row === 3) return WALL_CYCLE;
  if (col === 3 && (row === 0 || row === 3 || row === 4)) return PLATFORM_CYCLE;
  if (col === 2 && row === 0) return CEILING_CYCLE;
  if (col === 2 && (row === 3 || row === 4)) return CEILING_CYCLE;
  if (row === 1) return ['outside_tl', 'outside_tr', 'outside_bl', 'outside_br', 'inside_tl', 'inside_tr', 'inside_bl', 'inside_br'];
  if (col <= 1 && row === 2) return PLATFORM_CYCLE;
  return GROUND_CYCLE;
}

const SPECIAL = new Set(['5,2', '6,2', '7,2', '3,2', '4,2']);

function isSpecialAtlas(col: number, row: number): boolean {
  return SPECIAL.has(atlasKey(col, row));
}

export function analyzeRepetition(cells: VisualCell[], budget: RepetitionBudget = DEFAULT_REPETITION_BUDGET): RepetitionAnalysis {
  const visual = cells.filter((c) => !isSpecialAtlas(c.col, c.row));
  const longest = Math.max(longestHorizontalRun(visual), longestVerticalRun(visual));
  const share = dominantAtlasShare(visual);
  const violations: string[] = [];
  if (longest > budget.maxIdenticalAdjacentRun) violations.push('EXCESSIVE_TILE_REPETITION');
  if (share > 0.72) violations.push('SINGLE_TEXTURE_DOMINANCE');
  const score = Math.max(0, 100 - Math.max(0, longest - budget.maxIdenticalAdjacentRun) * 12 - Math.max(0, share - 0.45) * 80);
  return { longestRun: longest, dominantAtlasShare: share, violations, score: Math.round(score) };
}

export function longestHorizontalRun(cells: VisualCell[]): number {
  const byRow = new Map<number, VisualCell[]>();
  for (const cell of cells) {
    const list = byRow.get(cell.y) ?? [];
    list.push(cell);
    byRow.set(cell.y, list);
  }
  let longest = 0;
  for (const list of byRow.values()) {
    list.sort((a, b) => a.x - b.x);
    let run = 1;
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      if (cur.x === prev.x + 1 && cur.col === prev.col && cur.row === prev.row) {
        run += 1;
      } else {
        longest = Math.max(longest, run);
        run = 1;
      }
    }
    longest = Math.max(longest, run);
  }
  return longest;
}

export function longestVerticalRun(cells: VisualCell[]): number {
  const byCol = new Map<number, VisualCell[]>();
  for (const cell of cells) {
    const list = byCol.get(cell.x) ?? [];
    list.push(cell);
    byCol.set(cell.x, list);
  }
  let longest = 0;
  for (const list of byCol.values()) {
    list.sort((a, b) => a.y - b.y);
    let run = 1;
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      if (cur.y === prev.y + 1 && cur.col === prev.col && cur.row === prev.row) {
        run += 1;
      } else {
        longest = Math.max(longest, run);
        run = 1;
      }
    }
    longest = Math.max(longest, run);
  }
  return longest;
}

function dominantAtlasShare(cells: VisualCell[]): number {
  if (cells.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const cell of cells) {
    const key = atlasKey(cell.col, cell.row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let max = 0;
  for (const n of counts.values()) max = Math.max(max, n);
  return max / cells.length;
}

/** Substitute variants / trims. Never mutates collision geometry — cells only. */
export function suppressRepetition(
  cells: VisualCell[],
  seed: number,
  budget: RepetitionBudget = DEFAULT_REPETITION_BUDGET,
): VisualCell[] {
  const next = cells.map((c) => ({ ...c }));
  const byRow = new Map<number, VisualCell[]>();
  for (const cell of next) {
    const list = byRow.get(cell.y) ?? [];
    list.push(cell);
    byRow.set(cell.y, list);
  }
  for (const list of byRow.values()) {
    list.sort((a, b) => a.x - b.x);
    let runStart = 0;
    for (let i = 1; i <= list.length; i++) {
      const stillRun =
        i < list.length &&
        list[i]!.x === list[i - 1]!.x + 1 &&
        list[i]!.col === list[runStart]!.col &&
        list[i]!.row === list[runStart]!.row;
      if (stillRun) continue;
      const runLen = i - runStart;
      if (runLen > budget.maxIdenticalAdjacentRun) {
        const cycle = cycleFor(list[runStart]!.col, list[runStart]!.row);
        if (cycle && cycle.length > 0) {
          const offset = Math.abs(Math.trunc(Number(seed))) || 0;
          for (let k = runStart; k < i; k++) {
            const cell = list[k]!;
            const slot = (Math.floor((k - runStart) / budget.maxIdenticalAdjacentRun) + offset) % cycle.length;
            const pick = cycle[slot];
            if (!pick) continue;
            const atlas = SURFACE_ROLES[pick];
            if (!atlas) continue;
            cell.col = atlas.col;
            cell.row = atlas.row;
          }
        }
      }
      runStart = i;
    }
  }
  return next;
}
