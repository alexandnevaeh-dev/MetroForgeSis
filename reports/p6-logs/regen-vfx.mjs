/**
 * Regenerates the 8 PLACEHOLDER VFX via generateManualAsset → AssetPipeline → nvidia-image flux.1-dev.
 * Same path as characters. Does not touch player/tilesets.
 *
 * Usage: node reports/p6-logs/regen-vfx.mjs
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJECT = join(ROOT, 'GeneratedGames', 'heart-engine-release-candidate');
const TIMEOUT_MS = 180_000;

const VFX = [
  {
    id: 'hit_spark',
    effectType: 'impact_spark',
    whereUsed: ['HealthComponent.damage', 'EnemyController.melee', 'WeakFloor.break'],
    description:
      'tiny yellow-white hit spark burst, sharp combat shards, isolated pixel-art VFX, chroma-key magenta background, no character',
  },
  {
    id: 'death_puff',
    effectType: 'death_puff',
    whereUsed: ['HealthComponent.died'],
    description:
      'ashen smoke puff, evaporating death dissipate cloud, isolated pixel-art VFX, chroma-key magenta background, no skull',
  },
  {
    id: 'dash_trail',
    effectType: 'motion_streak',
    whereUsed: ['AirDashAbility', 'DashAbility', 'GrappleAbility'],
    description:
      'horizontal cyan motion streak, speed trail smear, isolated pixel-art VFX, chroma-key magenta background',
  },
  {
    id: 'pickup_spark',
    effectType: 'item_sparkle',
    whereUsed: ['ItemPickup.collect'],
    description:
      'gold four-point pickup sparkle, treasure collect twinkle, isolated pixel-art VFX, chroma-key magenta background',
  },
  {
    id: 'ability_unlock',
    effectType: 'ability_unlock',
    whereUsed: ['VFXManager.ability_acquired', 'PhaseAbility'],
    description:
      'pale cyan ability unlock burst, concentric energy rings, isolated pixel-art VFX, chroma-key magenta background',
  },
  {
    id: 'boss_phase_shift',
    effectType: 'phase_shift',
    whereUsed: ['VFXManager.play_phase_shift', 'BossController.phase'],
    description:
      'magenta-violet boss phase-shift shockwave, arcane ring flare, isolated pixel-art VFX, chroma-key magenta background, no creature',
  },
  {
    id: 'area_burst',
    effectType: 'area_burst',
    whereUsed: ['BossController.area_burst', 'EnemyController.area_burst'],
    description:
      'orange radial explosion burst, fire halo area-of-effect, isolated pixel-art VFX, chroma-key magenta background',
  },
  {
    id: 'slam_shock',
    effectType: 'ground_shock',
    whereUsed: ['BossController.slam', 'GroundSlamAbility'],
    description:
      'ground slam shockwave crescent, white-blue impact ring, isolated pixel-art VFX, chroma-key magenta background',
  },
];

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} aborted after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS);
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

async function main() {
  await import(pathToFileURL(join(ROOT, 'packages/shared/dist/index.js')).href);
  const { generateManualAsset } = await import(pathToFileURL(join(ROOT, 'packages/generation/dist/index.js')).href);
  const { decodePngRgba } = await import(pathToFileURL(join(ROOT, 'packages/assets/dist/index.js')).href);

  if (!process.env.NVIDIA_API_KEY) {
    throw new Error('NVIDIA_API_KEY missing from env/.env — aborting (will not invent a key)');
  }
  console.log('NVIDIA_API_KEY: present');
  console.log('project:', PROJECT);
  mkdirSync(join(PROJECT, 'assets', 'vfx'), { recursive: true });

  const inventory = [];
  for (let i = 0; i < VFX.length; i++) {
    const job = VFX[i];
    const rel = `assets/vfx/${job.id}.png`;
    const sourceRel = `assets/vfx/${job.id}_source.png`;
    unlinkQuiet(join(PROJECT, rel));
    unlinkQuiet(join(PROJECT, sourceRel));
    console.log(`\n=== ${i + 1}/8 generateManualAsset ${job.id} (vfx_texture) ===`);
    const started = Date.now();
    let lastErr;
    let result;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await withTimeout(
          generateManualAsset({
            projectPath: PROJECT,
            description: job.description,
            assetType: 'vfx_texture',
            assetId: job.id,
            seed: 184729 + i * 97 + attempt,
            generationMode: 'HYBRID_FREE',
            hardwareProfile: 'LOW_RESOURCE',
            nvidiaImageModel: process.env.NVIDIA_IMAGE_MODEL ?? 'black-forest-labs/flux.1-dev',
            transparentBackground: true,
          }),
          `${job.id} attempt ${attempt}`,
        );
        if (!result?.success) {
          lastErr = new Error(result?.errors?.join('; ') || 'failed');
          console.warn(lastErr.message);
          result = undefined;
          continue;
        }
        if (!(result.asset?.provider === 'nvidia-image' && result.asset?.fallbackGenerated === false)) {
          lastErr = new Error(`provider=${result.asset?.provider} fallback=${result.asset?.fallbackGenerated}`);
          console.warn(lastErr.message);
          result = undefined;
          continue;
        }
        break;
      } catch (err) {
        lastErr = err;
        console.warn(err instanceof Error ? err.message : String(err));
      }
    }
    if (!result?.success) {
      throw lastErr ?? new Error(`${job.id} failed`);
    }
    const abs = join(PROJECT, rel);
    const decoded = decodePngRgba(readFileSync(abs));
    let transparent = 0;
    for (let p = 3; p < decoded.rgba.length; p += 4) {
      if (decoded.rgba[p] < 16) transparent += 1;
    }
    const row = {
      id: job.id,
      path: rel,
      effectType: job.effectType,
      whereUsed: job.whereUsed,
      provider: result.asset.provider,
      modelId: result.asset.modelId,
      status: result.asset.maturity,
      fallbackGenerated: result.asset.fallbackGenerated,
      elapsedMs: Date.now() - started,
      width: decoded.width,
      height: decoded.height,
      transparentRatio: transparent / (decoded.width * decoded.height),
    };
    console.log(JSON.stringify(row, null, 2));
    inventory.push(row);
  }

  mkdirSync(join(ROOT, 'reports', 'p6-logs'), { recursive: true });
  writeFileSync(join(ROOT, 'reports', 'p6-logs', 'vfx-inventory.json'), JSON.stringify(inventory, null, 2));
  console.log('\nWrote reports/p6-logs/vfx-inventory.json');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
