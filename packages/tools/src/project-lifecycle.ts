import {
  existsSync,
  renameSync,
  rmSync,
  cpSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  unlinkSync,
} from 'node:fs';
import { join, basename, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveProjectPathSafe, UnsafeProjectPathError } from '@metroforge/shared';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEFAULT_TEMPLATE_DIR = join(REPO_ROOT, 'templates', 'godot-metroidvania');

/** Runtime files superseded by newer template systems — remove from older generated projects. */
export const ORPHANED_TEMPLATE_FILES = [
  'scripts/world/AbilityGate.gd',
  'scenes/world/AbilityGate.tscn',
  'scripts/core/AssetSprite.gd',
];

const REFRESH_EXTENSIONS = new Set(['.gd', '.tscn']);

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

export function resolveProjectBySlug(generatedGamesRoot: string, slug: string): ProjectLifecycleResult {
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

export interface TemplateRefreshResult extends ProjectLifecycleResult {
  copied: string[];
  removed: string[];
}

export interface TemplateRefreshOptions {
  templateDir?: string;
}

function listTemplateRuntimeFiles(templateDir: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = relative(templateDir, full).replace(/\\/g, '/');
      const ext = entry.name.includes('.') ? `.${entry.name.split('.').pop()}` : '';
      if (!REFRESH_EXTENSIONS.has(ext)) continue;
      if (rel.startsWith('scenes/rooms/')) continue;
      results.push(rel);
    }
  }

  walk(templateDir);
  return results.sort();
}

function readProjectTitle(projectPath: string): string | null {
  try {
    const dna = JSON.parse(readFileSync(join(projectPath, 'game_dna.json'), 'utf-8')) as {
      identity?: { title?: unknown };
    };
    return typeof dna.identity?.title === 'string' ? dna.identity.title : null;
  } catch {
    return null;
  }
}

function applyTitlePatches(projectPath: string, templateDir: string, title: string | null): string[] {
  const patched: string[] = [];
  const escaped = title ? title.replace(/"/g, '\\"') : null;

  const mainSrc = join(templateDir, 'scenes', 'boot', 'Main.tscn');
  const mainDest = join(projectPath, 'scenes', 'boot', 'Main.tscn');
  if (existsSync(mainSrc)) {
    mkdirSync(dirname(mainDest), { recursive: true });
    const content = readFileSync(mainSrc, 'utf-8');
    writeFileSync(mainDest, escaped ? content.replace('MetroForge Game', title!) : content);
    patched.push('scenes/boot/Main.tscn');
  }

  const godotSrc = join(templateDir, 'project.godot');
  const godotDest = join(projectPath, 'project.godot');
  if (existsSync(godotSrc)) {
    const content = readFileSync(godotSrc, 'utf-8');
    writeFileSync(
      godotDest,
      escaped
        ? content.replace('config/name="MetroForge Template"', `config/name="${escaped}"`)
        : content,
    );
    patched.push('project.godot');
  }

  return patched;
}

/** Overwrite generated-project runtime files from the current Godot template without
 *  regenerating rooms, assets, or world data. Also removes superseded template files. */
export function refreshProjectTemplate(
  projectPath: string,
  options: TemplateRefreshOptions = {},
): TemplateRefreshResult {
  const err = assertValidProject(projectPath);
  if (err) return { success: false, errors: [err], copied: [], removed: [] };

  const templateDir = options.templateDir ?? DEFAULT_TEMPLATE_DIR;
  if (!existsSync(join(templateDir, 'project.godot'))) {
    return { success: false, errors: [`Template not found: ${templateDir}`], copied: [], removed: [] };
  }

  const copied: string[] = [];
  const removed: string[] = [];

  try {
    for (const relPath of listTemplateRuntimeFiles(templateDir)) {
      if (relPath === 'scenes/boot/Main.tscn') continue;
      const src = join(templateDir, relPath);
      const dest = join(projectPath, relPath);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      copied.push(relPath);
    }

    copied.push(...applyTitlePatches(projectPath, templateDir, readProjectTitle(projectPath)));

    for (const relPath of ORPHANED_TEMPLATE_FILES) {
      const dest = join(projectPath, relPath);
      if (!existsSync(dest)) continue;
      unlinkSync(dest);
      removed.push(relPath);
    }

    return { success: true, projectPath, errors: [], copied, removed };
  } catch (e) {
    return {
      success: false,
      projectPath,
      errors: [e instanceof Error ? e.message : String(e)],
      copied,
      removed,
    };
  }
}

export function listGeneratedProjects(generatedGamesRoot: string): string[] {
  if (!existsSync(generatedGamesRoot)) return [];
  return readdirSync(generatedGamesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(generatedGamesRoot, entry.name, 'project.godot')))
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
