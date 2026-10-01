/**
 * Regenerate player loco/combat sheets via blitArticulatedSheet / generate*Sheet helpers
 * (hip sway, arm opposition, compress; attack arcs; progression poses).
 *
 * Sheet-only — does not trash gens or run full Unity→Godot pipeline.
 *
 * Usage (from repo root, with MetroForgeData Node on PATH):
 *   node --import tsx packages/assets/src/write-player-loco-sheets.ts
 * Optional: METROFORGE_PATCH_PROJECT=<GeneratedGames/...> also patches that project's
 * assets/characters + player_animations.json (Spore Scout still preferred).
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeFrameQualityMetrics,
  decodePngRgba,
  extractSheetFramePng,
  generateAttackSheet,
  generateDeathSheet,
  generateHurtFlashSheet,
  generateProgressionSheet,
  generateRunCycleSheet,
  generateWalkCycleSheet,
  type SpriteSpec,
} from './png.js';
import {
  PLAYER_ANIMATION_SPEC,
  buildAnimationMetadataSidecar,
  type PlayerAnimationDefinition,
} from './player-animation-spec.js';
import { critiqueAnimationIdentity } from './sprite-qa.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');

const FRAME = 64;

interface KitTarget {
  label: string;
  stillPath: string;
  outDir: string;
  stillIsStrip?: boolean;
  /** When true, write full PLAYER_ANIMATION_SPEC family (not just walk/run). */
  fullFamily: boolean;
}

const kitTargets: KitTarget[] = [
  {
    label: 'authored-spore-scout',
    stillPath: join(here, '../authored/spore-scout/player.png'),
    outDir: join(here, '../authored/spore-scout'),
    fullFamily: true,
  },
  {
    label: 'authored-foundry-courier',
    stillPath: join(here, '../authored/foundry-courier/player.png'),
    outDir: join(here, '../authored/foundry-courier'),
    fullFamily: false,
  },
  {
    label: 'template-metroidvania',
    stillPath: join(repoRoot, 'templates/godot-metroidvania/assets/characters/player_idle.png'),
    outDir: join(repoRoot, 'templates/godot-metroidvania/assets/characters'),
    stillIsStrip: true,
    fullFamily: false,
  },
];

/** Ability / extended clips present in Player.tscn but outside core PLAYER_ANIMATION_SPEC. */
const EXTENDED_CLIPS: Array<{
  name: string;
  frameCount: number;
  fps: number;
  loop: boolean;
  poseKey: string;
  mode: 'ramp' | 'oscillate';
}> = [
  { name: 'air_dash', frameCount: 8, fps: 18, loop: false, poseKey: 'dash', mode: 'ramp' },
  { name: 'double_jump', frameCount: 8, fps: 14, loop: false, poseKey: 'jump', mode: 'ramp' },
  { name: 'ground_slam_start', frameCount: 6, fps: 12, loop: false, poseKey: 'jump_start', mode: 'ramp' },
  { name: 'ground_slam_fall', frameCount: 6, fps: 12, loop: false, poseKey: 'fall', mode: 'oscillate' },
  { name: 'ground_slam_impact', frameCount: 8, fps: 16, loop: false, poseKey: 'land', mode: 'ramp' },
  { name: 'swim_idle', frameCount: 8, fps: 8, loop: true, poseKey: 'swim', mode: 'oscillate' },
  { name: 'grapple', frameCount: 8, fps: 12, loop: false, poseKey: 'dash', mode: 'ramp' },
  { name: 'phase', frameCount: 8, fps: 12, loop: false, poseKey: 'idle', mode: 'oscillate' },
  { name: 'respawn', frameCount: 10, fps: 10, loop: false, poseKey: 'idle', mode: 'ramp' },
  { name: 'interact', frameCount: 6, fps: 10, loop: false, poseKey: 'idle', mode: 'ramp' },
  { name: 'ability_acquire', frameCount: 10, fps: 12, loop: false, poseKey: 'jump', mode: 'ramp' },
];

function loadStill(target: KitTarget): Buffer {
  const raw = readFileSync(target.stillPath);
  if (target.stillIsStrip) {
    return extractSheetFramePng(raw, FRAME, FRAME, 0);
  }
  return raw;
}

function baseSpec(label: string): SpriteSpec {
  return {
    id: `player_${label}`,
    width: FRAME,
    height: FRAME,
    fill: [80, 90, 100, 255],
  };
}

function writeSheet(outPath: string, buf: Buffer): void {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buf);
}

function generateCoreFamily(still: Buffer, spec: SpriteSpec, outDir: string): PlayerAnimationDefinition[] {
  const defs: PlayerAnimationDefinition[] = [];
  const walkDef = PLAYER_ANIMATION_SPEC.walk!;
  const runDef = PLAYER_ANIMATION_SPEC.run!;
  writeSheet(join(outDir, 'player_walk.png'), generateWalkCycleSheet(spec, walkDef.frameCount, still));
  writeSheet(join(outDir, 'player_run.png'), generateRunCycleSheet(spec, runDef.frameCount, still));
  defs.push(walkDef, runDef);

  for (const key of ['attack', 'attack_2', 'attack_3'] as const) {
    const def = PLAYER_ANIMATION_SPEC[key]!;
    writeSheet(
      join(outDir, `player_${key}.png`),
      generateAttackSheet(spec, def.frameCount, still, def.arcKind ?? 'horizontal'),
    );
    defs.push(def);
  }

  const hurtDef = PLAYER_ANIMATION_SPEC.hurt!;
  writeSheet(join(outDir, 'player_hurt.png'), generateHurtFlashSheet(spec, hurtDef.frameCount, still));
  defs.push(hurtDef);

  const deathDef = PLAYER_ANIMATION_SPEC.death!;
  writeSheet(join(outDir, 'player_death.png'), generateDeathSheet(spec, deathDef.frameCount, still));
  defs.push(deathDef);

  const progressionKeys = [
    'idle',
    'jump_start',
    'jump',
    'fall',
    'land',
    'dash',
    'wall_slide',
    'wall_jump',
    'swim',
  ] as const;
  for (const key of progressionKeys) {
    const def = PLAYER_ANIMATION_SPEC[key]!;
    writeSheet(
      join(outDir, `player_${key}.png`),
      generateProgressionSheet(spec, def.poseKey ?? def.name, def.frameCount, still, {
        mode: def.mode === 'progression-oscillate' ? 'oscillate' : 'ramp',
        tintPulse: def.name === 'idle' ? 6 : undefined,
      }),
    );
    defs.push(def);
  }

  return defs;
}

function generateExtendedFamily(still: Buffer, spec: SpriteSpec, outDir: string): void {
  for (const clip of EXTENDED_CLIPS) {
    writeSheet(
      join(outDir, `player_${clip.name}.png`),
      generateProgressionSheet(spec, clip.poseKey, clip.frameCount, still, {
        mode: clip.mode,
      }),
    );
  }
}

function writeSidecar(outDir: string, defs: PlayerAnimationDefinition[]): void {
  const sidecar = buildAnimationMetadataSidecar(defs);
  for (const clip of EXTENDED_CLIPS) {
    sidecar[clip.name] = {
      frameCount: clip.frameCount,
      fps: clip.fps,
      loop: clip.loop,
      rootMotionMode: 'none',
    };
  }
  // Prefer real sheet widths when files already exist (guards against drift).
  for (const name of Object.keys(sidecar)) {
    const path = join(outDir, `player_${name}.png`);
    if (!existsSync(path)) continue;
    const decoded = decodePngRgba(readFileSync(path));
    const frames = Math.max(1, Math.round(decoded.width / FRAME));
    const entry = sidecar[name]!;
    const specDuration = entry.frameCount / Math.max(1, entry.fps);
    entry.frameCount = frames;
    entry.fps = Math.max(6, Math.round(frames / Math.max(0.05, specDuration)));
  }
  writeFileSync(join(outDir, 'player_animations.json'), JSON.stringify(sidecar, null, 2));
}

function certifySheet(label: string, path: string, kind: string, expectedFrames: number): boolean {
  if (!existsSync(path)) {
    console.warn(`[cert] missing ${label}: ${path}`);
    return false;
  }
  const buf = readFileSync(path);
  const identity = critiqueAnimationIdentity(buf, {
    frameWidth: FRAME,
    expectedFrames,
    kind,
  });
  const decoded = decodePngRgba(buf);
  const metrics = computeFrameQualityMetrics(decoded.rgba, FRAME, FRAME, expectedFrames);
  const ok = !identity.fakeAnimation && metrics.uniqueFrameRatio >= 0.5;
  console.log(
    `[cert] ${label}: fake=${identity.fakeAnimation} unique=${metrics.uniqueFrameRatio.toFixed(2)} frames=${expectedFrames} ${ok ? 'OK' : 'FAIL'}`,
  );
  return ok;
}

function writeLocoOnly(target: KitTarget): void {
  if (!existsSync(target.stillPath)) {
    console.warn(`[skip] missing still for ${target.label}: ${target.stillPath}`);
    return;
  }
  const still = loadStill(target);
  const spec = baseSpec(target.label);
  const walkFrames = PLAYER_ANIMATION_SPEC.walk!.frameCount;
  const runFrames = PLAYER_ANIMATION_SPEC.run!.frameCount;
  writeSheet(join(target.outDir, 'player_walk.png'), generateWalkCycleSheet(spec, walkFrames, still));
  writeSheet(join(target.outDir, 'player_run.png'), generateRunCycleSheet(spec, runFrames, still));
  console.log(`Wrote ${target.label}: walk ${walkFrames}f + run ${runFrames}f → ${target.outDir}`);
}

function writeFullKit(target: KitTarget): void {
  if (!existsSync(target.stillPath)) {
    console.warn(`[skip] missing still for ${target.label}: ${target.stillPath}`);
    return;
  }
  const still = loadStill(target);
  const spec = baseSpec(target.label);
  copyFileSync(target.stillPath, join(target.outDir, 'player.png'));
  const defs = generateCoreFamily(still, spec, target.outDir);
  generateExtendedFamily(still, spec, target.outDir);
  writeSidecar(target.outDir, defs);
  console.log(`Wrote full family for ${target.label} → ${target.outDir}`);
}

function patchProject(projectRoot: string, stillPath: string): void {
  const outDir = join(projectRoot, 'assets', 'characters');
  if (!existsSync(outDir)) {
    throw new Error(`project characters dir missing: ${outDir}`);
  }
  if (!existsSync(stillPath)) {
    throw new Error(`still missing: ${stillPath}`);
  }
  const still = readFileSync(stillPath);
  const spec = baseSpec('project-spore-scout');
  writeFileSync(join(outDir, 'player.png'), still);
  const defs = generateCoreFamily(still, spec, outDir);
  generateExtendedFamily(still, spec, outDir);
  writeSidecar(outDir, defs);

  const walkOk = certifySheet('walk', join(outDir, 'player_walk.png'), 'walk', PLAYER_ANIMATION_SPEC.walk!.frameCount);
  const runOk = certifySheet('run', join(outDir, 'player_run.png'), 'run', PLAYER_ANIMATION_SPEC.run!.frameCount);
  const attackOk = certifySheet(
    'attack',
    join(outDir, 'player_attack.png'),
    'attack',
    PLAYER_ANIMATION_SPEC.attack!.frameCount,
  );
  if (!walkOk || !runOk || !attackOk) {
    throw new Error('Animation certification failed after patch — sheets still look bob/slide or low uniqueness');
  }
  console.log(`Patched project sheets + sidecar: ${outDir}`);
}

for (const target of kitTargets) {
  if (target.fullFamily) writeFullKit(target);
  else writeLocoOnly(target);
}

const patchEnv = process.env.METROFORGE_PATCH_PROJECT?.trim();
const defaultSporeProject = join(repoRoot, 'GeneratedGames', 'vvs-godot-spore-galleries-20260926b');
const projectToPatch = patchEnv
  ? patchEnv.match(/^[A-Za-z]:[\\/]/) || patchEnv.startsWith('/')
    ? patchEnv
    : join(repoRoot, patchEnv)
  : existsSync(defaultSporeProject)
    ? defaultSporeProject
    : null;

if (projectToPatch) {
  patchProject(projectToPatch, join(here, '../authored/spore-scout/player.png'));
}

console.log(
  'Done. Pipeline path: asset-pipeline buildWalkSheetAsset/buildRunSheetAsset → generateWalkCycleSheet/generateRunCycleSheet.',
);
