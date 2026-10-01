import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getResourceRoot } from '@metroforge/shared';
import type { AssemblyInput, AssemblyResult } from '@metroforge/godot';
import {
  buildGameplayPack,
  writeEngineManifest,
  writeSharedProjectData,
  type EngineAssemblyResult,
} from '@metroforge/engines';


function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else cpSync(from, to);
  }
}

export class UnrealProjectAssembler {
  assemble(input: AssemblyInput): AssemblyResult & EngineAssemblyResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    try {
      const REPO_ROOT = getResourceRoot();
      const TEMPLATE_DIR = join(REPO_ROOT, 'templates', 'unreal-metroidvania');
      if (!existsSync(TEMPLATE_DIR)) {
        return {
          success: false,
          projectPath: input.outputDir,
          engine: 'unreal',
          errors: [`Unreal template not found: ${TEMPLATE_DIR}`],
          warnings,
        };
      }
      mkdirSync(input.outputDir, { recursive: true });
      copyDir(TEMPLATE_DIR, input.outputDir);
      const pack = buildGameplayPack(input);
      writeSharedProjectData(input, pack);

      writeFileSync(
        join(input.outputDir, 'MetroForgeGame.uproject'),
        JSON.stringify(
          {
            FileVersion: 3,
            EngineAssociation: '5.8',
            Category: 'Games',
            Description: pack.title,
            Modules: [
              {
                Name: 'MetroForgeGame',
                Type: 'Runtime',
                LoadingPhase: 'Default',
              },
            ],
            Plugins: [
              { Name: 'Paper2D', Enabled: true },
              { Name: 'EnhancedInput', Enabled: true },
            ],
          },
          null,
          2,
        ),
      );

      const rawRoot = join(input.outputDir, 'Content', 'Raw');
      mkdirSync(rawRoot, { recursive: true });
      writeFileSync(join(rawRoot, 'gameplay.json'), JSON.stringify(pack, null, 2));

      const copyIntoRaw = (abs: string, rel: string) => {
        const dest = join(rawRoot, rel);
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(abs, dest);
      };
      if (input.textureFiles) {
        for (const [rel, buffer] of input.textureFiles) {
          const dest = join(rawRoot, rel);
          mkdirSync(dirname(dest), { recursive: true });
          writeFileSync(dest, buffer);
        }
      }
      for (const folder of ['assets/characters', 'assets/enemies', 'assets/bosses', 'assets/backgrounds', 'assets/tilesets']) {
        const src = join(input.outputDir, folder);
        if (!existsSync(src)) continue;
        const walk = (dir: string, prefix: string) => {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const next = join(dir, entry.name);
            const rel = `${prefix}/${entry.name}`.replace(/\\/g, '/');
            if (entry.isDirectory()) walk(next, rel);
            else copyIntoRaw(next, rel);
          }
        };
        walk(src, folder);
      }

      writeFileSync(
        join(input.outputDir, 'ENGINE.md'),
        [
          '# Unreal Engine 5.8 Paper2D slice',
          '',
          `Product: ${pack.title}`,
          'Supported editor: Unreal Engine 5.8 (Paper2D + Enhanced Input plugins enabled).',
          '',
          'Open MetroForgeGame.uproject, compile the C++ module, then Play.',
          'Gameplay data is Content/Raw/gameplay.json. Paper2D sprites are created at runtime from PNGs (point filtered, authored frame timing).',
          'Coordinates: Godot Y-down pixels become Unreal X/Z with 1px = 1uu. Unity does not share this convention.',
          '',
          'Statuses: generated only. compiled, opened, playtested, visual capture, and standalone builds are blocked until Unreal 5.8 is installed. Acceptance is OPEN.',
        ].join('\n'),
      );

      writeEngineManifest(input.outputDir, 'unreal', {
        blocked: ['UNREAL_EDITOR_NOT_AVAILABLE'],
        notes: [
          'Native Unreal: APawn, UBoxComponent, UPaperSpriteComponent, UCameraComponent ortho, JSON save',
          'Paper2D plugin enabled; sprites/flipbook frames built at runtime from PNG sheets',
          'Default map is the engine Template_Default; GameMode spawns the 2D slice on StartPlay',
          'Acceptance OPEN. generated only — compile/open/playtest/capture/standalone blocked until Unreal 5.8 is installed',
        ],
      });

      return {
        success: true,
        projectPath: input.outputDir,
        engine: 'unreal',
        errors,
        warnings,
      };
    } catch (err) {
      return {
        success: false,
        projectPath: input.outputDir,
        engine: 'unreal',
        errors: [err instanceof Error ? err.message : String(err)],
        warnings,
      };
    }
  }
}
