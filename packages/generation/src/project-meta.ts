import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectAllowsPlaceholders } from '@metroforge/shared';

export interface ProjectMetaResult {
  success: boolean;
  projectPath: string;
  meta: Record<string, unknown>;
  allowPlaceholders: boolean;
  errors: string[];
}

function projectJsonPath(projectPath: string): string {
  return join(projectPath, 'project.json');
}

export function readProjectMeta(projectPath: string): Record<string, unknown> | null {
  const path = projectJsonPath(projectPath);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getProjectAllowPlaceholders(projectPath: string): ProjectMetaResult {
  const meta = readProjectMeta(projectPath);
  if (!meta) {
    return {
      success: false,
      projectPath,
      meta: {},
      allowPlaceholders: false,
      errors: ['project.json missing or unreadable'],
    };
  }
  return {
    success: true,
    projectPath,
    meta,
    allowPlaceholders: projectAllowsPlaceholders(meta),
    errors: [],
  };
}

/** Persist top-level `allowPlaceholders` on project.json (AssetProductionGate reads this). */
export function setProjectAllowPlaceholders(
  projectPath: string,
  allowPlaceholders: boolean,
): ProjectMetaResult {
  const path = projectJsonPath(projectPath);
  const existing = readProjectMeta(projectPath) ?? {};
  if (!existsSync(path) && Object.keys(existing).length === 0) {
    // Create a minimal project.json so prototypes can opt in without regenerating.
    if (!existsSync(projectPath)) {
      return {
        success: false,
        projectPath,
        meta: {},
        allowPlaceholders: false,
        errors: ['Project path does not exist'],
      };
    }
  }

  const next: Record<string, unknown> = { ...existing, allowPlaceholders };
  try {
    writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  } catch (err) {
    return {
      success: false,
      projectPath,
      meta: existing,
      allowPlaceholders: projectAllowsPlaceholders(existing),
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }

  return {
    success: true,
    projectPath,
    meta: next,
    allowPlaceholders,
    errors: [],
  };
}
