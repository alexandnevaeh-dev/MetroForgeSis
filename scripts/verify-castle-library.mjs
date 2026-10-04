import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..'), executable = process.argv[2]; assert.ok(executable);
const games = join(dirname(executable), 'UserData/games'), castle = join(games, 'stormglass-castle');
const settings = JSON.parse(readFileSync(join(castle, 'data/visual/biome-backgrounds.json'), 'utf8')).biomes.biome_0;
const output = join(repo, 'reports/game-tests/20261004-castle-library', String(Date.now()));
for (const dir of ['data', 'temp', 'appdata', 'localappdata', 'workspace']) mkdirSync(join(output, dir), { recursive: true });
writeFileSync(join(output, 'empty.env'), '');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function hashes(root, rel = '') { return Object.fromEntries(readdirSync(join(root, rel), { withFileTypes: true }).flatMap(entry => { const path = join(rel, entry.name); return entry.isDirectory() ? Object.entries(hashes(root, path)) : [[path, sha(readFileSync(join(root, path)))]]; })); }
const before = hashes(games), proof = { output, checks: [], captures: [], errors: [], scope: 'Read-only final portable library and room inspector. Verify both separate games, the assigned castle background and exact image bytes; no game launches or new generation.' };
const check = (label, value) => { proof.checks.push({ label, passed: !!value }); assert.ok(value, label); };
let app;
try {
  const env = { ...process.env, METROFORGE_ENV_FILE: join(output, 'empty.env'), METROFORGE_DESKTOP_HIDDEN: '1', METROFORGE_DATA_DIR: join(output, 'data'), METROFORGE_GENERATED_GAMES_DIR: games, METROFORGE_WORKSPACE_DIR: join(output, 'workspace'), TEMP: join(output, 'temp'), TMP: join(output, 'temp'), APPDATA: join(output, 'appdata'), LOCALAPPDATA: join(output, 'localappdata') };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  app = await _electron.launch({ executablePath: executable, cwd: repo, args: [], env, timeout: 60000 });
  const page = await app.firstWindow(); page.setDefaultTimeout(30000); page.on('pageerror', e => proof.errors.push(e.message));
  await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.webContents.setBackgroundThrottling(false); win.setBounds({ width: 1500, height: 1000 }); });
  const nav = name => page.locator('.nav-item').filter({ has: page.locator('.nav-function', { hasText: new RegExp('^' + name + '$') }) });
  await nav('Projects').click();
  const list = page.locator('.projects-screen .project-list');
  const quantum = list.locator('li').filter({ hasText: 'Quantum UI Expedition' }), castleRow = list.locator('li').filter({ hasText: 'Stormglass Reliquary' });
  await quantum.waitFor(); await castleRow.waitFor();
  check('both bundled games appear separately', await list.locator('li').count() === 2);
  check('Quantum retains its genre and Play action', (await quantum.innerText()).includes('Quantum roguelite') && await quantum.getByRole('button', { name: 'Play', exact: true }).isEnabled());
  check('castle retains its Metroidvania genre and Play action', /metroidvania/i.test(await castleRow.innerText()) && await castleRow.getByRole('button', { name: 'Play', exact: true }).isEnabled());
  const capture = async name => {
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await app.evaluate(async ({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; return { visible: win.isVisible(), bytes: (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64') }; });
    check('capture stays hidden: ' + name, !result.visible); writeFileSync(join(output, name), Buffer.from(result.bytes, 'base64')); proof.captures.push(name);
  };
  await capture('bundled-castle-library.png');
  await nav('Rooms').click(); await page.locator('.room-editor-screen .project-select select').selectOption(castle);
  const region = page.getByRole('region', { name: 'Castle biome background', exact: true });
  await region.getByRole('img', { name: 'Castle background preview', exact: true }).waitFor();
  check('bundled inspector retains selected background', await region.getByLabel('Castle background', { exact: true }).inputValue() === settings.assetId);
  check('bundled inspector shows all forty affected rooms', await region.getByText('One interior across all 40 rooms in biome_0.', { exact: true }).isVisible());
  check('bundled preview matches the tested artwork exactly', sha(Buffer.from((await region.getByRole('img', { name: 'Castle background preview', exact: true }).getAttribute('src')).split(',')[1], 'base64')) === sha(readFileSync(join(castle, settings.path))));
  check('saved opacity and floor framing persist', await region.getByLabel('Background opacity').inputValue() === '0.9' && await region.getByLabel('Background vertical framing').inputValue() === '1');
  check('no unsaved changes and undo remains available', !await region.getByRole('button', { name: 'Apply background', exact: true }).isEnabled() && await region.getByRole('button', { name: 'Undo background', exact: true }).isEnabled());
  await region.scrollIntoViewIfNeeded(); await capture('bundled-castle-inspector.png');
  check('library inspection preserves every bundled game file', JSON.stringify(hashes(games)) === JSON.stringify(before));
  check('no renderer errors', proof.errors.length === 0);
  proof.packaged = { executable, sha256: sha(readFileSync(executable)) }; proof.passed = true;
} catch (error) { proof.passed = false; proof.error = String(error.stack ?? error); process.exitCode = 1; }
finally { if (app) await app.close(); writeFileSync(join(output, 'proof.json'), JSON.stringify(proof, null, 2)); writeFileSync(join(repo, 'reports/game-tests/20261004-castle-library/latest.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify({ passed: proof.passed, checks: proof.checks.length, output, error: proof.error })); }
