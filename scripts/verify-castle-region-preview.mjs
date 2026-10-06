/** Read-only visual verification in the actual desktop app, with isolated E: state. */
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
import { cpSync, mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { buildCastleRegionPlan } from '../packages/godot/dist/castle-region-plan.js';

const repo = resolve('.');
const base = resolve(process.argv[2]);
const source = resolve(process.argv[3]);
const regenerateFurnishings = process.argv.includes('--regenerate-furnishings');
assert.match(base, /^E:[\\/]/i);
assert.ok(process.argv[2] && process.argv[3]);
assert.ok(!existsSync(base), 'Use a fresh evidence directory; preserve earlier runs');
const project = join(base, 'games/stormglass-castle');
for (const dir of ['data', 'temp', 'appdata', 'localappdata', 'workspace'])
  mkdirSync(join(base, dir), { recursive: true });
cpSync(source, project, {
  recursive: true,
  filter: (path) => !['.godot', 'qa', 'reports'].includes(basename(path)),
});
if (regenerateFurnishings) {
  for (const file of ['scripts/world/StormglassDecor.gd', 'scripts/test/StormglassPlanCacheSmoke.gd', 'scenes/test/StormglassPlanCacheSmoke.tscn'])
    cpSync(join(repo, 'templates/godot-metroidvania', file), join(project, file));
}
writeFileSync(join(base, 'empty.env'), '');
const digest = (file) =>
  createHash('sha256')
    .update(readFileSync(join(project, file)))
    .digest('hex');
const guarded = [
  'data/rooms/rooms.json',
  'world_graph.json',
  'game_dna.json',
  'generation_manifest.json',
];
const before = Object.fromEntries(guarded.map((file) => [file, digest(file)]));
const proof = {
  checks: [],
  errors: [],
  captures: [],
  project,
  visible: true,
  scope:
    regenerateFurnishings ? 'Actual desktop app, isolated room regeneration and Undo, then read-only material and furnishing preview. Native physics and artistic acceptance require separate evidence.' : 'Actual desktop app, read-only region material preview. SVG approximates native shader; no full scenery or artistic acceptance.',
};
const check = (label, passed) => {
  proof.checks.push({ label, passed: !!passed });
  assert.ok(passed, label);
  console.log(label);
};
let app, page;
try {
  const env = {
    ...process.env,
    TEMP: join(base, 'temp'),
    TMP: join(base, 'temp'),
    APPDATA: join(base, 'appdata'),
    LOCALAPPDATA: join(base, 'localappdata'),
    METROFORGE_ENV_FILE: join(base, 'empty.env'),
    METROFORGE_DATA_DIR: join(base, 'data'),
    METROFORGE_GENERATED_GAMES_DIR: join(base, 'games'),
    METROFORGE_WORKSPACE_DIR: join(base, 'workspace'),
  };
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'VITE_DEV_SERVER_URL',
    'METROFORGE_DESKTOP_HIDDEN',
    'METROFORGE_DESKTOP_SMOKE',
  ])
    delete env[key];
  app = await _electron.launch({
    executablePath: join(repo, 'apps/desktop/node_modules/electron/dist/electron.exe'),
    args: [join(repo, 'apps/desktop')],
    cwd: repo,
    env,
    timeout: 60000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (error) => proof.errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setBounds({ width: 1500, height: 1000 });
    win.show();
    win.webContents.setBackgroundThrottling(false);
  });
  await page
    .locator('.nav-item')
    .filter({ has: page.locator('.nav-function', { hasText: /^Rooms$/ }) })
    .click();
  await page.locator('.room-editor-screen .project-select select').selectOption(project);
  const list = page.getByRole('listbox', { name: 'Rooms', exact: true });
  await list.focus();
  await list.press('ArrowDown');
  await page.waitForFunction(() =>
    document.querySelector('.room-canvas-status')?.textContent?.includes('room_001'),
  );
  if (regenerateFurnishings) {
    const roomsFile = join(project, 'data/rooms/rooms.json');
    const originalRooms = readFileSync(roomsFile);
    const originalPlan = JSON.parse(originalRooms.toString('utf8')).rooms.room_001.castleRegionPlan ?? null;
    const previousCollision = await page.evaluate(async p => window.metroforge.getRoomCollision(p, 'room_001'), project);
    await page.getByRole('button', { name: 'Regenerate Room', exact: true }).click();
    await page.waitForFunction(async p => {
      const rooms = await window.metroforge.listRooms(p);
      const plan = rooms.find(room => room.id === 'room_001')?.castleRegionPlan;
      return plan?.furnishings?.length === 20 && plan?.facadeModules?.length === 717;
    }, project);
    assert.deepEqual(JSON.parse(readFileSync(roomsFile, 'utf8')).rooms.room_001.castleRegionPlan, buildCastleRegionPlan());
    check('Regenerate Room saves the compiler furnishing plan', true);
    await page.getByRole('button', { name: 'Undo saved room change', exact: true }).click();
    await page.waitForFunction(async ({project, originalPlan}) => {
      const rooms = await window.metroforge.listRooms(project);
      return JSON.stringify(rooms.find(room => room.id === 'room_001')?.castleRegionPlan ?? null) === JSON.stringify(originalPlan);
    }, {project, originalPlan});
    check('Undo restores the original room records exactly', readFileSync(roomsFile).equals(originalRooms));
    const restoredCollision = await page.evaluate(async p => window.metroforge.getRoomCollision(p, 'room_001'), project);
    assert.deepEqual(restoredCollision.rects, previousCollision.rects);
    check('Undo restores the original native collision', true);
    await page.getByRole('button', { name: 'Regenerate Room', exact: true }).click();
    await page.waitForFunction(async p => {
      const rooms = await window.metroforge.listRooms(p);
      const plan = rooms.find(room => room.id === 'room_001')?.castleRegionPlan;
      return plan?.furnishings?.length === 20 && plan?.facadeModules?.length === 717;
    }, project);
    before['data/rooms/rooms.json'] = digest('data/rooms/rooms.json');
  }
  const region = page.locator('.room-editor-canvas').getByLabel('Castle region masonry preview');
  await region.first().waitFor();
  check('Visual canvas uses the saved region instead of the panorama', (await region.count()) > 0);
  if (regenerateFurnishings)
    check('Visual editor renders every saved non-colliding facade module', await region.first().locator('[data-facade-module]').count() === 717);
  check(
    'Inspector explains the region material instead of offering an ineffective panorama change',
    (await page.getByText('Castle region material', { exact: true }).count()) === 1 &&
      (await page.getByRole('button', { name: 'Apply background', exact: true }).count()) === 0,
  );
  check(
    'All fifteen published chambers are visible in the region preview',
    (await region.first().locator('[data-chamber-id]').count()) === 15,
  );
  if (regenerateFurnishings) {
    const furnishings = region.first().getByLabel('Saved castle furnishings');
    await furnishings.locator('[data-furnishing-id]').nth(19).waitFor();
    check('Visual editor shows all twenty saved furnishing images', await furnishings.locator('[data-furnishing-id]').count() === 20);
    check('Wall-mounted furnishings remain distinct from floor props', await furnishings.locator('[data-mounting="rear-wall"]').count() === 7);
    proof.furnishings = await furnishings.locator('[data-furnishing-id]').evaluateAll(images => images.map(image => ({ id: image.getAttribute('data-furnishing-id'), x: Number(image.getAttribute('data-center-x')), y: Number(image.getAttribute('data-center-y')), width: Number(image.getAttribute('width')), height: Number(image.getAttribute('height')) })));
    const artwork = join(project, 'assets/architecture/stormglass/conditions/intact_sconce.png');
    const parkedArtwork = `${artwork}.missing-fixture`;
    renameSync(artwork, parkedArtwork);
    try {
      await list.focus();
      await list.press('ArrowDown');
      await page.waitForFunction(() => document.querySelector('.room-canvas-status')?.textContent?.includes('room_002'));
      await list.press('ArrowUp');
      await furnishings.waitFor({ state: 'attached' });
      await page.waitForFunction(() => document.querySelector('.room-editor-canvas [data-furnishing-state]')?.getAttribute('data-furnishing-state') === 'partial');
      check('Missing furnishing artwork has a visible recovery message', await furnishings.getByText('Some furnishing artwork is unavailable. Reload the room to retry.', { exact: true }).count() === 1);
      const missing = buildCastleRegionPlan().furnishings.filter(item => item.role === 'intact_sconce').length;
      check('Unavailable images do not hide other furnishing artwork', await furnishings.locator('[data-furnishing-id]').count() === 20 - missing);
    } finally {
      renameSync(parkedArtwork, artwork);
    }
    await list.focus();
    await list.press('ArrowDown');
    await page.waitForFunction(() => document.querySelector('.room-canvas-status')?.textContent?.includes('room_002'));
    await list.press('ArrowUp');
    await page.waitForFunction(() => document.querySelector('.room-editor-canvas [data-furnishing-state]')?.getAttribute('data-furnishing-state') === 'ready');
    check('Keyboard room navigation reloads all restored furnishings', await furnishings.locator('[data-furnishing-id]').count() === 20);
  }
  check(
    'World material courses retain 512 by 64 pattern period',
    (await region.first().locator('pattern').getAttribute('width')) === '512' &&
      (await region.first().locator('pattern').getAttribute('height')) === '64',
  );
  for (const label of ['Entities', 'Collision', 'Visual']) {
    await page.getByRole('tab', { name: label, exact: true }).click();
    if (label === 'Collision')
      check('Collision view excludes decorative material', (await region.count()) === 0);
    else check(`${label} view shares the region material`, (await region.count()) > 0);
  }
  for (const [width, name] of [
    [1500, 'desktop'],
    [1000, 'compact'],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, w) =>
        BrowserWindow.getAllWindows()[0].setBounds({ width: w, height: 1000 }),
      width,
    );
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(base, `${name}.png`) });
    proof.captures.push(`${name}.png`);
  }
  const collision = await page.evaluate(
    async (p) => window.metroforge.getRoomCollision(p, 'room_001'),
    project,
  );
  check(
    'Native collision IPC still exposes the 48 stair treads',
    collision.rects.filter((r) => r.w === 160 && r.h === 32).length === 48,
  );
  for (const file of guarded)
    check(`Read-only inspection preserves ${file}`, digest(file) === before[file]);
  check('No renderer exceptions', proof.errors.length === 0);
  proof.passed = true;
} catch (error) {
  proof.passed = false;
  proof.error = String(error.stack ?? error);
  process.exitCode = 1;
  if (page) await page.screenshot({ path: join(base, 'failure.png') }).catch(() => {});
} finally {
  if (app) await app.close();
  writeFileSync(join(base, 'ui-proof.json'), JSON.stringify(proof, null, 2));
  console.log(
    JSON.stringify({ passed: proof.passed, checks: proof.checks.length, error: proof.error }),
  );
}
