import {
  isRegisteredAbilityId,
  REGISTERED_ABILITIES,
  type RegisteredAbilityId,
} from './registered-abilities.js';

/**
 * Synonym → registered runtime ability id.
 * Keys are normalized (lowercase, hyphens → underscores).
 */
export const ABILITY_ALIAS_MAP: Readonly<Record<string, RegisteredAbilityId>> = {
  // Dash family (common LLM inventions)
  wind_disc: 'dash',
  wind_blade: 'dash',
  gale: 'dash',
  wind: 'dash',
  disc: 'dash',
  wind_dash: 'dash',
  blade_dash: 'dash',
  sprint: 'dash',
  burst: 'dash',
  slide: 'dash',
  // Double jump
  doublejump: 'double_jump',
  double_jump: 'double_jump',
  midair_jump: 'double_jump',
  air_jump: 'double_jump',
  // Wall slide / jump
  wallslide: 'wall_slide',
  wall_cling: 'wall_slide',
  cling: 'wall_slide',
  walljump: 'wall_jump',
  wall_kick: 'wall_jump',
  // Air dash
  airdash: 'air_dash',
  aerial_dash: 'air_dash',
  // Ground slam
  groundslam: 'ground_slam',
  slam: 'ground_slam',
  stomp: 'ground_slam',
  dive: 'ground_slam',
  // Grapple
  grappling_hook: 'grapple',
  grappling: 'grapple',
  hook: 'grapple',
  hookshot: 'grapple',
  // Swim
  swimming: 'swim',
  dive_swim: 'swim',
  water: 'swim',
  // Phase
  phasing: 'phase',
  phase_dash: 'phase',
  ghost: 'phase',
  ethereal: 'phase',
};

export type AbilityRemapEntry = {
  id: string;
  enabled?: boolean;
  name?: string;
  category?: string;
  [key: string]: unknown;
};

export type AbilityRemapResult<T extends AbilityRemapEntry = AbilityRemapEntry> = {
  abilities: T[];
  remapped: Array<{ from: string; to: string }>;
  removed: string[];
  warnings: string[];
};

/** Normalize ability ids for alias lookup (lowercase, hyphen → underscore). */
export function normalizeAbilityId(id: string): string {
  return id.trim().toLowerCase().replace(/-/g, '_');
}

export function resolveAbilityAlias(id: string): RegisteredAbilityId | null {
  const normalized = normalizeAbilityId(id);
  if (isRegisteredAbilityId(normalized)) return normalized;
  const aliased = ABILITY_ALIAS_MAP[normalized];
  return aliased ?? null;
}

function registeredMeta(id: RegisteredAbilityId): { name: string; category: string } {
  const found = REGISTERED_ABILITIES.find((a) => a.id === id);
  return {
    name: found?.name ?? id,
    category: found?.category ?? 'movement',
  };
}

/**
 * Remap an ability list onto registered runtime IDs.
 * Unknown ids without aliases are removed. Deduplicates by id after remap
 * (OR-merge `enabled` when merging duplicates).
 */
export function remapAbilityList<T extends AbilityRemapEntry>(
  abilities: T[],
): AbilityRemapResult<T> {
  const remapped: Array<{ from: string; to: string }> = [];
  const removed: string[] = [];
  const warnings: string[] = [];
  const byId = new Map<string, T>();

  for (const ability of abilities) {
    const fromId = typeof ability.id === 'string' ? ability.id : '';
    if (!fromId.trim()) {
      warnings.push('Skipped ability entry with empty id');
      continue;
    }

    const target = resolveAbilityAlias(fromId);
    if (!target) {
      removed.push(fromId);
      warnings.push(`Removed unknown ability "${fromId}" (no registered runtime implementation)`);
      continue;
    }

    const wasAliasOrNormalize = fromId !== target;
    if (wasAliasOrNormalize) {
      remapped.push({ from: fromId, to: target });
    }

    const meta = registeredMeta(target);
    const next = {
      ...ability,
      id: target,
      name: typeof ability.name === 'string' && ability.name.trim() ? ability.name : meta.name,
      category:
        typeof ability.category === 'string' && ability.category.trim()
          ? ability.category
          : meta.category,
    } as T;

    // When remapping (alias or normalize), prefer canonical registered display name/category.
    if (wasAliasOrNormalize && normalizeAbilityId(fromId) !== target) {
      next.name = meta.name as T['name'];
      next.category = meta.category as T['category'];
    }

    const existing = byId.get(target);
    if (existing) {
      const enabled = existing.enabled === true || next.enabled === true;
      byId.set(target, { ...existing, ...next, enabled } as T);
      warnings.push(`Deduplicated ability id "${target}" after remap`);
    } else {
      byId.set(target, next);
    }
  }

  return {
    abilities: [...byId.values()],
    remapped,
    removed,
    warnings,
  };
}

/**
 * Remap a single token that is an ability id (or `item_<ability>`).
 * Returns null when the token should be left unchanged.
 * Does not rewrite free-text labels with spaces (e.g. "Wind Disc").
 */
export function remapAbilityReferenceToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const resolved = resolveAbilityAlias(trimmed);
  if (resolved && trimmed !== resolved) {
    return resolved;
  }

  const itemMatch = trimmed.match(/^(item)([_-])(.+)$/i);
  if (itemMatch) {
    const prefix = itemMatch[1]!;
    const sep = itemMatch[2]!;
    const inner = itemMatch[3]!;
    const innerResolved = resolveAbilityAlias(inner);
    if (innerResolved && inner !== innerResolved) {
      return `${prefix}${sep}${innerResolved}`;
    }
  }

  return null;
}

export type AbilityReferenceRemapHit = {
  from: string;
  to: string;
  path: string;
};

export type AbilityReferenceRemapResult<T = unknown> = {
  value: T;
  remapped: AbilityReferenceRemapHit[];
  changed: boolean;
};

/**
 * Deep-walk JSON-like values and rewrite ability id strings (and `item_<id>` forms)
 * onto registered runtime ids via {@link remapAbilityReferenceToken}.
 */
export function remapAbilityReferences<T>(
  input: T,
  opts?: { path?: string },
): AbilityReferenceRemapResult<T> {
  const remapped: AbilityReferenceRemapHit[] = [];
  const rootPath = opts?.path ?? '';

  const walk = (value: unknown, path: string): unknown => {
    if (typeof value === 'string') {
      const next = remapAbilityReferenceToken(value);
      if (next !== null) {
        remapped.push({ from: value, to: next, path: path || '(root)' });
        return next;
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item, i) => walk(item, path ? `${path}[${i}]` : `[${i}]`));
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(obj)) {
        const childPath = path ? `${path}.${key}` : key;
        result[key] = walk(child, childPath);
      }
      return result;
    }
    return value;
  };

  const next = walk(input, rootPath) as T;
  return {
    value: next,
    remapped,
    changed: remapped.length > 0,
  };
}
