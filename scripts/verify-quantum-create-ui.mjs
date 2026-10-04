/** Real hidden desktop workflow, normal IPC and native gameplay; no provider mocks or OS input. */
import { _electron } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(repo, 'apps/desktop');
const require = createRequire(join(desktop, 'package.json'));
const packaged = process.argv.find(argument => argument.startsWith('--packaged='))?.slice('--packaged='.length);
const output = join(repo, 'reports/game-tests/20261002-quantum-create-ui', String(Date.now()));
const checks = [];
let app;
let page;
const proof = { output, checks, scope: 'Real hidden Electron UI, normal preload IPC and native generated-game route; no OS-level input', productionReady: false };
proof.captures = [];
proof.captureMethod = 'Electron webContents.capturePage with stayHidden/stayAwake; actual viewport, no screenshot substitution';
async function capture(name) {
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running' || animation.effect?.getComputedTiming().iterations === Infinity));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const captured = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const image = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    return { bytes: image.toPNG().toString('base64'), size: image.getSize(), visible: window.isVisible() };
  });
  assert.equal(captured.visible, false);
  assert.deepEqual(captured.size, viewport);
  assert.ok(captured.size.width > 0 && captured.size.height > 0);
  writeFileSync(join(output, name), Buffer.from(captured.bytes, 'base64'));
  proof.captures.push({ file: name, size: captured.size, viewport, visible: false });
}
async function checkQueueLayout(state) {
  await page.waitForFunction(() => document.querySelectorAll('.queue-item').length > 0);
  const layout = await page.locator('.queue-item').evaluateAll(rows => rows.map(row => {
    const bounds = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    const parent = bounds(row);
    const children = [...row.children].map(bounds);
    const overlaps = children.some((a, index) => children.slice(index + 1).some(b =>
      Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 &&
      Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1));
    return { parent, children, overlaps, contained: children.every(child =>
      child.x >= parent.x - 1 && child.x + child.width <= parent.x + parent.width + 1) };
  }));
  (proof.queueLayouts ??= []).push({ state, layout });
  check(`${state} queue descriptions, types, statuses and actions do not overlap or overflow`, layout.every(row => !row.overlaps && row.contained));
}
const check = (label, value) => { checks.push({ label, passed: !!value }); assert.ok(value, label); };
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex');
function projectHashes(root, relative = '') {
  return Object.fromEntries(readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = join(relative, entry.name);
    return entry.isDirectory() ? Object.entries(projectHashes(root, file)) : [[file, sha(join(root, file))]];
  }));
}
for (const directory of ['temp', 'data', 'appdata', 'localappdata', 'GeneratedGames']) mkdirSync(join(output, directory), { recursive: true });
const env = { ...process.env, TEMP: join(output, 'temp'), TMP: join(output, 'temp'),
  APPDATA: join(output, 'appdata'), LOCALAPPDATA: join(output, 'localappdata'),
  METROFORGE_DATA_DIR: join(output, 'data'), METROFORGE_GENERATED_GAMES_DIR: join(output, 'GeneratedGames'),
  METROFORGE_RESOURCE_ROOT: repo, METROFORGE_DESKTOP_HIDDEN: '1',
  GODOT_EXECUTABLE: 'E:/MetroForgeData/Godot/4.6/Godot_v4.6-stable_win64_console.exe' };
if (packaged) {
  env.METROFORGE_RESOURCE_ROOT = join(dirname(packaged), 'resources/metroforge');
  env.METROFORGE_WORKSPACE_DIR = join(output, 'workspace');
}
for (const key of ['ELECTRON_RUN_AS_NODE', 'VITE_DEV_SERVER_URL', 'METROFORGE_DESKTOP_SMOKE', 'METROFORGE_OPEN_DEVTOOLS']) delete env[key];
try {
  app = await _electron.launch({ executablePath: packaged || require('electron'), args: packaged ? [] : [desktop], cwd: repo, env, timeout: 60000 });
  page = await app.firstWindow();
  // A hidden test window must keep rendering after viewport changes; production settings stay unchanged.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1600, height: 1100 }));
  page.setDefaultTimeout(30000);
  proof.pageErrors = [];
  page.on('pageerror', error => proof.pageErrors.push(error.message));
  check('desktop stays hidden throughout browser-driven testing', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(win => !win.isVisible())));
  await page.locator('aside.sidebar button.nav-item').filter({ hasText: 'New Game' }).first().click();
  await page.locator('.create-screen').waitFor();
  await page.evaluate(() => { window.quantumUiEvents = []; window.metroforge.onGenerationEvent(event => window.quantumUiEvents.push(event)); });
  const radios = page.getByRole('radio');
  check('three distinct genre choices', await radios.count() === 3);
  await radios.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  check('arrow keys select top-down independently', await radios.nth(1).getAttribute('aria-checked') === 'true');
  await page.keyboard.press('End');
  check('End selects Quantum with one keyboard tab stop', await radios.nth(2).getAttribute('aria-checked') === 'true' && await page.locator('[role="radio"][tabindex="0"]').count() === 1);
  const title = page.getByLabel('Project title', { exact: true });
  const prompt = page.getByLabel('Game description', { exact: true });
  const seed = page.getByLabel('Seed', { exact: true });
  const create = page.getByRole('button', { name: 'Create Quantum preview', exact: true });
  await title.fill('Quantum UI Expedition');
  await prompt.fill('A Quantum Diver explores the connected Probability Mines, stabilizes the anchors, defeats the Golem and escapes the cascade.');
  for (const value of ['', '-1', '1.5', '2147483648']) {
    await seed.fill(value);
    check(`invalid seed ${JSON.stringify(value)} blocks creation with associated error`, await create.isDisabled() && await seed.getAttribute('aria-invalid') === 'true' && await page.locator('#create-seed-error').isVisible());
  }
  await seed.fill('0');
  check('zero seed is valid', await create.isEnabled());
  check('Quantum uses local preview choices', await page.getByLabel('Profile', { exact: true }).inputValue() === 'TINY_TEST' && await page.getByLabel('Mode', { exact: true }).inputValue() === 'LOCAL_ONLY');
  await capture('01-ready.png');
  const before = await create.boundingBox();
  await create.evaluate(button => { button.click(); button.click(); });
  await page.getByRole('button', { name: 'Generating…', exact: true }).waitFor();
  const busy = page.getByRole('button', { name: 'Generating…', exact: true });
  const during = await busy.boundingBox();
  proof.buttonGeometry = { before, during };
  check('busy controls prevent duplicate submission', await busy.isDisabled() && await title.isDisabled() && await seed.isDisabled());
  proof.buttonWidthStable = Math.abs(before.width - during.width) < 1;
  check('creation button keeps its width while busy', proof.buttonWidthStable);
  await capture('02-generating.png');
  await checkQueueLayout('running');
  await page.locator('.topbar-actions button').filter({ hasText: 'API Keys' }).click();
  await page.getByRole('heading', { name: 'API Keys', exact: true }).waitFor();
  check('connection setup is available while generation runs', await page.locator('.credentials-screen').isVisible());
  await page.locator('.topbar-actions button').filter({ hasText: 'Studio' }).click();
  await page.locator('.studio-layout').waitFor();
  check('generation monitor restores real phase activity after navigation', await page.locator('.studio-layout').getAttribute('data-generating') === 'true' && await page.locator('.phase-tree-item').count() > 0);
  await page.locator('.topbar-actions button').filter({ hasText: 'New Game' }).click();
  check('returning to creation preserves busy state and entered request', await busy.isDisabled() && await title.inputValue() === 'Quantum UI Expedition' && await seed.inputValue() === '0');
  console.log(JSON.stringify({ stage: 'real-app-generation-running', output }));
  await page.waitForFunction(() => !!document.querySelector('.create-result'), undefined, { timeout: 480000 });
  await page.locator('.create-result').scrollIntoViewIfNeeded();
  await capture('03-result.png');
  await checkQueueLayout('completed');
  proof.resultText = await page.locator('.create-result').innerText();
  proof.events = await page.evaluate(() => window.quantumUiEvents);
  check('double click started exactly one job', proof.events.filter(event => event.type === 'GenerationStarted').length === 1);
  const completed = proof.events.find(event => event.type === 'GenerationCompleted');
  check('normal IPC returned runtime-validated success', completed?.validationPassed === true && completed.validationLevel === 'RUNTIME_VALIDATED');
  check('app reports passing tests only after actual validation', proof.resultText.includes('Tests passed'));
  check('completed progress contains one final row per phase', await page.evaluate(() => {
    const phases = [...document.querySelectorAll('.phase-name')].map(element => element.textContent);
    return new Set(phases).size === phases.length && ![...document.querySelectorAll('.phase-item .mf-badge')].some(element => element.textContent === 'RUNNING');
  }));
  const project = completed.projectPath;
  proof.generatedProject = project;
  const configuration = JSON.parse(readFileSync(join(project, 'quantum_project.json'), 'utf8'));
  const validation = JSON.parse(readFileSync(join(project, 'validation_report.json'), 'utf8'));
  const runtime = JSON.parse(readFileSync(join(project, 'reports/quantum-generation/gameplay/playground-result.json'), 'utf8'));
  check('zero seed and entered title reached actual generated runtime', configuration.seed === 0 && configuration.title === 'Quantum UI Expedition' && runtime.generation.seed === 0);
  check('native game traversed all 161 waypoints and extracted alive', runtime.world.visited_waypoints === 161 && runtime.progression.extracted && runtime.player_hp > 0 && validation.passed);
  const standalone = JSON.parse(readFileSync(join(project, 'reports/quantum-generation/standalone.json'), 'utf8'));
  const packagedRuntime = JSON.parse(readFileSync(join(project, 'reports/quantum-generation/packaged-gameplay/playground-result.json'), 'utf8'));
  proof.standalone = { build: completed.exportPath, files: standalone.files, waypoints: packagedRuntime.world.visited_waypoints, hp: packagedRuntime.player_hp, release: packagedRuntime.generation.package.release };
  check('normal app creation builds and validates the standalone Windows game', standalone.passed && completed.exportPath && proof.resultText.includes('Windows game:') && packagedRuntime.generation.package.standalone && packagedRuntime.generation.package.integrity && packagedRuntime.world.visited_waypoints === 161 && packagedRuntime.progression.extracted);
  proof.runtime = { seed: runtime.generation.seed, terrainSha256: runtime.generation.initial_terrain_sha256, waypoints: runtime.world.visited_waypoints, hp: runtime.player_hp, extracted: runtime.progression.extracted };
  const beforeCollision = projectHashes(project);
  await create.click();
  await page.waitForFunction(() => document.querySelector('.create-result')?.textContent.includes('Generation failed:'), undefined, { timeout: 30000 });
  const afterCollision = projectHashes(project);
  proof.collisionPreservation = { files: Object.keys(beforeCollision).length, changed: [...new Set([...Object.keys(beforeCollision), ...Object.keys(afterCollision)])].filter(file => beforeCollision[file] !== afterCollision[file]) };
  check('same-title collision leaves every completed game file and history unchanged', proof.collisionPreservation.changed.length === 0 && (await page.locator('.create-result').innerText()).includes('Failed'));
  check('failed submission preserves entered data for correction', await title.inputValue() === configuration.title && await seed.inputValue() === '0' && await prompt.inputValue() === configuration.prompt);
  await page.waitForFunction(async () => (await window.metroforge.listGenerationQueue()).some(job => job.status === 'failed'), undefined, { timeout: 30000 });
  check('queue reports the failed creation rather than completed', (await page.evaluate(() => window.metroforge.listGenerationQueue())).some(job => job.status === 'failed'));
  await capture('04-collision-preserved.png');
  await checkQueueLayout('failed');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1000, height: 720 }));
  await page.waitForFunction(() => window.innerWidth <= 1000);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await capture('05-narrow.png');
  await checkQueueLayout('narrow');
  check('narrow creation screen has no horizontal document overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('desktop remains hidden after native validation', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(win => !win.isVisible())));
  check('no renderer errors', proof.pageErrors.length === 0);
  proof.harnessSha256 = sha(fileURLToPath(import.meta.url));
  if (packaged) {
    proof.testedArtifact = { executable: packaged, hashes: Object.fromEntries([
      packaged, ...['resources/app/dist/assets/main.js', 'resources/app/dist/assets/main.css', 'resources/app/dist-electron/main.js', 'resources/app/dist-electron/preload.cjs'].map(file => join(dirname(packaged), file)),
    ].map(file => [file, sha(file)])) };
  } else {
    proof.sourceHashes = Object.fromEntries(['apps/desktop/src/studio/CreateScreen.tsx', 'apps/desktop/src/studio/creation-contract.ts', 'apps/desktop/src/studio/metroforge-api.ts', 'apps/desktop/src/styles.css', 'apps/desktop/electron/main.ts', 'apps/desktop/electron/handlers.ts', 'apps/desktop/electron/generation-bus.ts', 'apps/desktop/dist/assets/main.js', 'apps/desktop/dist-electron/main.js', 'apps/desktop/dist-electron/preload.cjs'].map(file => [file, sha(join(repo, file))]));
  }
  proof.passed = true;
} catch (error) {
  if (page) {
    proof.failureText = await page.locator('body').innerText().catch(() => 'Renderer unavailable');
    proof.events = await page.evaluate(() => window.quantumUiEvents ?? []).catch(() => []);
    await capture('failure.png').catch(() => {});
  }
  proof.passed = false;
  proof.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  writeFileSync(join(output, 'proof.json'), JSON.stringify(proof, null, 2));
  writeFileSync(join(repo, 'reports/game-tests/20261002-quantum-create-ui/latest.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ passed: proof.passed, checks: checks.length, output, error: proof.error }));
}
