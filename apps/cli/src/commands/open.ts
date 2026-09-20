import type { Command } from 'commander';
import {
  loadConfig,
  resolveGeneratedGamesPath,
  resolveProjectPathSafe,
  UnsafeProjectPathError,
} from '@metroforge/shared';
import { launchGodotEditor, launchGodotGame, resolveUnityEditor, resolveUnrealEditor, missingEditorError } from '@metroforge/tools';
import { detectProjectEngine } from '@metroforge/qa';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function registerOpenCommand(program: Command): void {
  program
    .command('open <slug>')
    .description('Open a generated game in its target editor (Godot, Unity, or Unreal)')
    .option('--play', 'Run the game instead of opening the editor (Godot only)')
    .action(async (slug: string, opts: { play?: boolean }) => {
      const config = loadConfig();
      let projectPath: string;
      try {
        projectPath = resolveProjectPathSafe(resolveGeneratedGamesPath(config, process.cwd()), slug);
      } catch (err) {
        console.log(err instanceof UnsafeProjectPathError ? `✗ ${err.message}` : `✗ ${String(err)}`);
        process.exitCode = 1;
        return;
      }
      if (!existsSync(projectPath)) {
        console.log(`✗ Project not found: ${projectPath}`);
        process.exitCode = 1;
        return;
      }

      const engine = detectProjectEngine(projectPath);
      try {
        if (engine === 'unity') {
          const unity = resolveUnityEditor({ envPath: config.unityEditor });
          const unityErr = missingEditorError('unity', unity);
          if (!unity.path) {
            console.log(`✗ ${unityErr || `UNITY_EDITOR_NOT_AVAILABLE: ${unity.message}`}`);
            process.exitCode = 1;
            return;
          }
          if (unityErr) {
            console.log(`! ${unityErr}`);
          }
          spawn(unity.path, ['-projectPath', projectPath], { detached: true, stdio: 'ignore' }).unref();
          console.log(`✓ Opening Unity project: ${projectPath}`);
          console.log('  Status: opened request issued — not proof of compile or playtest');
          return;
        }
        if (engine === 'unreal') {
          const unreal = resolveUnrealEditor({ envPath: config.unrealEditor });
          const unrealErr = missingEditorError('unreal', unreal);
          if (!unreal.path) {
            console.log(`✗ ${unrealErr || `UNREAL_EDITOR_NOT_AVAILABLE: ${unreal.message}`}`);
            process.exitCode = 1;
            return;
          }
          if (unrealErr) {
            console.log(`! ${unrealErr}`);
          }
          const uproject = join(projectPath, 'MetroForgeGame.uproject');
          spawn(unreal.path, [uproject], { detached: true, stdio: 'ignore' }).unref();
          console.log(`✓ Opening Unreal project: ${uproject}`);
          console.log('  Status: opened request issued — not proof of compile or playtest');
          return;
        }

        const result = opts.play
          ? await launchGodotGame(projectPath, { godotPath: config.godotExecutable })
          : await launchGodotEditor(projectPath, { godotPath: config.godotExecutable });

        if (result.success) {
          console.log(`✓ ${result.message}: ${projectPath}`);
        } else {
          console.log(`✗ ${result.message}`);
          process.exitCode = 1;
        }
      } catch (err) {
        console.log(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    });
}
