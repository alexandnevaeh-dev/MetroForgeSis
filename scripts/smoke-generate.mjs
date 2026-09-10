import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const slug = 'metroforge-smoke-metroidvania';
const seed = 424242;
const generatedRoot = join(root, 'GeneratedGames');
const projectPath = join(generatedRoot, slug);
const cli = join(root, 'apps', 'cli', 'dist', 'index.js');

mkdirSync(generatedRoot, { recursive: true });
if (!existsSync(cli)) {
  console.error('CLI build is missing. Run pnpm build first.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [cli, 'create', '--prompt', 'A deterministic MetroForge smoke-test metroidvania with one room, one enemy, one ability gate, and one completion objective.', '--profile', 'TINY_TEST', '--mode', 'LOCAL_ONLY', '--seed', String(seed), '--slug', slug, '--skip-export'], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.status !== 0) process.exit(result.status ?? 1);

const validationPath = join(projectPath, 'validation_report.json');
const validation = existsSync(validationPath) ? JSON.parse(readFileSync(validationPath, 'utf8')) : null;
const report = {
  metroforgeVersion: '0.1.0',
  timestamp: new Date().toISOString(),
  seed,
  projectId: slug,
  generationStatus: 'PASS',
  assemblyStatus: existsSync(join(projectPath, 'project.godot')) ? 'PASS' : 'FAIL',
  structuralValidation: validation?.passed === true ? 'PASS' : 'FAIL',
  godotVersion: null,
  godotValidationStatus: 'NOT_RUN',
  runtimeValidation: 'NOT_RUN',
  playtestStatus: 'NOT_RUN',
  visualValidation: 'NOT_RUN',
  providerFallbacks: ['LOCAL_ONLY / deterministic fallback may be used'],
  assetFallbacks: [],
  warnings: validation?.warnings ?? [],
  errors: validation?.errors ?? [],
  certificationLevel: validation?.validationLevel ?? 'NEEDS_RUNTIME_VALIDATION',
};
writeFileSync(join(projectPath, 'metroforge-validation.json'), JSON.stringify(report, null, 2));
console.log(`Smoke project: ${projectPath}`);
console.log(`Certification: ${report.certificationLevel}`);
