import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { detectGodot } from './registry.js';

export interface LaunchGodotResult {
  success: boolean;
  message: string;
}

export async function resolveGodotExecutable(customPath?: string | null): Promise<string | null> {
  const info = await detectGodot(customPath);
  if (customPath) return customPath;
  return info.path;
}

function assertGodotProject(projectPath: string): void {
  if (!existsSync(join(projectPath, 'project.godot'))) {
    throw new Error('Not a Godot project — project.godot is missing');
  }
}

/** Opens the generated project in the Godot editor. */
export async function launchGodotEditor(
  projectPath: string,
  options: { godotPath?: string | null } = {},
): Promise<LaunchGodotResult> {
  assertGodotProject(projectPath);
  const godotPath = await resolveGodotExecutable(options.godotPath);
  if (!godotPath) {
    return {
      success: false,
      message: 'Godot not found — install Godot 4.x or set GODOT_EXECUTABLE in .env',
    };
  }

  const proc = spawn(godotPath, ['--editor', '--path', projectPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  proc.unref();
  return { success: true, message: 'Opened in Godot editor' };
}

/** Runs the project's main scene (same as pressing F5 in the editor). */
export async function launchGodotGame(
  projectPath: string,
  options: { godotPath?: string | null } = {},
): Promise<LaunchGodotResult> {
  assertGodotProject(projectPath);
  const godotPath = await resolveGodotExecutable(options.godotPath);
  if (!godotPath) {
    return {
      success: false,
      message: 'Godot not found — install Godot 4.x or set GODOT_EXECUTABLE in .env',
    };
  }

  const proc = spawn(godotPath, ['--path', projectPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  proc.unref();
  return { success: true, message: 'Launched game in Godot' };
}
