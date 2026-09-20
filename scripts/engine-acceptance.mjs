#!/usr/bin/env node
/**
 * Unity / Unreal engine acceptance orchestrator.
 * Generation-level checks run without editors. Compile/open/play/capture/standalone
 * require UNITY_EDITOR / UE_ROOT and are recorded blocked when missing.
 * Does not install engines. Does not restart Godot capture jobs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { nativeBuildPlan, playtestPassed, freshCaptureEvidence } from './lib/engine-acceptance-platform.mjs';
import { fileURLToPath } from 'node:url';
import { validateForeignEngineProject } from '../packages/qa/dist/engine-validator.js';
import { resolveUnityEditor, resolveUnrealEditor } from '../packages/tools/dist/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const reviewDir = process.env.METROFORGE_ENGINE_REPORT_DIR || join(root, 'review-artifacts');
const unityProject = process.env.METROFORGE_UNITY_TEST_PROJECT || join(root, 'GeneratedGames', 'conduit-foundry-unity');
const unrealProject = process.env.METROFORGE_UNREAL_TEST_PROJECT || join(root, 'GeneratedGames', 'conduit-foundry-unreal');

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf-8',
    timeout: opts.timeout ?? 15000,
    cwd: opts.cwd ?? root,
    env: process.env,
  });
}

function probe() {
  const unity = resolveUnityEditor({ envPath: process.env.UNITY_EDITOR ?? process.env.UNITY_PATH });
  const unreal = resolveUnrealEditor({ envPath: process.env.UE_ROOT ?? process.env.UNREAL_ENGINE });
  const xcode = process.platform === 'darwin' ? sh('xcodebuild', ['-version']) : null;
  return {
    recordedAt: new Date().toISOString(),
    os: `${platform()} ${release()}`, arch: arch(), cpu: cpus()[0]?.model ?? 'unknown',
    ramGB: totalmem() / (1024 ** 3),
    xcode: { xcodebuild: xcode ? (xcode.stdout?.trim() || xcode.error?.message || 'not installed') : 'not applicable' },
    unity, unreal,
  };
}

function generationCheck(projectPath, engine) {
  const report = validateForeignEngineProject(projectPath, engine);
  const blocking = report.results.filter((r) => r.state !== 'SKIPPED');
  const skipped = report.results.filter((r) => r.state === 'SKIPPED').map((r) => r.gate);
  const record = {
    engine,
    scope: 'generation-level-only',
    generated: report.passed,
    compiled: false,
    opened: false,
    playtested: false,
    visualCapture: false,
    standaloneBuild: false,
    acceptance: 'open',
    blocked:
      engine === 'unity' ? ['UNITY_EDITOR_NOT_AVAILABLE'] : ['UNREAL_EDITOR_NOT_AVAILABLE'],
    passedBlockingGates: report.passed,
    skippedGates: skipped,
    results: report.results,
    timestamp: new Date().toISOString(),
    note: 'Static file/pack checks only. Not compile, editor launch, playtest, capture, or standalone proof.',
  };
  if (!existsSync(projectPath)) return { passed: false, missing: true };
  const outDir = join(projectPath, 'qa');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'engine-status.json'), JSON.stringify(record, null, 2));
  return { blockingPassed: blocking.filter((r) => r.passed).length, blockingTotal: blocking.length, skipped, passed: report.passed };
}

function runUnityStage(unityBin, method, extraArgs, logName, timeoutMs, graphics) {
  const args = [
    '-projectPath',
    unityProject,
    '-logFile',
    join(unityProject, 'qa', logName),
    '-executeMethod',
    method,
    ...extraArgs,
  ];
  if (!graphics) args.unshift('-batchmode', '-nographics', '-quit');
  else args.unshift('-batchmode');
  mkdirSync(join(unityProject, 'qa'), { recursive: true });
  return spawnSync(unityBin, args, { encoding: 'utf-8', timeout: timeoutMs, cwd: root });
}

function runUnrealCompile(editorPath) {
  const plan = nativeBuildPlan(process.platform, editorPath, unrealProject);
  mkdirSync(join(unrealProject, 'qa'), { recursive: true });
  if (process.platform === 'win32') {
    // cmd is required for Epic's batch entry point. Reject shell metacharacters
    // in paths rather than accepting an injectable command line.
    if ([plan.command, ...plan.args].some((value) => /["%\r\n&|<>^!]/.test(value))) {
      return { status: 1, stderr: 'Unsafe characters in Unreal build path.' };
    }
    const command = `"${plan.command}" ${plan.args.map((arg) => `"${arg}"`).join(' ')}`;
    return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${command}"`], {
      encoding: 'utf-8', timeout: 45 * 60 * 1000, cwd: root, windowsHide: true,
    });
  }
  return spawnSync(plan.command, plan.args, { encoding: 'utf-8', timeout: 45 * 60 * 1000, cwd: root });
}

const env = probe();
mkdirSync(reviewDir, { recursive: true });
writeFileSync(join(reviewDir, 'ENGINE_ENV.json'), JSON.stringify(env, null, 2));

const unityGen = generationCheck(unityProject, 'unity');
const unrealGen = generationCheck(unrealProject, 'unreal');

const unityReady = Boolean(env.unity.path);
const unrealReady = Boolean(env.unreal.path);
const stages = {
  unity: {
    generated: unityGen.passed ? 'passed' : 'failed',
    compiled: unityReady ? 'pending' : 'blocked',
    opened: unityReady ? 'pending' : 'blocked',
    playtested: unityReady ? 'pending' : 'blocked',
    visualCapture: unityReady ? 'pending' : 'blocked',
    standaloneBuild: unityReady ? 'pending' : 'blocked',
    blocked: unityReady ? [] : ['UNITY_EDITOR_NOT_AVAILABLE'],
  },
  unreal: {
    generated: unrealGen.passed ? 'passed' : 'failed',
    compiled: unrealReady ? 'pending' : 'blocked',
    opened: unrealReady ? 'pending' : 'blocked',
    playtested: unrealReady ? 'pending' : 'blocked',
    visualCapture: unrealReady ? 'pending' : 'blocked',
    standaloneBuild: unrealReady ? 'pending' : 'blocked',
    blocked: unrealReady
      ? []
      : [
          'UNREAL_EDITOR_NOT_AVAILABLE',
          ...(process.platform === 'darwin' && env.xcode.xcodebuild === 'not installed' ? ['XCODE_APP_NOT_INSTALLED'] : []),
          ...(env.ramGB < 16 ? ['UNREAL_RAM_BELOW_PRACTICAL'] : []),
        ],
  },
};

if (unityReady && unityGen.passed) {
  mkdirSync(join(unityProject, 'qa'), { recursive: true });
  const compile = runUnityStage(env.unity.path, 'MetroForgeAcceptance.CompileOnly', [], 'unity-compile.log', 20 * 60 * 1000, false);
  stages.unity.compiled = compile.status === 0 ? 'passed' : 'failed';
  stages.unity.compileExit = compile.status;
  if (compile.status === 0) {
    const playStartedAt = Date.now();
    const play = runUnityStage(
      env.unity.path,
      'MetroForgeAcceptance.RunAll',
      ['-acceptance', '-acceptanceMode=all', '-acceptanceTimeout=180'],
      'unity-play.log',
      12 * 60 * 1000,
      true,
    );
    const resultPath = join(unityProject, 'qa', 'acceptance-result.json');
    let playReport = null;
    try { playReport = { data: JSON.parse(readFileSync(resultPath, 'utf-8')), modifiedAt: statSync(resultPath).mtimeMs }; } catch { /* Missing or malformed evidence fails. */ }
    stages.unity.playtested = playtestPassed(play.status, playReport, playStartedAt) ? 'passed' : 'failed';
    stages.unity.visualCapture = freshCaptureEvidence(playReport, playStartedAt, join(unityProject, 'qa', 'captures')) ? 'pending_review' : 'failed';
    const build = runUnityStage(env.unity.path, `MetroForgeBuild.${nativeBuildPlan(process.platform, '', unityProject).unityMethod}`, [], 'unity-standalone.log', 25 * 60 * 1000, false);
    stages.unity.standaloneBuild = build.status === 0 ? 'passed' : 'failed';
    stages.unity.opened = stages.unity.playtested === 'passed' ? 'passed' : 'failed';
  }
}

if (unrealReady && unrealGen.passed) {
  const compile = runUnrealCompile(env.unreal.path);
  stages.unreal.compiled = compile.status === 0 ? 'passed' : 'failed';
  stages.unreal.compileExit = compile.status;
  writeFileSync(join(unrealProject, 'qa', 'unreal-compile.log'), `${compile.stdout}\n${compile.stderr}`);
}

const previousPath = join(reviewDir, 'ENGINE_ACCEPTANCE.json');
const previous = existsSync(previousPath) ? JSON.parse(readFileSync(previousPath, 'utf-8')) : {};

const acceptance = {
  ...previous,
  acceptance: 'open',
  recordedAt: new Date().toISOString(),
  host: {
    ...(previous.host ?? {}),
    os: env.os,
    arch: env.arch,
    cpu: env.cpu,
    ramGB: env.ramGB,
    xcode: env.xcode.xcodebuild,
    unityEditor: env.unity.path,
    unrealEditor: env.unreal.path,
  },
  engines: {
    unity: {
      ...(previous.engines?.unity ?? {}),
      slug: 'conduit-foundry-unity',
      generated: unityGen.passed,
      compiled: stages.unity.compiled === 'passed',
      opened: stages.unity.opened === 'passed',
      playtested: stages.unity.playtested === 'passed',
      visualCapture: stages.unity.visualCapture === 'passed',
      standaloneBuild: stages.unity.standaloneBuild === 'passed',
      stages: stages.unity,
      blocked: stages.unity.blocked,
      nextPrerequisite: unityReady
        ? 'Editors present — inspect qa logs for compile/play/capture/standalone.'
        : 'Install a supported Unity editor for this host on E:, activate its license and set UNITY_EDITOR.',
    },
    unreal: {
      ...(previous.engines?.unreal ?? {}),
      slug: 'conduit-foundry-unreal',
      generated: unrealGen.passed,
      compiled: stages.unreal.compiled === 'passed',
      opened: stages.unreal.opened === 'passed',
      playtested: stages.unreal.playtested === 'passed',
      visualCapture: stages.unreal.visualCapture === 'passed',
      standaloneBuild: stages.unreal.standaloneBuild === 'passed',
      stages: stages.unreal,
      blocked: stages.unreal.blocked.length > 0
        ? stages.unreal.blocked
        : previous.engines?.unreal?.blocked ?? [],
      nextPrerequisite: unrealReady
        ? 'Editors present — inspect qa logs for compile/play/capture/standalone.'
        : 'Install a supported Unreal editor and its host C++ toolchain on E:, then set UE_ROOT.',
    },
  },
  godotFoundryPass2: previous.godotFoundryPass2,
  note: 'Never infer runtime success from generated files or skipped checks. Automated testing does not establish animation feel or visual quality.',
};

writeFileSync(join(reviewDir, 'ENGINE_ACCEPTANCE.json'), JSON.stringify(acceptance, null, 2));

console.log(JSON.stringify({ unity: stages.unity, unreal: stages.unreal, unityReady, unrealReady }, null, 2));
if (!unityReady || !unrealReady) {
  console.log('EDITORS_MISSING: set UNITY_EDITOR and UE_ROOT to installed editors. Native validation remains blocked.');
  process.exit(2);
}
const results = [stages.unity, stages.unreal];
process.exit(results.some((stage) => Object.values(stage).includes('failed')) ? 1 : results.some((stage) => Object.values(stage).some((value) => ['pending', 'pending_review', 'blocked'].includes(value))) ? 2 : 0);
