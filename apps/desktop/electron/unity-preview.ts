import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveUnityEditor } from '@metroforge/tools';

/** Launch acknowledgment only: successful spawn is not a gameplay readiness result. */
export async function launchUnityPreview(projectPath: string): Promise<{ success: boolean; message: string }> {
  if (!existsSync(join(projectPath, 'Assets/Editor/MetroForgePreview.cs')) ||
      !existsSync(join(projectPath, 'Assets/Scenes/World.unity'))) {
    return { success: false, message: 'This Unity project needs the current preview template. Save your edits and refresh the project template first.' };
  }
  if (existsSync(join(projectPath, 'Temp/UnityLockfile'))) {
    return { success: false, message: 'This project is already open in Unity. Use MetroForge > Play Generated Game in that editor.' };
  }
  const editor = resolveUnityEditor({ envPath: process.env.UNITY_EDITOR ?? process.env.UNITY_PATH });
  if (!editor.path) return { success: false, message: 'Set UNITY_EDITOR to your installed Unity editor executable, then restart MetroForge.' };
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
