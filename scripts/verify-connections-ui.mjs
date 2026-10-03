/** Actual hidden Electron + Windows safeStorage. Synthetic keys; no paid requests or OS input. */
import { _electron } from 'playwright';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(repo, 'apps/desktop');
const packaged = process.argv.find(argument => argument.startsWith('--packaged='))?.slice('--packaged='.length);
const require = createRequire(join(desktop, 'package.json'));
const output = join(repo, 'reports/game-tests/20261003-connections', String(Date.now()));
for (const dir of ['temp', 'data', 'appdata', 'localappdata', 'games']) mkdirSync(join(output, dir), { recursive: true });
writeFileSync(join(output, 'empty.env'), '');
const env = { ...process.env, METROFORGE_ENV_FILE: join(output, 'empty.env'),
  TEMP: join(output, 'temp'), TMP: join(output, 'temp'), APPDATA: join(output, 'appdata'),
  LOCALAPPDATA: join(output, 'localappdata'), METROFORGE_DATA_DIR: join(output, 'data'),
  METROFORGE_GENERATED_GAMES_DIR: join(output, 'games'), METROFORGE_DESKTOP_HIDDEN: '1' };
if (packaged) env.METROFORGE_WORKSPACE_DIR = join(output, 'workspace');
for (const key of Object.keys(env)) if (/API_KEY|API_TOKEN|HF_TOKEN/.test(key)) delete env[key];
for (const key of ['ELECTRON_RUN_AS_NODE', 'VITE_DEV_SERVER_URL', 'METROFORGE_DESKTOP_SMOKE', 'METROFORGE_OPEN_DEVTOOLS']) delete env[key];
const inherited = randomBytes(24).toString('hex'); env.STABILITY_API_KEY = inherited;
const replacement = randomBytes(24).toString('hex');
const third = randomBytes(24).toString('hex');
const proof = { output, scope: 'Hidden real Electron, real IPC, Windows encryption, synthetic keys; no live authentication claim', checks: [], captures: [], pageErrors: [] };
let app, page;
const check = (label, passed) => { proof.checks.push({ label, passed: !!passed }); assert.ok(passed, label); };
async function start() {
  app = await _electron.launch({ executablePath: packaged || require('electron'), args: packaged ? [] : [desktop], cwd: repo, env, timeout: 60000 });
  page = await app.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => proof.pageErrors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]; win.webContents.setBackgroundThrottling(false);
    win.setBounds({ width: 1500, height: 1000 });
  });
  await page.locator('.topbar-actions button').filter({ hasText: 'API Keys' }).click();
  await page.getByText('Encrypted storage ready', { exact: true }).waitFor();
}
async function capture(file) {
  await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running' || animation.effect?.getComputedTiming().iterations === Infinity));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const data = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const image = await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    return { png: image.toPNG().toString('base64'), size: image.getSize(), visible: win.isVisible() };
  });
  check('capture keeps native window hidden', !data.visible);
  writeFileSync(join(output, file), Buffer.from(data.png, 'base64'));
  proof.captures.push({ file, size: data.size, visible: data.visible });
}
const card = name => page.locator('.credential-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
try {
  await start();
  check('eight supported providers have editable masked fields', await page.locator('.credential-card input[type=password]').count() === 8);
  check('existing environment credential has clear source', await card('Stability AI').getByText('From environment', { exact: true }).isVisible());
  await capture('01-api-keys.png');
  const input = card('Stability AI').locator('input');
  await input.fill('invalid key');
  check('invalid key is associated with guidance and cannot submit', await input.getAttribute('aria-invalid') === 'true' && await card('Stability AI').getByRole('button', { name: 'Save key', exact: true }).isDisabled());
  await input.fill(replacement);
  await card('Stability AI').getByRole('button', { name: 'Show Stability AI API key' }).click();
  check('reveal has correct state', await input.getAttribute('type') === 'text');
  await page.locator('.topbar-actions button').filter({ hasText: 'New Game' }).click();
  await page.locator('.create-screen').waitFor();
  await page.locator('.topbar-actions button').filter({ hasText: 'API Keys' }).click();
  check('navigation retains draft in memory and remasks', await input.inputValue() === replacement && await input.getAttribute('type') === 'password');
  const save = card('Stability AI').getByRole('button', { name: 'Save key', exact: true });
  await save.focus(); await page.keyboard.press('Enter');
  await card('Stability AI').getByText('Saved key', { exact: true }).waitFor();
  check('keyboard save clears sensitive draft', await input.inputValue() === '');
  check('main process uses new credential immediately', await app.evaluate(({}, expected) => process.env.STABILITY_API_KEY === expected, replacement));
  const vault = join(output, 'data/credentials.enc');
  check('Windows vault contains no plaintext key', !readFileSync(vault).includes(Buffer.from(replacement)));
  check('IPC returns presence only', !JSON.stringify(await page.evaluate(() => window.metroforge.getCredentialStatus())).includes(replacement));
  check('no key was persisted in browser storage', await page.evaluate(expected => !JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]).includes(expected), replacement));
  await capture('02-key-saved.png');
  await app.close(); app = null;
  await start();
  check('encrypted saved key survives real app restart', await card('Stability AI').getByText('Saved key', { exact: true }).isVisible() && await app.evaluate(({}, expected) => process.env.STABILITY_API_KEY === expected, replacement));
  const restartedInput = card('Stability AI').locator('input');
  check('restart never retrieves a stored key into the form', await restartedInput.inputValue() === '');
  // Owned fixture fault injection: a directory at the vault path makes the real disk commit fail.
  assert.ok(resolve(vault).startsWith(resolve(output) + '\\') || resolve(vault).startsWith(resolve(output) + '/'));
  renameSync(vault, `${vault}.held`); mkdirSync(vault);
  await restartedInput.fill(third);
  await card('Stability AI').getByRole('button', { name: 'Save key', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'The key was not saved or removed.' }).waitFor();
  check('actual storage failure retains input and previous active key', await restartedInput.inputValue() === third && await app.evaluate(({}, expected) => process.env.STABILITY_API_KEY === expected, replacement));
  rmdirSync(vault); renameSync(`${vault}.held`, vault);
  await card('Stability AI').getByRole('button', { name: 'Save key', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#key-stability').value === '');
  check('retry succeeds after storage recovery', await app.evaluate(({}, expected) => process.env.STABILITY_API_KEY === expected, third));
  await card('Stability AI').getByRole('button', { name: 'Remove saved key', exact: true }).click();
  check('removal requires explicit consequence confirmation', await card('Stability AI').getByRole('button', { name: 'Confirm removal', exact: true }).isVisible());
  await card('Stability AI').getByRole('button', { name: 'Keep key', exact: true }).click();
  check('cancel preserves saved connection', await card('Stability AI').getByText('Saved key', { exact: true }).isVisible());
  await card('Stability AI').getByRole('button', { name: 'Remove saved key', exact: true }).click();
  await card('Stability AI').getByRole('button', { name: 'Confirm removal', exact: true }).click();
  await card('Stability AI').getByText('From environment', { exact: true }).waitFor();
  check('removal restores original environment key', await app.evaluate(({}, expected) => process.env.STABILITY_API_KEY === expected, inherited));
  await page.getByRole('heading', { name: 'API Keys', exact: true }).scrollIntoViewIfNeeded();
  await capture('03-connections-wide.png');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1000, height: 720 }));
  await page.waitForFunction(() => innerWidth <= 1000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  check('narrow app has no horizontal document overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('last provider and save action remain reachable', await card('Replicate').getByRole('button', { name: 'Save key', exact: true }).scrollIntoViewIfNeeded().then(() => true));
  await page.getByRole('heading', { name: 'API Keys', exact: true }).scrollIntoViewIfNeeded();
  await capture('03-narrow.png');
  check('route has clear document title', await page.title() === 'API Keys — MetroForge');
  check('no renderer errors', proof.pageErrors.length === 0);
  check('desktop stayed hidden', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(win => !win.isVisible())));
  proof.sourceHashes = Object.fromEntries(['apps/desktop/electron/credentials.ts', 'apps/desktop/electron/handlers.ts', 'apps/desktop/electron/preload.ts', 'apps/desktop/src/studio/ApiKeysScreen.tsx', 'apps/desktop/src/App.tsx', 'apps/desktop/src/styles.css', 'apps/desktop/dist/assets/main.js', 'apps/desktop/dist-electron/handlers.js'].map(file => [file, createHash('sha256').update(readFileSync(join(repo, file))).digest('hex')]));
  if (packaged) {
    proof.packaged = { executable: packaged, sha256: createHash('sha256').update(readFileSync(packaged)).digest('hex') };
    for (const file of ['dist/assets/main.js', 'dist-electron/handlers.js', 'dist-electron/credentials.js', 'dist-electron/preload.cjs']) {
      check('packaged application matches tested source build: ' + file,
        readFileSync(join(desktop, file)).equals(readFileSync(join(dirname(packaged), 'resources/app', file))));
    }
  }
  proof.passed = true;
} catch (error) {
  proof.passed = false; proof.error = String(error.stack || error).replaceAll(replacement, '[REDACTED]').replaceAll(third, '[REDACTED]').replaceAll(inherited, '[REDACTED]');
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  const serialized = JSON.stringify(proof, null, 2);
  assert.ok(![inherited, replacement, third].some(value => serialized.includes(value)));
  writeFileSync(join(output, 'proof.json'), serialized);
  writeFileSync(join(repo, 'reports/game-tests/20261003-connections/latest.json'), serialized);
  console.log(JSON.stringify({ passed: proof.passed, checks: proof.checks.length, output, error: proof.error }));
}
