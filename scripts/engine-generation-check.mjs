import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectProjectEngine, validateForeignEngineProject } from '../packages/qa/dist/engine-validator.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const slugs = process.argv.slice(2);
const targets =
  slugs.length > 0
    ? slugs.map((slug) => join(root, 'GeneratedGames', slug))
    : [
        join(root, 'GeneratedGames', 'conduit-foundry-unity'),
        join(root, 'GeneratedGames', 'conduit-foundry-unreal'),
      ];

let failed = false;
for (const projectPath of targets) {
  const engine = detectProjectEngine(projectPath);
  if (engine !== 'unity' && engine !== 'unreal') {
    console.error(`FAIL ${projectPath}: not a Unity/Unreal generated project (${engine})`);
    failed = true;
    continue;
  }
  const report = validateForeignEngineProject(projectPath, engine);
  const record = {
    engine,
    scope: 'generation-level-only',
    generated: true,
    compiled: false,
    opened: false,
    playtested: false,
    visualCapture: false,
    standaloneBuild: false,
    acceptance: 'open',
    blocked:
      engine === 'unity'
        ? ['UNITY_EDITOR_NOT_AVAILABLE']
        : ['UNREAL_EDITOR_NOT_AVAILABLE'],
    passedBlockingGates: report.passed,
    results: report.results,
    timestamp: new Date().toISOString(),
    note: 'Static file/pack checks only. Not compile, editor launch, playtest, capture, or standalone proof.',
  };
  const outDir = join(projectPath, 'qa');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'engine-status.json'), JSON.stringify(record, null, 2));
  const blocking = report.results.filter((r) => r.state !== 'SKIPPED');
  console.log(
    `${engine} ${projectPath}\n  blocking ${blocking.filter((r) => r.passed).length}/${blocking.length} passed\n  skipped ${report.results.filter((r) => r.state === 'SKIPPED').map((r) => r.gate).join(', ')}\n  wrote qa/engine-status.json (generated only, acceptance open)`,
  );
  if (!report.passed) failed = true;
}
process.exit(failed ? 1 : 0);
