/** Real packaged Rooms UI/IPC on disposable games; no provider requests or native OS input. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.argv[2],
  base = resolve(process.argv[3]);
assert.ok(executable);
assert.match(base, /^E:[\\/]/i);
const project = join(base, 'games/stormglass-castle');
const output = join(repo, 'reports/game-tests/20261004-room-workspace', String(Date.now()));
for (const dir of ['data', 'temp', 'appdata', 'localappdata', 'workspace'])
  mkdirSync(join(output, dir), { recursive: true });
writeFileSync(join(output, 'empty.env'), '');
const roomsPath = join(project, 'data/rooms/rooms.json');
const original = readFileSync(roomsPath),
  records = JSON.parse(original).rooms;
const proof = {
  output,
  project,
  executable,
  checks: [],
  errors: [],
  captures: [],
  scope:
    'Hidden actual packaged Electron, real room/atlas/background IPC, real tile save/recompile/undo and stale-write failure on disposable games. No provider inference or gameplay claim.',
};
const check = (label, condition) => {
  proof.checks.push({ label, passed: !!condition });
  console.log(JSON.stringify({ check: label, passed: !!condition }));
  assert.ok(condition, label);
};
const read = () => JSON.parse(readFileSync(roomsPath, 'utf8')).rooms;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
let app;
try {
  const env = {
    ...process.env,
    METROFORGE_ENV_FILE: join(output, 'empty.env'),
    METROFORGE_DESKTOP_HIDDEN: '1',
    METROFORGE_DATA_DIR: join(output, 'data'),
    METROFORGE_GENERATED_GAMES_DIR: join(base, 'games'),
    METROFORGE_WORKSPACE_DIR: join(output, 'workspace'),
    TEMP: join(output, 'temp'),
    TMP: join(output, 'temp'),
    APPDATA: join(output, 'appdata'),
    LOCALAPPDATA: join(output, 'localappdata'),
  };
  for (const name of Object.keys(env))
    if (/API_KEY|API_TOKEN|HF_TOKEN/.test(name)) delete env[name];
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;
  app = await _electron.launch({
    executablePath: executable,
    cwd: repo,
    env,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    timeout: 60000,
  });
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => proof.errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.setBackgroundThrottling(false);
    win.setBounds({ width: 1500, height: 1000 });
  });
  const nav = (name) =>
    page
      .locator('.nav-item')
      .filter({ has: page.locator('.nav-function', { hasText: new RegExp(`^${name}$`) }) });
  await nav('Rooms').click();
  await page.locator('.room-editor-screen .project-select select').selectOption(project);
  const canvas = page.locator('.room-editor-canvas svg.room-tile-canvas');
  await canvas.waitFor();
  await page.locator('.room-editor-canvas .room-scene-background').waitFor();
  const geometryBefore = await page.evaluate(
    (path) => window.metroforge.getRoomCollision(path, 'room_000'),
    project,
  );
  check(
    'Rooms owns full authoring width without duplicate assistant',
    (await page.locator('.forge-assist-panel').count()) === 0 &&
      (await page.locator('.app').evaluate((node) => node.classList.contains('asset-workspace'))),
  );
  check(
    'Visual has exactly one scene canvas',
    (await page.locator('.room-editor-canvas svg.room-canvas').count()) === 1,
  );
  await canvas.click({ position: { x: 40, y: 40 } });
  check(
    'Select never paints or writes files',
    readFileSync(roomsPath).equals(original) &&
      (await page.getByRole('button', { name: 'Save Tilemap', exact: true }).isDisabled()),
  );
  await page.getByRole('button', { name: 'Paint', exact: true }).click();
  const cell = page.locator('[data-cell-action]');
  await cell.waitFor();
  await cell.focus();
  await cell.press('ArrowRight');
  await cell.press('ArrowDown');
  check(
    'keyboard cursor uses native cell coordinates',
    (await cell.innerText()) === 'Paint cell 2, 2',
  );
  await cell.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  check(
    'IME composition does not paint',
    await page.getByRole('button', { name: 'Save Tilemap', exact: true }).isDisabled(),
  );
  await cell.press('Enter');
  check(
    'keyboard paints a draft with no file write',
    !(await page.getByRole('button', { name: 'Save Tilemap', exact: true }).isDisabled()) &&
      readFileSync(roomsPath).equals(original),
  );
  check(
    'grid uses a pattern instead of one button per empty cell',
    (await canvas.locator('pattern').getAttribute('width')) === '32' &&
      (await canvas.locator('[role=button]').count()) === 0 &&
      (await canvas.locator('g[data-tile-cell]').count()) < 56 * 24,
  );
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  check(
    'Select preserves unsaved tiles and exposes Save',
    (await page
      .locator('.room-tile-workspace')
      .innerText()
      .then((text) => text.includes('Unsaved tiles'))) &&
      !(await page.getByRole('button', { name: 'Save Tilemap', exact: true }).isDisabled()),
  );
  const list = page.getByRole('listbox', { name: 'Rooms', exact: true });
  await list.press('ArrowDown');
  await page.waitForFunction(() =>
    document.querySelector('.room-canvas-status')?.textContent?.includes('room_001'),
  );
  await list.press('ArrowUp');
  await page.waitForFunction(() =>
    document.querySelector('.room-canvas-status')?.textContent?.includes('room_000'),
  );
  check(
    'room navigation preserves its unsaved draft',
    !(await page.getByRole('button', { name: 'Save Tilemap', exact: true }).isDisabled()),
  );
  await nav('Assets').click({ force: true });
  await nav('Rooms').click({ force: true });
  await canvas.waitFor();
  check(
    'route navigation preserves the draft',
    !(await page.getByRole('button', { name: 'Save Tilemap', exact: true }).isDisabled()),
  );
  const capture = async (name) => {
    for (let frame = 0; frame < 3; frame++) {
      await app.evaluate(async ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        }),
      );
      await page.waitForTimeout(80);
    }
    const data = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return {
        visible: win.isVisible(),
        bytes: (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }))
          .toPNG()
          .toString('base64'),
      };
    });
    check('capture stays hidden: ' + name, !data.visible);
    writeFileSync(join(output, name), Buffer.from(data.bytes, 'base64'));
    proof.captures.push(name);
  };
  await capture('room-workspace-draft.png');
  await page.getByRole('button', { name: 'Save Tilemap', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Tilemap saved and room recompiled' }).waitFor();
  check(
    'real Save persists the keyboard painted atlas tile',
    read().room_000.tileCells.some(
      (cell) => cell.x === 1 && cell.y === 1 && cell.col === 0 && cell.row === 2,
    ),
  );
  check(
    'success clears unsaved state',
    await page.getByRole('button', { name: 'Save Tilemap', exact: true }).isDisabled(),
  );
  await page.getByRole('button', { name: 'Undo saved room change', exact: true }).click();
  await page.locator('.result.success').filter({ hasText: 'Undid Edit room room_000' }).waitFor();
  await page.waitForFunction(
    () => document.querySelector('.room-editor-screen')?.getAttribute('aria-busy') === 'false',
  );
  proof.undo = { expected: records.room_000, actual: read().room_000 };
  assert.deepEqual(
    proof.undo.actual,
    proof.undo.expected,
    'Undo should restore all original room fields',
  );
  check('real Undo restores the original room record', true);
  for (const id of Object.keys(records).filter((id) => id !== 'room_000'))
    assert.deepEqual(read()[id], records[id], 'Sibling room preserved: ' + id);
  check('tile save and undo preserve all thirty-nine sibling rooms', true);
  const restoredGeometry = await page.evaluate(
    (path) => window.metroforge.getRoomCollision(path, 'room_000'),
    project,
  );
  assert.deepEqual(
    restoredGeometry.rects,
    geometryBefore.rects,
    'Undo must restore actual native-scene collision',
  );
  check('Undo restores native collision geometry as well as room metadata', true);
  await page.getByRole('button', { name: 'Paint', exact: true }).click();
  await cell.click();
  const outside = read();
  outside.room_000.tileCells = [
    ...(outside.room_000.tileCells ?? []).filter((cell) => cell.x !== 2 || cell.y !== 2),
    { x: 2, y: 2, col: 1, row: 0 },
  ];
  writeFileSync(roomsPath, JSON.stringify({ rooms: outside }, null, 2));
  const external = readFileSync(roomsPath);
  await page.getByRole('button', { name: 'Save Tilemap', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Saved room tiles changed' }).waitFor();
  check(
    'backend rejects stale draft without changing the external room record',
    readFileSync(roomsPath).equals(external),
  );
  const status = await page.evaluate((path) => window.metroforge.getEditStatus(path), project);
  check(
    'failed edit leaves compiling state and retains a failure label',
    status.state === 'DIRTY' && status.label.includes('save failed'),
  );
  check(
    'failed save preserves draft for recovery',
    await page
      .locator('.room-tile-workspace')
      .innerText()
      .then((text) => text.includes('Unsaved tiles')),
  );
  await nav('Assets').click({ force: true });
  await nav('Rooms').click({ force: true });
  await canvas.waitFor();
  await page
    .getByRole('alert')
    .filter({ hasText: 'Saved tiles changed while this draft was open' })
    .waitFor();
  check(
    'refresh shows conflict and disables overwrite',
    await page.getByRole('button', { name: 'Save Tilemap', exact: true }).isDisabled(),
  );
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  check(
    'Discard loads latest saved tiles without writing files',
    (await canvas.locator('[data-tile-cell="2,2"]').count()) === 1 &&
      readFileSync(roomsPath).equals(external),
  );
  const invalid = await page.evaluate(
    (path) =>
      window.metroforge.updateRoom(path, {
        roomId: 'room_000',
        tileCells: [],
        tileCellsBase: [{ x: -1, y: 0, col: 0, row: 0 }],
      }),
    project,
  );
  check(
    'malformed tile base fails before a file write',
    invalid.success === false && readFileSync(roomsPath).equals(external),
  );
  const topdown = join(base, 'games/quantum-ui-expedition');
  const rejected = await page.evaluate(
    (path) =>
      window.metroforge.updateRoom(path, { roomId: 'room_000', tileCells: [], tileCellsBase: [] }),
    topdown,
  );
  check('Quantum fixture refuses side-view tile edits for room_000', rejected.success === false);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1000, height: 900 }),
  );
  await page.waitForFunction(() => window.innerWidth <= 1000);
  check(
    'narrow desktop has no document horizontal overflow',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  check(
    'narrow scene remains inside its scroll owner',
    await canvas.evaluate(
      (svg) => svg.getBoundingClientRect().width <= svg.parentElement.clientWidth + 1,
    ),
  );
  await capture('room-workspace-narrow.png');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1500, height: 1000 }),
  );
  await capture('room-workspace-saved.png');
  check('no renderer exceptions', proof.errors.length === 0);
  proof.passed = true;
  proof.executableSha256 = sha(readFileSync(executable));
} catch (error) {
  proof.passed = false;
  proof.error = String(error.stack ?? error);
  proof.roomsAtFailure = read();
  if (app) {
    try {
      const page = await app.firstWindow();
      proof.uiAtFailure = await page.locator('.room-editor-screen').innerText();
      const data = await app.evaluate(async ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]
          .webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
          .then((image) => image.toPNG().toString('base64')),
      );
      writeFileSync(join(output, 'failure.png'), Buffer.from(data, 'base64'));
    } catch (captureError) {
      proof.captureError = String(captureError);
    }
  }
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  // The fixture remains disposable; retain evidence and restore its authored input.
  writeFileSync(roomsPath, original);
  writeFileSync(join(output, 'proof.json'), JSON.stringify(proof, null, 2));
  writeFileSync(
    join(repo, 'reports/game-tests/20261004-room-workspace/latest.json'),
    JSON.stringify(proof, null, 2),
  );
  console.log(
    JSON.stringify({
      output,
      passed: proof.passed,
      checks: proof.checks.length,
      error: proof.error,
    }),
  );
}
