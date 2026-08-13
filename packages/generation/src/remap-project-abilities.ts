import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  remapAbilityList,
  remapAbilityReferences,
  type AbilityRemapEntry,
  type AbilityReferenceRemapHit,
} from '@metroforge/shared';

export interface RemapProjectAbilitiesResult {
  success: boolean;
  projectPath: string;
  dnaPath: string;
  abilityCount: number;
  remapped: Array<{ from: string; to: string }>;
  removed: string[];
  warnings: string[];
  dryRun: boolean;
  errors: string[];
  changed: boolean;
  abilitiesDataUpdated: boolean;
  /** Files where item/quest/world reward ability strings were rewritten. */
  referenceFilesUpdated: string[];
  referenceRemaps: AbilityReferenceRemapHit[];
}

type GameDnaFile = Record<string, unknown> & {
  abilities?: AbilityRemapEntry[];
};

export type RemapGameDnaResult<T extends GameDnaFile = GameDnaFile> = {
  dna: T;
  remapped: Array<{ from: string; to: string }>;
  removed: string[];
  warnings: string[];
  changed: boolean;
};

/**
 * Remap in-memory Game DNA abilities onto registered runtime IDs.
 * Used by the generation pipeline after DNA create/resume and by project remap.
 */
export function remapGameDnaAbilities<T extends GameDnaFile>(dna: T): RemapGameDnaResult<T> {
  const input = Array.isArray(dna.abilities) ? dna.abilities : [];
  const { abilities, remapped, removed, warnings } = remapAbilityList(input);

  const changed =
    remapped.length > 0 ||
    removed.length > 0 ||
    abilities.length !== input.length ||
    abilities.some((a, i) => a.id !== input[i]?.id);

  return {
    dna: changed ? ({ ...dna, abilities } as T) : dna,
    remapped,
    removed,
    warnings,
    changed,
  };
}

function syncAbilitiesDataFile(
  projectPath: string,
  abilities: AbilityRemapEntry[],
  dryRun: boolean,
): { updated: boolean; warning?: string } {
  const abilitiesPath = join(projectPath, 'data', 'abilities', 'abilities.json');
  if (!existsSync(abilitiesPath)) {
    return { updated: false };
  }

  try {
    const raw = JSON.parse(readFileSync(abilitiesPath, 'utf-8')) as {
      abilities?: Array<Record<string, unknown>>;
    };
    const nextAbilities = abilities
      .filter((a) => a.enabled !== false)
      .map((a) => ({
        id: a.id,
        displayName: typeof a.name === 'string' && a.name.trim() ? a.name : a.id,
        category: typeof a.category === 'string' ? a.category : 'movement',
        enabled: true,
      }));

    const prev = Array.isArray(raw.abilities) ? raw.abilities : [];
    const same =
      prev.length === nextAbilities.length &&
      prev.every((p, i) => p.id === nextAbilities[i]?.id && p.displayName === nextAbilities[i]?.displayName);

    if (same) return { updated: false };
    if (!dryRun) {
      writeFileSync(
        abilitiesPath,
        `${JSON.stringify({ ...raw, abilities: nextAbilities }, null, 2)}\n`,
        'utf-8',
      );
    }
    return { updated: true };
  } catch (err) {
    return {
      updated: false,
      warning: `Could not sync data/abilities/abilities.json: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}

const REFERENCE_JSON_CANDIDATES = [
  'world_graph.json',
  'progression_graph.json',
  join('data', 'world', 'world_graph.json'),
  join('data', 'world', 'overworld.json'),
  join('data', 'items', 'items.json'),
  join('data', 'quests', 'quests.json'),
];

function dedupeItemsById(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.items)) return value;
  const seen = new Set<string>();
  const items: unknown[] = [];
  for (const item of obj.items) {
    if (!item || typeof item !== 'object') {
      items.push(item);
      continue;
    }
    const id = (item as { id?: unknown }).id;
    if (typeof id !== 'string' || !id.trim()) {
      items.push(item);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    items.push(item);
  }
  return { ...obj, items };
}

/**
 * Rewrite ability id strings in item / quest / world reward JSON artifacts.
 * Uses {@link remapAbilityReferences} so aliases like `wind_disc` become `dash`.
 */
export function remapProjectAbilityReferences(
  projectPath: string,
  opts?: { dryRun?: boolean },
): {
  filesUpdated: string[];
  remapped: AbilityReferenceRemapHit[];
  warnings: string[];
  changed: boolean;
} {
  const dryRun = opts?.dryRun === true;
  const remapped: AbilityReferenceRemapHit[] = [];
  const filesUpdated: string[] = [];
  const warnings: string[] = [];

  const candidates = [...REFERENCE_JSON_CANDIDATES];
  const questsDir = join(projectPath, 'data', 'quests');
  if (existsSync(questsDir)) {
    try {
      for (const name of readdirSync(questsDir)) {
        if (name.endsWith('.json')) {
          const rel = join('data', 'quests', name);
          if (!candidates.includes(rel)) candidates.push(rel);
        }
      }
    } catch {
      // ignore unreadable quests dir
    }
  }

  for (const rel of candidates) {
    const abs = join(projectPath, rel);
    if (!existsSync(abs)) continue;
    try {
      const rawText = readFileSync(abs, 'utf-8');
      const parsed = JSON.parse(rawText) as unknown;
      let { value, remapped: hits, changed } = remapAbilityReferences(parsed, { path: rel });
      if (rel.replace(/\\/g, '/').endsWith('items.json') && changed) {
        value = dedupeItemsById(value);
      }
      if (!changed) continue;
      remapped.push(...hits);
      filesUpdated.push(rel);
      if (!dryRun) {
        writeFileSync(abs, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
      }
    } catch (err) {
      warnings.push(
        `Could not remap ability refs in ${rel}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    filesUpdated,
    remapped,
    warnings,
    changed: filesUpdated.length > 0,
  };
}

/**
 * Remap `game_dna.json` abilities onto registered runtime IDs.
 * Also syncs `data/abilities/abilities.json` when present and rewrites
 * item/quest/world reward strings that still use aliases (e.g. wind_disc → dash).
 * Idempotent when already mapped; writes only when not dryRun and something changed.
 */
export function remapProjectAbilities(
  projectPath: string,
  opts?: { dryRun?: boolean },
): RemapProjectAbilitiesResult {
  const dryRun = opts?.dryRun === true;
  const dnaPath = join(projectPath, 'game_dna.json');

  if (!existsSync(dnaPath)) {
    return {
      success: false,
      projectPath,
      dnaPath,
      abilityCount: 0,
      remapped: [],
      removed: [],
      warnings: [],
      dryRun,
      errors: ['game_dna.json missing'],
      changed: false,
      abilitiesDataUpdated: false,
      referenceFilesUpdated: [],
      referenceRemaps: [],
    };
  }

  let dna: GameDnaFile;
  try {
    dna = JSON.parse(readFileSync(dnaPath, 'utf-8')) as GameDnaFile;
  } catch (err) {
    return {
      success: false,
      projectPath,
      dnaPath,
      abilityCount: 0,
      remapped: [],
      removed: [],
      warnings: [],
      dryRun,
      errors: [err instanceof Error ? err.message : String(err)],
      changed: false,
      abilitiesDataUpdated: false,
      referenceFilesUpdated: [],
      referenceRemaps: [],
    };
  }

  const { dna: nextDna, remapped, removed, warnings, changed } = remapGameDnaAbilities(dna);
  const abilities = Array.isArray(nextDna.abilities) ? nextDna.abilities : [];
  const sync = syncAbilitiesDataFile(projectPath, abilities, dryRun);
  const refs = remapProjectAbilityReferences(projectPath, { dryRun });
  const allWarnings = [
    ...(sync.warning ? [...warnings, sync.warning] : warnings),
    ...refs.warnings,
  ];

  if (!dryRun && changed) {
    try {
      writeFileSync(dnaPath, `${JSON.stringify(nextDna, null, 2)}\n`, 'utf-8');
    } catch (err) {
      return {
        success: false,
        projectPath,
        dnaPath,
        abilityCount: abilities.length,
        remapped,
        removed,
        warnings: allWarnings,
        dryRun,
        errors: [err instanceof Error ? err.message : String(err)],
        changed: false,
        abilitiesDataUpdated: false,
        referenceFilesUpdated: refs.filesUpdated,
        referenceRemaps: refs.remapped,
      };
    }
  }

  return {
    success: true,
    projectPath,
    dnaPath,
    abilityCount: abilities.length,
    remapped,
    removed,
    warnings: allWarnings,
    dryRun,
    errors: [],
    changed: changed || sync.updated || refs.changed,
    abilitiesDataUpdated: sync.updated,
    referenceFilesUpdated: refs.filesUpdated,
    referenceRemaps: refs.remapped,
  };
}
