import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveGodotExecutableCanonical,
  readProjectGodotOverride,
  type GodotResolveResult,
  type ResolveGodotOptions,
} from './godot-resolver.js';

export interface LaunchGodotResult {
  success: boolean;
  message: string;
  resolve?: GodotResolveResult;
}

export type { GodotResolveResult, ResolveGodotOptions, GodotResolveSource } from './godot-resolver.js';
export { resolveGodotExecutableCanonical, readProjectGodotOverride } from './godot-resolver.js';

/**
 * Resolve Godot for launch / doctor / play.
 * Prefer passing full ResolveGodotOptions; `customPath` alone is treated as preference.
 */
export async function resolveGodotExecutable(
  customPath?: string | null,
  options: Omit<ResolveGodotOptions, 'preference'> & { preference?: string | null } = {},
): Promise<string | null> {
  const result = resolveGodotExecutableCanonical({
    ...options,
    preference: options.preference ?? customPath,
  });
  return result.path;
}

/** Sync helper used by IPC handlers that already have preference/env loaded. */
export function resolveGodotForProject(
  options: ResolveGodotOptions & { projectPath?: string | null },
): GodotResolveResult {
  const projectOverride =
    options.projectOverride ?? readProjectGodotOverride(options.projectPath ?? null);
  return resolveGodotExecutableCanonical({
    ...options,
    projectOverride,
  });
}

function assertGodotProject(projectPath: string): void {
  if (!existsSync(join(projectPath, 'project.godot'))) {
    throw new Error('Not a Godot project — project.godot is missing');
  }
}

/** Opens the generated project in the Godot editor. */
export async function launchGodotEditor(
  projectPath: string,
  options: ResolveGodotOptions & { godotPath?: string | null; projectPath?: string } = {},
): Promise<LaunchGodotResult> {
  assertGodotProject(projectPath);
  const resolve = resolveGodotForProject({
    preference: options.preference ?? options.godotPath,
    projectOverride: options.projectOverride,
    envPath: options.envPath,
    projectPath,
    extraKnownPaths: options.extraKnownPaths,
  });
  if (!resolve.path) {
    return {
      success: false,
      message: 'Godot not found — install Godot 4.x, set Settings path, or GODOT_EXECUTABLE',
      resolve,
    };
  }

  const proc = spawn(resolve.path, ['--editor', '--path', projectPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  proc.unref();
  return {
    success: true,
    message: `Opened in Godot editor (${resolve.sourceLabel})`,
    resolve,
  };
}

/** Runs the project's main scene (same as pressing F5 in the editor). */
export async function launchGodotGame(
  projectPath: string,
  options: ResolveGodotOptions & { godotPath?: string | null } = {},
): Promise<LaunchGodotResult> {
  assertGodotProject(projectPath);
  const resolve = resolveGodotForProject({
    preference: options.preference ?? options.godotPath,
    projectOverride: options.projectOverride,
    envPath: options.envPath,
    projectPath,
    extraKnownPaths: options.extraKnownPaths,
  });
  if (!resolve.path) {
    return {
      success: false,
      message: 'Godot not found — install Godot 4.x, set Settings path, or GODOT_EXECUTABLE',
      resolve,
    };
  }

  const proc = spawn(resolve.path, ['--path', projectPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  proc.unref();
  return {
    success: true,
    message: `Launched game in Godot (${resolve.sourceLabel})`,
    resolve,
  };
}
