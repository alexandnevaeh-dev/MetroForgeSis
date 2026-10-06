import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, constants, statSync } from 'node:fs';
import { getResourceRoot } from '@metroforge/shared';
import { join, isAbsolute, basename } from 'node:path';
import { resolveUnityEditor } from '@metroforge/tools';

/** Launch acknowledgment only: successful spawn is not a gameplay readiness result. */
export async function launchUnityPreview(projectPath: string, editorPath?: string | null): Promise<{ success: boolean; message: string }> {
  if (!existsSync(join(projectPath, 'Assets/Editor/MetroForgePreview.cs')) ||
      !existsSync(join(projectPath, 'Assets/Scenes/World.unity'))) {
    return { success: false, message: 'This Unity project needs the current preview template. Save your edits and refresh the project template first.' };
  }
  if (existsSync(join(projectPath, 'Temp/UnityLockfile'))) {
    return { success: false, message: 'A Unity project lock is present. If this project is open, use MetroForge > Play Generated Game in that editor.' };
  }
  const configured = (editorPath || process.env.UNITY_EDITOR || process.env.UNITY_PATH)?.trim();
  if (configured) {
    try {
      if (!isAbsolute(configured) || !statSync(configured).isFile()) {
        return { success: false, message: 'The Unity editor path must point to an existing executable file. Update Settings > Paths.' };
      }
      if (/^unity hub(?:\.exe)?$/i.test(basename(configured))) {
        return { success: false, message: 'This path points to Unity Hub. Choose the installed Unity editor executable in Settings > Paths.' };
      }
    } catch {
      return { success: false, message: 'The configured Unity editor file could not be found or read. Update Settings > Paths.' };
    }
  }
  const editor = resolveUnityEditor({ envPath: configured });
  if (!editor.path) return { success: false, message: 'Choose your Unity editor executable in Settings > Paths and save settings.' };
  return new Promise((resolve) => {
    const child = spawn(editor.path!, ['-projectPath', projectPath, '-executeMethod', 'MetroForgePreview.Play',
      '-logFile', join(projectPath, 'metroforge-preview.log')], {
      cwd: projectPath, detached: true, stdio: 'ignore', windowsHide: false,
    });
    child.once('error', (error) => resolve({ success: false, message: error.message }));
    child.once('spawn', () => {
      child.unref();
      resolve({ success: true, message: 'Unity launch requested. Compilation and Play Mode appear in the Unity window; save room edits before restarting preview.' });
    });
  });
}

/** Add only the missing preview entry point; never refresh authored Unity runtime files. */
export function prepareUnityPreview(projectPath: string) {
  const result = { success: false, copied: [] as string[], removed: [] as string[], errors: [] as string[] };
  const relative = 'Assets/Editor/MetroForgePreview.cs';
  try {
    if (!existsSync(join(projectPath, 'Assets/Scenes/World.unity')) ||
        !existsSync(join(projectPath, 'Assets/Scripts/AcceptanceDriver.cs'))) {
      throw new Error('Unity preview repair requires a generated World scene and AcceptanceDriver. No files were changed.');
    }
    if (existsSync(join(projectPath, 'Temp/UnityLockfile'))) {
      throw new Error('A Unity project lock is present. Close this project in Unity before preparing preview.');
    }
    if (!existsSync(join(projectPath, relative))) {
      const source = join(getResourceRoot(), 'templates/unity-metroidvania', relative);
      if (!existsSync(source)) throw new Error('The installed application is missing the Unity preview template.');
      mkdirSync(join(projectPath, 'Assets/Editor'), { recursive: true });
      copyFileSync(source, join(projectPath, relative), constants.COPYFILE_EXCL);
      result.copied.push(relative);
    }
    result.success = true;
  } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)); }
  return result;
}
