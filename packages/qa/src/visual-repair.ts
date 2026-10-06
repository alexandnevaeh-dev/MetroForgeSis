import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VisualDefect } from '@metroforge/schemas';
import { suppressRepetition } from '@metroforge/godot';
import { mapDefectToRepair, VISUAL_REPAIR_BUDGET, type VisualQaResult } from './visual-quality.js';

export interface VisualRepairRecord {
  round: number;
  defect: VisualDefect;
  action: string;
  target: string;
  applied: boolean;
  detail: string;
}

export function planVisualRepairs(result: VisualQaResult, round: number): VisualRepairRecord[] {
  if (round >= VISUAL_REPAIR_BUDGET.maxSliceRepairRounds) return [];
  return result.defects.slice(0, 6).map((defect) => {
    const mapped = mapDefectToRepair(defect);
    return {
      round,
      defect,
      action: mapped.action,
      target: mapped.target,
      applied: false,
      detail: `planned ${mapped.action} for ${mapped.target}`,
    };
  });
}

/** Apply cheap deterministic repairs that do not require re-running full generation. */
export function applyVisualRepairs(projectPath: string, repairs: VisualRepairRecord[]): VisualRepairRecord[] {
  return repairs.map((repair) => {
    if (repair.target === 'lighting') {
      const lightingPath = join(projectPath, 'data', 'visual', 'lighting.json');
      const compositionPath = join(projectPath, 'data', 'environment', 'composition.json');
      let applied = false;
      let detail = 'lighting.json missing';
      if (existsSync(lightingPath)) {
        try {
          const json = JSON.parse(readFileSync(lightingPath, 'utf-8')) as { energy?: number };
          json.energy = Math.min(1.8, (json.energy ?? 1) + 0.2);
          writeFileSync(lightingPath, JSON.stringify(json, null, 2));
          applied = true;
          detail = 'boosted lighting.json energy';
        } catch {
          detail = 'lighting.json unreadable';
        }
      }
      if (existsSync(compositionPath)) {
        try {
          const json = JSON.parse(readFileSync(compositionPath, 'utf-8')) as {
            rooms?: Record<string, { biome?: { lightingEnergy?: number } }>;
          };
          for (const room of Object.values(json.rooms ?? {})) {
            if (room.biome) {
              room.biome.lightingEnergy = Math.min(1.8, (room.biome.lightingEnergy ?? 1) + 0.15);
            }
          }
          writeFileSync(compositionPath, JSON.stringify(json, null, 2));
          applied = true;
          detail = `${detail}; boosted composition lightingEnergy`;
        } catch {
          /* keep lighting.json result */
        }
      }
      return { ...repair, applied, detail };
    }
    if (repair.target === 'tileset' || repair.target === 'room_visuals' || repair.target === 'boss_arena') {
      return retileVisualCells(projectPath, repair);
    }
    return { ...repair, applied: false, detail: `${repair.action} requires targeted asset regeneration` };
  });
}

function retileVisualCells(projectPath: string, repair: VisualRepairRecord): VisualRepairRecord {
  const roomsPath = join(projectPath, 'data', 'rooms', 'rooms.json');
  if (!existsSync(roomsPath)) {
    return { ...repair, applied: false, detail: 'rooms.json missing' };
  }
  try {
    const parsed = JSON.parse(readFileSync(roomsPath, 'utf-8')) as {
      rooms?: Record<
        string,
        {
          tileCells?: Array<{ x: number; y: number; col: number; row: number }>;
          platforms?: unknown;
          pits?: unknown;
          seed?: number;
        }
      >;
    };
    const rooms = parsed.rooms ?? {};
    let changed = 0;
    for (const [id, room] of Object.entries(rooms)) {
      if (!room.tileCells?.length) continue;
      const platforms = room.platforms;
      const pits = room.pits;
      room.tileCells = suppressRepetition(room.tileCells, hashSeed(id), { maxIdenticalAdjacentRun: 3, maxRepeatedModuleCount: 6, minHeroPropDistance: 8, maxDuplicatePropPercent: 0.35 });
      if (JSON.stringify(room.platforms) !== JSON.stringify(platforms) || JSON.stringify(room.pits) !== JSON.stringify(pits)) {
        room.platforms = platforms;
        room.pits = pits;
      }
      changed += 1;
      patchPaintedCellsTscn(projectPath, id, room.tileCells);
    }
    writeFileSync(roomsPath, JSON.stringify(parsed, null, 2));
    return {
      ...repair,
      applied: changed > 0,
      detail: `retiled visuals in ${changed} rooms; collision platforms/pits unchanged`,
    };
  } catch {
    return { ...repair, applied: false, detail: 'rooms.json unreadable' };
  }
}

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0 || 1;
}

function patchPaintedCellsTscn(
  projectPath: string,
  roomId: string,
  cells: Array<{ x: number; y: number; col: number; row: number }>,
): void {
  const tscn = join(projectPath, 'scenes', 'rooms', `${roomId}.tscn`);
  if (!existsSync(tscn)) return;
  const encoded = JSON.stringify(cells.map((c) => [c.x, c.y, c.col, c.row])).replace(/"/g, '\\"');
  const src = readFileSync(tscn, 'utf-8');
  const next = src.replace(/painted_cells_json = ".*"/, `painted_cells_json = "${encoded}"`);
  if (next !== src) writeFileSync(tscn, next);
}
