/** Saved original CUDA artwork and a staged three-storey wing in the actual packaged Rooms UI. */
import assert from 'node:assert/strict';
import { _electron } from 'playwright';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  executable = process.argv[2],
  source = process.argv[3];
assert.ok(executable && source);
assert.match(executable, /^E:[\\/]/i);
const output = join(repo, 'reports/game-tests/20261004-castle-interior-ui', String(Date.now()));
for (const dir of ['games', 'data', 'temp', 'appdata', 'localappdata', 'workspace'])
  mkdirSync(join(output, dir), { recursive: true });
writeFileSync(join(output, 'empty.env'), '');
const project = join(output, 'games/stormglass-castle');
cpSync(source, project, {
  recursive: true,
  filter: (path) => !['.godot', 'qa', 'reports'].includes(basename(path)),
});
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const files = [
  'data/rooms/rooms.json',
  'data/visual/castle-spatial-profile.json',
  'data/visual/castle-interiors.json',
  'generation_manifest.json',
  'world_graph.json',
  'game_dna.json',
  'scenes/rooms/room_001.tscn',
  'scripts/world/StormglassDecor.gd',
  'scripts/world/RoomTileMap.gd',
];
const before = Object.fromEntries(files.map((f) => [f, sha(join(project, f))]));
const config = () =>
  JSON.parse(readFileSync(join(project, 'data/visual/biome-backgrounds.json'), 'utf8'));
const asset = config().biomes.biome_0.assetId;
const proof = {
  output,
  project,
  executable,
  checks: [],
  captures: [],
  pageErrors: [],
  scope:
    'Final packaged Rooms UI, real Apply/Undo/reapply and native collision IPC on saved original CUDA art. No fresh inference in this test; workshop generation has its own receipt.',
};
const check = (label, passed) => {
  proof.checks.push({ label, passed: !!passed });
  console.log(JSON.stringify({ check: label, passed: !!passed }));
  assert.ok(passed, label);
};
let app, page;
async function capture(file) {
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const result = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return {
      visible: win.isVisible(),
      png: (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }))
        .toPNG()
        .toString('base64'),
    };
  });
  check('capture remains hidden: ' + file, !result.visible);
  writeFileSync(join(output, file), Buffer.from(result.png, 'base64'));
  proof.captures.push(file);
}
try {
  const env = {
    ...process.env,
    TEMP: join(output, 'temp'),
    TMP: join(output, 'temp'),
    APPDATA: join(output, 'appdata'),
    LOCALAPPDATA: join(output, 'localappdata'),
    METROFORGE_ENV_FILE: join(output, 'empty.env'),
    METROFORGE_DESKTOP_HIDDEN: '1',
    METROFORGE_DATA_DIR: join(output, 'data'),
    METROFORGE_GENERATED_GAMES_DIR: join(output, 'games'),
    METROFORGE_WORKSPACE_DIR: join(output, 'workspace'),
  };
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'VITE_DEV_SERVER_URL',
    'METROFORGE_DESKTOP_SMOKE',
    'METROFORGE_OPEN_DEVTOOLS',
  ])
    delete env[key];
  app = await _electron.launch({
    executablePath: executable,
    cwd: repo,
    env,
    args: [],
    timeout: 60000,
  });
  page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => proof.pageErrors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.setBackgroundThrottling(false);
    win.setBounds({ width: 1500, height: 1000 });
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
  await page.waitForFunction(
    () =>
      !document
        .querySelector('.room-tile-workspace')
        ?.textContent?.includes('Loading tileset artwork'),
  );
  const region = page.getByRole('region', { name: 'Castle biome background', exact: true });
  check(
    'saved original generated image is selected',
    (await region.getByLabel('Castle background', { exact: true }).inputValue()) === asset,
  );
  await page.locator('.room-editor-canvas [data-continuous-panorama]').waitFor();
  check(
    'preview excludes the baked perspective floor',
    (await page
      .locator('.room-editor-canvas [data-continuous-panorama]')
      .getAttribute('data-source-height')) === '432',
  );
  check(
    'one wall composition has no repeated scene bands',
    (await page.locator('.room-editor-canvas [data-continuous-panorama]').count()) === 1 &&
      (await page.locator('.room-editor-canvas [data-castle-band]').count()) === 0,
  );
  const geometry = await page.evaluate(
    async (p) => window.metroforge.getRoomCollision(p, 'room_001'),
    project,
  );
  const layout = JSON.parse(
    readFileSync(join(project, 'data/visual/castle-interiors.json'), 'utf8'),
  ).rooms.room_001;
  check(
    'actual native scene contains middle and upper floors',
    geometry.source === 'godot_scene' &&
      [992, 512].every((y) => geometry.rects.some((r) => r.y === y && r.w >= 1024)),
  );
  check(
    'internal door headers leave 192px walk-through openings',
    geometry.rects.filter((r) => r.w === 32 && r.h === 288).length === 3 &&
      layout.sections.length === 8,
  );
  const opacity = region.getByLabel('Background opacity', { exact: true });
  await opacity.fill('0.85');
  await region.getByRole('button', { name: 'Apply background', exact: true }).click();
  await region
    .getByRole('status')
    .filter({ hasText: 'Background applied across 40 castle rooms' })
    .waitFor();
  check('Apply saves through actual IPC', config().biomes.biome_0.opacity === 0.85);
  await region.getByRole('button', { name: 'Undo background', exact: true }).click();
  await region.getByRole('status').filter({ hasText: 'Previous background restored' }).waitFor();
  check('Undo restores the original opacity', config().biomes.biome_0.opacity === 0.9);
  await opacity.fill('0.85');
  await region.getByRole('button', { name: 'Apply background', exact: true }).click();
  await region
    .getByRole('status')
    .filter({ hasText: 'Background applied across 40 castle rooms' })
    .waitFor();
  await opacity.fill('0.9');
  await region.getByRole('button', { name: 'Apply background', exact: true }).click();
  await region
    .getByRole('status')
    .filter({ hasText: 'Background applied across 40 castle rooms' })
    .waitFor();
  await capture('01-three-storey-rooms-editor.png');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1000, height: 900 }),
  );
  await page.waitForFunction(() => innerWidth <= 1000 && innerWidth >= 960);
  check(
    'narrow editor keeps document bounds',
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  );
  await capture('02-three-storey-narrow.png');
  check(
    'layout, native scenes and asset registry survive background editing',
    Object.entries(before).every(([f, h]) => sha(join(project, f)) === h),
  );
  check('renderer has no exceptions', proof.pageErrors.length === 0);
  for (const file of ['dist/assets/main.js', 'dist-electron/handlers.js'])
    check(
      'exact final portable build: ' + file,
      sha(join(repo, 'apps/desktop', file)) ===
        sha(join(dirname(executable), 'resources/app', file)),
    );
  proof.beforeHashes = before;
  proof.packaged = { executable, sha256: sha(executable) };
  proof.passed = true;
  proof.productionReady = false;
} catch (error) {
  proof.passed = false;
  proof.error = String(error.stack ?? error);
  if (page)
    try {
      await capture('failure.png');
    } catch {}
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  writeFileSync(join(output, 'proof.json'), JSON.stringify(proof, null, 2));
  writeFileSync(
    join(repo, 'reports/game-tests/20261004-castle-interior-ui/latest.json'),
    JSON.stringify(proof, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: proof.passed,
      checks: proof.checks.length,
      output,
      error: proof.error,
    }),
  );
}
