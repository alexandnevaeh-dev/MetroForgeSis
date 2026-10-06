import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getResourceRoot } from '@metroforge/shared';
import type { AssemblyInput, AssemblyResult } from '@metroforge/godot';
import {
  buildGameplayPack,
  writeEngineManifest,
  writeSharedProjectData,
  type EngineAssemblyResult,
} from '@metroforge/engines';
import { folderMeta, pngTextureLimit, pngSpriteMeta, scriptMeta, unityGuid } from './meta.js';
import { unityProjectSettings } from './project-files.js';
import { worldSceneYaml } from './scene.js';


function writeWithMeta(path: string, contents: string | Buffer, meta: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  writeFileSync(`${path}.meta`, meta);
}

export class UnityProjectAssembler {
  assemble(input: AssemblyInput): AssemblyResult & EngineAssemblyResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    try {
      const REPO_ROOT = getResourceRoot();
      const TEMPLATE_DIR = join(REPO_ROOT, 'templates', 'unity-metroidvania');
      if (!existsSync(TEMPLATE_DIR)) {
        return {
          success: false,
          projectPath: input.outputDir,
          engine: 'unity',
          errors: [`Unity template not found: ${TEMPLATE_DIR}`],
          warnings,
        };
      }

      mkdirSync(input.outputDir, { recursive: true });
      const pack = buildGameplayPack(input);
      writeSharedProjectData(input, pack);

      const bootstrapGuid = unityGuid('script:GameBootstrap.cs');
      const sceneGuid = unityGuid('scene:World.unity');
      const productGuid = unityGuid(`product:${pack.title}:${pack.seed}`);

      for (const [rel, contents] of Object.entries(unityProjectSettings(pack.title, productGuid, sceneGuid))) {
        const dest = join(input.outputDir, rel);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, contents);
      }

      mkdirSync(join(input.outputDir, 'Assets'), { recursive: true });
      writeFileSync(join(input.outputDir, 'Assets.meta'), folderMeta(unityGuid('folder:Assets')));
      writeFileSync(join(input.outputDir, 'Assets/Scripts.meta'), folderMeta(unityGuid('folder:Assets/Scripts')));
      writeFileSync(join(input.outputDir, 'Assets/Scenes.meta'), folderMeta(unityGuid('folder:Assets/Scenes')));
      writeFileSync(
        join(input.outputDir, 'Assets/StreamingAssets.meta'),
        folderMeta(unityGuid('folder:Assets/StreamingAssets')),
      );
      writeFileSync(join(input.outputDir, 'Assets/Art.meta'), folderMeta(unityGuid('folder:Assets/Art')));

      const scriptsDir = join(TEMPLATE_DIR, 'Assets', 'Scripts');
      for (const name of readdirSync(scriptsDir)) {
        if (!name.endsWith('.cs')) continue;
        const src = join(scriptsDir, name);
        const dest = join(input.outputDir, 'Assets', 'Scripts', name);
        const guid = name === 'GameBootstrap.cs' ? bootstrapGuid : unityGuid(`script:${name}`);
        writeWithMeta(dest, readFileSync(src), scriptMeta(guid));
      }

      const editorDir = join(TEMPLATE_DIR, 'Assets', 'Editor');
      if (existsSync(editorDir)) {
        writeFileSync(join(input.outputDir, 'Assets/Editor.meta'), folderMeta(unityGuid('folder:Assets/Editor')));
        for (const name of readdirSync(editorDir)) {
          if (!name.endsWith('.cs')) continue;
          writeWithMeta(
            join(input.outputDir, 'Assets', 'Editor', name),
            readFileSync(join(editorDir, name)),
            scriptMeta(unityGuid(`script:Editor/${name}`)),
          );
        }
      }

      writeWithMeta(
        join(input.outputDir, 'Assets/Scenes/World.unity'),
        worldSceneYaml(bootstrapGuid),
        `fileFormatVersion: 2
guid: ${sceneGuid}
DefaultImporter:
  externalObjects: {}
  userData: 
  assetBundleName: 
  assetBundleVariant: 
`,
      );

      mkdirSync(join(input.outputDir, 'Assets', 'StreamingAssets'), { recursive: true });
      writeFileSync(
        join(input.outputDir, 'Assets', 'StreamingAssets', 'gameplay.json'),
        JSON.stringify(pack, null, 2),
      );

      // Runtime catalogs must ship in players, not only beside the editor project.
      for (const relative of ['items/items.json', 'loot/loot_tables.json', 'enemies/enemies.json', 'npcs/npcs.json', 'dialogues/dialogues.json', 'quests/quests.json', 'shops/shops.json']) {
        const source = join(input.outputDir, 'data', relative);
        if (!existsSync(source)) continue;
        const target = join(input.outputDir, 'Assets', 'StreamingAssets', 'data', relative);
        mkdirSync(dirname(target), { recursive: true });
        cpSync(source, target);
      }

      const spriteMeta = (rel: string, buffer: Buffer) =>
        pngSpriteMeta(unityGuid(`art:${rel}`), 1, {
          filterMode: rel.includes('/backgrounds/') ? 1 : 0,
          maxTextureSize: pngTextureLimit(buffer),
          spriteMeshType: 0,
          spriteExtrude: 0,
        });

      const copyArt = (rel: string, buffer: Buffer) => {
        const streamDest = join(input.outputDir, 'Assets', 'StreamingAssets', rel);
        mkdirSync(dirname(streamDest), { recursive: true });
        writeFileSync(streamDest, buffer);
        const artDest = join(input.outputDir, 'Assets', 'Art', rel);
        if (rel.endsWith('.png')) writeWithMeta(artDest, buffer, spriteMeta(rel, buffer));
        else { mkdirSync(dirname(artDest), { recursive: true }); writeFileSync(artDest, buffer); }
      };

      // Native adapters receive the same versioned side-view default material.
      // Generated project artwork may override these bytes below.
      const castleMasonry = join(REPO_ROOT, 'templates', 'godot-metroidvania', 'assets', 'architecture', 'stormglass', 'masonry-fill-v1.png');
      if (input.gameDna.archetype === 'SIDE_VIEW_METROIDVANIA' && existsSync(castleMasonry))
        copyArt('assets/architecture/stormglass/masonry-fill-v1.png', readFileSync(castleMasonry));
      if (input.textureFiles) {
        for (const [rel, buffer] of input.textureFiles) {
          if (rel.endsWith('.png') || rel.endsWith('.json')) copyArt(rel, buffer);
        }
      }

      const sharedArt = ['assets/characters', 'assets/enemies', 'assets/npcs', 'assets/backgrounds', 'assets/tilesets', 'assets/bosses', 'assets/props', 'assets/vfx', 'assets/ui'];
      for (const folder of sharedArt) {
        const src = join(input.outputDir, folder);
        if (!existsSync(src)) continue;
        const walk = (dir: string, prefix: string) => {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const next = join(dir, entry.name);
            const rel = `${prefix}/${entry.name}`.replace(/\\/g, '/');
            if (entry.isDirectory()) walk(next, rel);
            else if (entry.name.endsWith('.png') || entry.name.endsWith('.json')) {
              const streamDest = join(input.outputDir, 'Assets', 'StreamingAssets', rel);
              mkdirSync(dirname(streamDest), { recursive: true });
              cpSync(next, streamDest);
              if (entry.name.endsWith('.png')) {
                writeWithMeta(
                  join(input.outputDir, 'Assets', 'Art', rel),
                  readFileSync(next),
                  spriteMeta(rel, readFileSync(next)),
                );
              }
            }
          }
        };
        walk(src, folder);
      }

      const v2Pack = join(REPO_ROOT, 'test-packs', 'conduit-foundry-heat-v2');
      const v1Pack = join(REPO_ROOT, 'test-packs', 'conduit-foundry-heat');
      const heatPack = input.externalVisualPack === 'conduit-foundry-heat-v2' ? v2Pack : v1Pack;
      const heatCompiled = join(heatPack, 'compiled');
      const heatSelected = input.externalVisualPack === 'conduit-foundry-heat' || input.externalVisualPack === 'conduit-foundry-heat-v2';
      if (heatSelected && existsSync(join(heatPack, 'manifest.json')) && existsSync(heatCompiled)) {
        const walkOverlay = (dir: string, prefix: string) => {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const next = join(dir, entry.name);
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walkOverlay(next, rel);
            else if (entry.name.endsWith('.png')) copyArt(rel, readFileSync(next));
            else if (entry.name.endsWith('.json')) {
              const streamDest = join(input.outputDir, 'Assets', 'StreamingAssets', rel);
              mkdirSync(dirname(streamDest), { recursive: true });
              writeFileSync(streamDest, readFileSync(next));
            }
          }
        };
        walkOverlay(heatCompiled, '');
        warnings.push(
          heatPack === v2Pack
            ? 'UNITY_VISUAL_PACK overlay: conduit-foundry-heat-v2'
            : 'UNITY_VISUAL_PACK overlay: conduit-foundry-heat',
        );
      }

      writeFileSync(
        join(input.outputDir, 'ENGINE.md'),
        [
          '# Unity 6.3 LTS slice',
          '',
          `Product: ${pack.title}`,
          'Supported editor: Unity 6.3 LTS (6000.3).',
          '',
          'Open: Unity Hub → Add project → this folder, then open World scene and press Play.',
          'CLI: `metroforge open <slug>` after generation with `--engine unity`.',
          '',
          'Statuses: generated only. compiled, opened, playtested, visual capture, and standalone builds are blocked until Unity 6.3 LTS is installed. Acceptance is OPEN.',
        ].join('\n'),
      );

      writeEngineManifest(input.outputDir, 'unity', {
        blocked: ['UNITY_EDITOR_NOT_AVAILABLE'],
        notes: [
          'Native Unity 2D: Rigidbody2D, BoxCollider2D, SpriteRenderer, Canvas HUD, JSON save',
          'Sprites load from StreamingAssets with point filtering and authored frame timing',
          '1 Unity unit = 1 Godot pixel; Y is converted from Godot Y-down',
          'Acceptance OPEN. generated only — compile/open/playtest/capture/standalone blocked until Unity 6.3 LTS is installed',
        ],
      });

      return {
        success: true,
        projectPath: input.outputDir,
        engine: 'unity',
        errors,
        warnings,
      };
    } catch (err) {
      return {
        success: false,
        projectPath: input.outputDir,
        engine: 'unity',
        errors: [err instanceof Error ? err.message : String(err)],
        warnings,
      };
    }
  }
}
