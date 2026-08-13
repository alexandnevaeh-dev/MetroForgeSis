import type { Command } from 'commander';
import {
  loadConfig,
  resolveGeneratedGamesPath,
  resolveProjectPathSafe,
  UnsafeProjectPathError,
} from '@metroforge/shared';
import { launchGodotEditor, launchGodotGame } from '@metroforge/tools';

export function registerOpenCommand(program: Command): void {
  program
    .command('open <slug>')
    .description('Open a generated game in the Godot 4 editor (or play it directly)')
    .option('--play', 'Run the game (F5) instead of opening the editor')
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

      try {
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
