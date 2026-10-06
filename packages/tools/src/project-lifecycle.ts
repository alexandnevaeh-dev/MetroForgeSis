import { existsSync, renameSync, rmSync, cpSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { resolveProjectPathSafe, UnsafeProjectPathError } from '@metroforge/shared';

import {
  refreshProjectTemplate,
  type TemplateRefreshOptions,
  type TemplateRefreshResult,
} from './project-template-refresh.js';
export { refreshProjectTemplate } from './project-template-refresh.js';
export type { TemplateRefreshOptions, TemplateRefreshResult } from './project-template-refresh.js';

export { ORPHANED_TEMPLATE_FILES } from './project-template-refresh.js';

export interface ProjectLifecycleResult {
  success: boolean;
  projectPath?: string;
  errors: string[];
}

function assertValidProject(projectPath: string): string | null {
  if (!existsSync(projectPath)) return `Project not found: ${projectPath}`;
  if (!existsSync(join(projectPath, 'project.godot'))) {
    return 'Invalid project: project.godot not found';
  }
  return null;
}

export function deleteProject(projectPath: string): ProjectLifecycleResult {
  const err = assertValidProject(projectPath);
  if (err) return { success: false, errors: [err] };

  try {
    rmSync(projectPath, { recursive: true, force: true });
    return { success: true, errors: [] };
  } catch (e) {
    return { success: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

export function renameProject(
  projectPath: string,
  newSlug: string,
  generatedGamesRoot: string,
): ProjectLifecycleResult {
  const err = assertValidProject(projectPath);
  if (err) return { success: false, errors: [err] };

  let targetPath: string;
  try {
    targetPath = resolveProjectPathSafe(generatedGamesRoot, newSlug);
  } catch (e) {
    const msg = e instanceof UnsafeProjectPathError ? e.message : String(e);
    return { success: false, errors: [msg] };
  }

  if (existsSync(targetPath)) {
    return { success: false, errors: [`Target already exists: ${targetPath}`] };
  }

  try {
    renameSync(projectPath, targetPath);
    return { success: true, projectPath: targetPath, errors: [] };
  } catch (e) {
    return { success: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

export function duplicateProject(
  projectPath: string,
  newSlug: string,
  generatedGamesRoot: string,
): ProjectLifecycleResult {
  const err = assertValidProject(projectPath);
  if (err) return { success: false, errors: [err] };

  let targetPath: string;
  try {
    targetPath = resolveProjectPathSafe(generatedGamesRoot, newSlug);
  } catch (e) {
    const msg = e instanceof UnsafeProjectPathError ? e.message : String(e);
    return { success: false, errors: [msg] };
  }

  if (existsSync(targetPath)) {
    return { success: false, errors: [`Target already exists: ${targetPath}`] };
  }

  try {
    cpSync(projectPath, targetPath, { recursive: true });
    return { success: true, projectPath: targetPath, errors: [] };
  } catch (e) {
    return { success: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

export function resolveProjectBySlug(
  generatedGamesRoot: string,
  slug: string,
): ProjectLifecycleResult {
  try {
    const projectPath = resolveProjectPathSafe(generatedGamesRoot, slug);
    const err = assertValidProject(projectPath);
    if (err) return { success: false, errors: [err] };
    return { success: true, projectPath, errors: [] };
  } catch (e) {
    const msg = e instanceof UnsafeProjectPathError ? e.message : String(e);
    return { success: false, errors: [msg] };
  }
}

export function projectSlugFromPath(projectPath: string): string {
  return basename(projectPath);
}

export function listGeneratedProjects(generatedGamesRoot: string): string[] {
  if (!existsSync(generatedGamesRoot)) return [];
  return readdirSync(generatedGamesRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(join(generatedGamesRoot, entry.name, 'project.godot')),
    )
    .map((entry) => join(generatedGamesRoot, entry.name))
    .sort();
}

export function refreshAllProjectTemplates(
  generatedGamesRoot: string,
  options: TemplateRefreshOptions = {},
): TemplateRefreshResult[] {
  return listGeneratedProjects(generatedGamesRoot).map((projectPath) =>
    refreshProjectTemplate(projectPath, options),
  );
}
