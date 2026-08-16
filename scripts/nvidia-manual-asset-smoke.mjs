/**
 * Bounded Manual Generator smoke: generateManualAsset → nvidia-image (flux.1-dev).
 * No GenerationPipeline / TINY_TEST full run.
 *
 * Usage:
 *   node scripts/nvidia-manual-asset-smoke.mjs [--enemy]
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = join(ROOT, 'GeneratedGames', 'nvidia-image-activation-smoke');
const TIMEOUT_MS = 180_000;

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} aborted after ${TIMEOUT_MS / 1000}s`)),
      TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function unlinkQuiet(p) {
  try {
    if (existsSync(p)) unlinkSync(p);
  } catch {
    /* ignore */
  }
}

function pngDims(decodePngRgba, absPath) {
  if (!existsSync(absPath)) return null;
  const buf = readFileSync(absPath);
  const decoded = decodePngRgba(buf);
  return { width: decoded.width, height: decoded.height, bytes: buf.length };
}

/** Reject solid-black / empty NVIDIA artifacts (seen on flaky NVCF responses). */
function sourceContentOk(decodePngRgba, absPath) {
  if (!existsSync(absPath)) return { ok: false, reason: 'missing source' };
  const buf = readFileSync(absPath);
  if (buf.length < 20_000) return { ok: false, reason: `source too small (${buf.length} B)` };
  const decoded = decodePngRgba(buf);
  const rgba = decoded.rgba;
  let nonBlack = 0;
  const pixels = decoded.width * decoded.height;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const a = rgba[i + 3];
    if (a > 16 && (r > 8 || g > 8 || b > 8)) nonBlack += 1;
  }
  const ratio = nonBlack / pixels;
  if (ratio < 0.01) return { ok: false, reason: `blank/black source (nonBlack ratio ${ratio.toFixed(4)})` };
  return { ok: true, reason: `nonBlack ratio ${ratio.toFixed(4)}`, ratio, bytes: buf.length };
}

async function main() {
  await import(pathToFileURL(join(ROOT, 'packages/shared/dist/index.js')).href);
  const { generateManualAsset } = await import(
    pathToFileURL(join(ROOT, 'packages/generation/dist/index.js')).href
  );
  const { decodePngRgba } = await import(
    pathToFileURL(join(ROOT, 'packages/assets/dist/index.js')).href
  );

  if (!process.env.NVIDIA_API_KEY) {
    throw new Error('NVIDIA_API_KEY missing from env/.env — aborting (will not invent a key)');
  }
  console.log('NVIDIA_API_KEY: present');
  console.log('NVIDIA_IMAGE_MODEL:', process.env.NVIDIA_IMAGE_MODEL ?? '(provider default)');
  console.log('project:', PROJECT);

  mkdirSync(join(PROJECT, 'assets', 'characters'), { recursive: true });
  mkdirSync(join(PROJECT, 'assets', 'enemies'), { recursive: true });

  const includeEnemy = process.argv.includes('--enemy');
  const enemyOnly = process.argv.includes('--enemy-only');
  const jobs = [];
  if (!enemyOnly) {
    jobs.push({
      assetId: 'nvidia_activation_player',
      assetType: 'player_sprite',
      description:
        'Side-view metroidvania player hero in glowing ember armor, clear readable silhouette, colorful pixel-art character on plain light gray backdrop',
    });
  }
  if (includeEnemy || enemyOnly) {
    jobs.push({
      assetId: 'nvidia_activation_moth',
      assetType: 'enemy',
      description:
        'Cute stylized moth creature with orange wings, side-view game enemy sprite, bright colors on light gray backdrop, family-friendly fantasy insect',
    });
  }

  const results = [];
  for (const job of jobs) {
    console.log(`\n=== generateManualAsset ${job.assetId} (${job.assetType}) ===`);
    const started = Date.now();
    const compiledRelGuess =
      job.assetType === 'player_sprite'
        ? `assets/characters/${job.assetId}.png`
        : `assets/enemies/${job.assetId}.png`;
    const sourceRelGuess = compiledRelGuess.replace(/\.png$/i, '_source.png');

    let result;
    let contentCheck = { ok: false, reason: 'not run' };
    const maxAttempts = 3;
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Remove prior compiled/source so IP-adapter does not condition on a blank black PNG.
      unlinkQuiet(join(PROJECT, compiledRelGuess));
      unlinkQuiet(join(PROJECT, sourceRelGuess));
      try {
        console.log(`attempt ${attempt}/${maxAttempts}`);
        result = await withTimeout(
          generateManualAsset({
            projectPath: PROJECT,
            description: job.description,
            assetType: job.assetType,
            assetId: job.assetId,
            seed: 100 + attempt * 17,
            generationMode: 'HYBRID_FREE',
            hardwareProfile: 'LOW_RESOURCE',
            nvidiaImageModel: process.env.NVIDIA_IMAGE_MODEL ?? 'black-forest-labs/flux.1-dev',
          }),
          `${job.assetId} attempt ${attempt}`,
        );
        if (!result?.success) {
          lastErr = new Error(result?.errors?.join('; ') || 'generateManualAsset failed');
          console.warn(lastErr.message);
          result = undefined;
          continue;
        }
        if (!(result?.asset?.provider === 'nvidia-image' && result?.asset?.fallbackGenerated === false)) {
          lastErr = new Error(
            `got provider=${result?.asset?.provider} fallback=${result?.asset?.fallbackGenerated}` +
              (result?.errors?.length ? ` errors=${result.errors.join('; ')}` : ''),
          );
          console.warn(lastErr.message);
          result = undefined;
          continue;
        }
        const sourceAbs = join(
          PROJECT,
          result.asset.sourcePath ?? sourceRelGuess,
        );
        contentCheck = sourceContentOk(decodePngRgba, sourceAbs);
        console.log('content check:', contentCheck);
        if (contentCheck.ok) break;
        lastErr = new Error(contentCheck.reason);
        result = undefined;
      } catch (err) {
        lastErr = err;
        console.warn(`attempt ${attempt} error:`, err instanceof Error ? err.message : err);
      }
      if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 5000));
    }

    if (!result) {
      console.error(`FAIL ${job.assetId}:`, lastErr instanceof Error ? lastErr.message : lastErr);
      results.push({
        ...job,
        success: false,
        error: lastErr instanceof Error ? lastErr.message : String(lastErr),
        elapsedMs: Date.now() - started,
      });
      continue;
    }

    const elapsedMs = Date.now() - started;
    const asset = result.asset;
    const compiledRel = asset.path ?? compiledRelGuess;
    const sourceRel = asset.sourcePath ?? sourceRelGuess;
    const entry = {
      ...job,
      success: Boolean(result.success),
      errors: result.errors ?? [],
      warnings: result.warnings ?? [],
      elapsedMs,
      provider: asset.provider,
      modelId: asset.modelId,
      maturity: asset.maturity,
      sourceType: asset.sourceType,
      fallbackGenerated: asset.fallbackGenerated,
      critiquePassed: asset.critiquePassed,
      critiqueScore: asset.critiqueScore,
      productionReady: asset.productionReady,
      compiledRel,
      sourceRel,
      compiled: pngDims(decodePngRgba, join(PROJECT, compiledRel)),
      source: pngDims(decodePngRgba, join(PROJECT, sourceRel)),
      contentCheck,
    };
    results.push(entry);
    console.log(JSON.stringify(entry, null, 2));
  }

  const summaryPath = join(PROJECT, 'activation_manual_smoke_summary.json');
  const summary = {
    at: new Date().toISOString(),
    project: 'GeneratedGames/nvidia-image-activation-smoke',
    model: process.env.NVIDIA_IMAGE_MODEL ?? 'black-forest-labs/flux.1-dev',
    path: 'generateManualAsset / HYBRID_FREE / LOW_RESOURCE',
    results,
  };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log('\nWrote', summaryPath);

  const ok = results.some(
    (r) =>
      r.success &&
      r.provider === 'nvidia-image' &&
      r.fallbackGenerated === false &&
      r.compiled?.width === 64 &&
      r.compiled?.height === 64 &&
      r.source &&
      r.source.bytes >= 20_000 &&
      r.contentCheck?.ok &&
      (r.maturity === 'QA_REVIEW' || r.maturity === 'GENERATED_SOURCE'),
  );
  if (!ok) {
    console.error('Smoke did not meet success criteria (nvidia-image, non-blank source, 64x64, maturity)');
    process.exitCode = 1;
  } else {
    console.log('SMOKE PASS');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
