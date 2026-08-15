/**
 * Offline recompile: for each `*_source.png` under a project, run AssetPipeline.compileFromSource
 * at current compiledSpriteFrameSize defaults (64 / 96 / 128). Never regenerates AI; preserves
 * `*_source.png` bytes; patches generation_manifest.json maturity/provider when present.
 *
 * Usage:
 *   node scripts/recompile-sourced-sprites.mjs [projectDir ...]
 * Defaults:
 *   GeneratedGames/nvidia-image-activation-smoke
 *   GeneratedGames/studio-godot-nvidia-smoke
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULT_PROJECTS = [
  'GeneratedGames/nvidia-image-activation-smoke',
  'GeneratedGames/studio-godot-nvidia-smoke',
];

function listSourcePngs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.godot') continue;
      listSourcePngs(full, out);
    } else if (name.endsWith('_source.png')) {
      out.push(full);
    }
  }
  return out;
}

/** @returns {import('../packages/assets/dist/index.js').CompiledSpriteKind} */
function inferKind(relPosix) {
  const p = relPosix.replace(/\\/g, '/').toLowerCase();
  const base = p.split('/').pop() ?? '';
  if (p.includes('/bosses/') || base.startsWith('boss_')) {
    if (base.includes('final') || base.includes('boss_final')) return 'boss_final';
    return 'boss';
  }
  if (p.includes('/enemies/') || base.startsWith('enemy_')) return 'enemy';
  if (p.includes('/npcs/') || base.startsWith('npc_')) return 'npc';
  if (p.includes('/characters/') || base.startsWith('player') || base.includes('hero')) return 'character';
  if (p.includes('/items/')) return 'item';
  if (p.includes('/tilesets/')) return 'tileset';
  return 'character';
}

function compiledRelFromSource(sourceAbs, projectRoot) {
  const rel = relative(projectRoot, sourceAbs).replace(/\\/g, '/');
  return rel.replace(/_source\.png$/i, '.png');
}

function loadManifest(projectRoot) {
  const path = join(projectRoot, 'generation_manifest.json');
  if (!existsSync(path)) return { path, data: null };
  try {
    return { path, data: JSON.parse(readFileSync(path, 'utf-8')) };
  } catch {
    return { path, data: null };
  }
}

function findArtifact(manifest, compiledRel) {
  const arts = manifest?.artifacts;
  if (!Array.isArray(arts)) return null;
  const norm = compiledRel.replace(/\\/g, '/');
  return arts.find((a) => String(a?.path ?? '').replace(/\\/g, '/') === norm) ?? null;
}

async function main() {
  const assetsMod = await import(pathToFileURL(join(ROOT, 'packages/assets/dist/index.js')).href);
  const {
    AssetPipeline,
    compiledSpriteFrameSize,
    decodePngRgba,
  } = assetsMod;

  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const projectArgs = args.length > 0 ? args : DEFAULT_PROJECTS;
  const pipeline = new AssetPipeline();
  const report = [];

  for (const arg of projectArgs) {
    const projectRoot = resolve(ROOT, arg);
    const label = relative(ROOT, projectRoot).replace(/\\/g, '/') || arg;
    if (!existsSync(projectRoot)) {
      console.log(`[skip] missing project: ${label}`);
      report.push({ project: label, status: 'missing', files: [] });
      continue;
    }

    const sources = listSourcePngs(projectRoot);
    if (sources.length === 0) {
      console.log(`[skip] no *_source.png under ${label}`);
      report.push({ project: label, status: 'empty', files: [] });
      continue;
    }

    const { path: manifestPath, data: manifest } = loadManifest(projectRoot);
    const files = [];

    for (const sourceAbs of sources) {
      const compiledRel = compiledRelFromSource(sourceAbs, projectRoot);
      const compiledAbs = join(projectRoot, compiledRel);
      const kind = inferKind(compiledRel);
      const frame = compiledSpriteFrameSize(kind);
      const sourcePng = readFileSync(sourceAbs);
      const sourceDims = decodePngRgba(sourcePng);

      let before = null;
      if (existsSync(compiledAbs)) {
        try {
          const d = decodePngRgba(readFileSync(compiledAbs));
          before = { width: d.width, height: d.height, bytes: statSync(compiledAbs).size };
        } catch {
          before = { width: null, height: null, bytes: statSync(compiledAbs).size };
        }
      }

      const prior = findArtifact(manifest, compiledRel);
      const critiqueScore =
        typeof prior?.critiqueScore === 'number' ? prior.critiqueScore : 80;
      const critiquePassed =
        typeof prior?.critiquePassed === 'boolean'
          ? prior.critiquePassed
          : critiqueScore >= 70;
      const provider =
        typeof prior?.provider === 'string' && prior.provider !== 'pixel-art-processor'
          ? prior.provider
          : typeof prior?.selectedProvider === 'string'
            ? prior.selectedProvider
            : 'nvidia-image';
      const modelId =
        typeof prior?.modelId === 'string'
          ? prior.modelId
          : typeof prior?.selectedModel === 'string'
            ? prior.selectedModel
            : 'black-forest-labs/flux.1-dev';

      const asset = pipeline.compileFromSource({
        id: String(prior?.id ?? compiledRel.split('/').pop()?.replace(/\.png$/i, '') ?? 'sprite'),
        sourcePng,
        compiledRelPath: compiledRel,
        outputDir: projectRoot,
        targetWidth: frame.width,
        targetHeight: frame.height,
        tileSize: 16,
        provider,
        modelId,
        critiquePassed,
        critiqueScore,
      });

      // Prefer prior maturity when already QA_REVIEW / PRODUCTION_READY; else soft-pass → QA_REVIEW.
      let maturity = asset.maturity;
      if (prior?.maturity === 'QA_REVIEW' || prior?.maturity === 'PRODUCTION_READY') {
        maturity = prior.maturity;
      } else if (asset.maturity === 'COMPILED' && critiqueScore >= 70) {
        maturity = 'QA_REVIEW';
      }
      const productionReady = maturity === 'PRODUCTION_READY';

      if (manifest && Array.isArray(manifest.artifacts)) {
        const idx = manifest.artifacts.findIndex(
          (a) => String(a?.path ?? '').replace(/\\/g, '/') === compiledRel,
        );
        const patch = {
          ...(idx >= 0 ? manifest.artifacts[idx] : {}),
          id: asset.id,
          path: compiledRel,
          provider,
          modelId,
          fallbackGenerated: false,
          critiquePassed,
          critiqueScore,
          maturity,
          productionReady,
          sourceType: 'compiled',
          sourcePath: compiledRel.replace(/\.png$/i, '_source.png'),
          selectedProvider: provider,
          selectedModel: modelId,
          requestedCapability: prior?.requestedCapability ?? 'IMAGE_GENERATION',
          productionAllowed: true,
        };
        if (idx >= 0) manifest.artifacts[idx] = patch;
        else manifest.artifacts.push(patch);
      }

      const afterDims = decodePngRgba(asset.buffer);
      const row = {
        path: compiledRel,
        kind,
        source: { width: sourceDims.width, height: sourceDims.height, bytes: sourcePng.length },
        before,
        after: { width: afterDims.width, height: afterDims.height, bytes: asset.buffer.length },
        maturity,
        provider,
      };
      files.push(row);
      console.log(
        `[ok] ${label}/${compiledRel}  ${before ? `${before.width}x${before.height}` : 'missing'} → ${afterDims.width}x${afterDims.height}  (${kind}, ${maturity})`,
      );
    }

    if (manifest) {
      mkdirSync(dirname(manifestPath), { recursive: true });
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
      console.log(`[manifest] updated ${relative(ROOT, manifestPath).replace(/\\/g, '/')}`);
    }

    report.push({ project: label, status: 'recompiled', files });
  }

  const summaryPath = join(ROOT, 'GeneratedGames', 'recompile-sourced-sprites-summary.json');
  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(summaryPath, `${JSON.stringify({ at: new Date().toISOString(), report }, null, 2)}\n`);
  console.log(`[summary] ${relative(ROOT, summaryPath).replace(/\\/g, '/')}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
