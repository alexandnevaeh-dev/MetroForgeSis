import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VisualDefect } from '@metroforge/schemas';
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
    return { ...repair, applied: false, detail: `${repair.action} requires targeted asset regeneration` };
  });
}
