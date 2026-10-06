/** Real packaged workshop -> local SDXL/CUDA -> saved castle backdrop. No image mocks. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { _electron } from 'playwright';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.argv[2],
  source = process.argv[3];
assert.ok(executable && source, 'Pass packaged executable and pristine castle game');
const output = join(repo, 'reports/game-tests/20261004-castle-continuity-ui', String(Date.now()));
for (const name of ['data', 'temp', 'appdata', 'localappdata', 'games', 'workspace'])
  mkdirSync(join(output, name), { recursive: true });
const project = join(output, 'games/stormglass-castle');
cpSync(source, project, {
  recursive: true,
  filter: (path) => !['.godot', 'qa', 'reports'].includes(basename(path)),
});
// Upgrade only the isolated candidate renderer and author a receding bay profile.
cpSync(
  join(repo, 'templates/godot-metroidvania/scripts/world/StormglassDecor.gd'),
  join(project, 'scripts/world/StormglassDecor.gd'),
);
writeFileSync(
  join(project, 'data/visual/castle-spatial-profile.json'),
  JSON.stringify(
    { version: 1, rooms: ['room_001'], panoramaHeight: 256, panoramaMode: 'continuous', stoneGrade: [0.54, 0.67, 0.84] },
    null,
    2,
  ),
);
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const original = JSON.parse(readFileSync(join(project, 'generation_manifest.json'), 'utf8'));
const originalIds = new Set(original.artifacts.map((row) => row.id));
const protectedFiles = [
  'data/rooms/rooms.json',
  'world_graph.json',
  'game_dna.json',
  'scripts/world/StormglassDecor.gd',
  'scripts/world/RoomTileMap.gd',
];
function listAssets(path = 'assets') {
  return readdirSync(join(project, path), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listAssets(`${path}/${entry.name}`) : [`${path}/${entry.name}`],
  );
}
const before = Object.fromEntries(
  [...protectedFiles, ...listAssets()].map((path) => [path, sha(join(project, path))]),
);
const topdown = 'E:/Metroforge/MetroForge-Publish/GeneratedGames/test-games/topdown/current';
const topdownManifest = sha(join(topdown, 'generation_manifest.json'));
const env = {
  ...process.env,
  METROFORGE_ENV_FILE: 'E:/Metroforge/MetroForge-Publish/.env',
  DIFFUSERS_PYTHON: 'E:/MetroForgeData/Python/diffusers-native/Scripts/python.exe',
  DIFFUSERS_MODEL_ID: 'E:/Metroforge/Recovery-Audit/models/sdxl-base-1.0',
  DIFFUSERS_BASE_MODEL_PATH: 'E:/Metroforge/Recovery-Audit/models/sdxl-base-1.0',
  DIFFUSERS_CPU_OFFLOAD: '1',
  METROFORGE_DIFFUSION_DEVICE: 'cuda',
  METROFORGE_GPU_DIFFUSION_TIMEOUT_MS: '780000',
  HF_HUB_OFFLINE: '1',
  TRANSFORMERS_OFFLINE: '1',
  HF_HOME: 'E:/MetroForgeData/Cache/huggingface',
  TORCH_HOME: 'E:/MetroForgeData/Cache/torch',
  OLLAMA_BASE_URL: 'http://127.0.0.1:1',
  TEMP: join(output, 'temp'),
  TMP: join(output, 'temp'),
  APPDATA: join(output, 'appdata'),
  LOCALAPPDATA: join(output, 'localappdata'),
  METROFORGE_DATA_DIR: join(output, 'data'),
  METROFORGE_GENERATED_GAMES_DIR: join(output, 'games'),
  METROFORGE_WORKSPACE_DIR: join(output, 'workspace'),
  METROFORGE_DESKTOP_HIDDEN: '1',
};
for (const key of [
  'ELECTRON_RUN_AS_NODE',
  'VITE_DEV_SERVER_URL',
  'METROFORGE_DESKTOP_SMOKE',
  'METROFORGE_OPEN_DEVTOOLS',
])
  delete env[key];
const proof = {
  output,
  project,
  executable,
  checks: [],
  captures: [],
  pageErrors: [],
  scope:
    'Actual packaged UI and saved project, one local CUDA generation, preview/save/undo/reapply. Native gameplay and visual acceptance are separate.',
};
let app, page;
const check = (label, passed) => {
  proof.checks.push({ label, passed: !!passed });
  console.log(JSON.stringify({ check: label, passed: !!passed }));
  assert.ok(passed, label);
};
async function capture(file) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const image = await app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    return {
      visible: win.isVisible(),
      data: (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true }))
        .toPNG()
        .toString('base64'),
    };
  });
  check('capture stays hidden: ' + file, !image.visible);
  writeFileSync(join(output, file), Buffer.from(image.data, 'base64'));
  proof.captures.push(file);
}
try {
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
  const settings = await page.evaluate(() =>
    window.metroforge.setAppSettings({
      'app.provider.comfyui.enabled': 'false',
      'app.provider.diffusers.enabled': 'true',
      'app.provider.automatic1111.enabled': 'false',
      'app.provider.ollama.enabled': 'false',
      'app.provider.pollinations.enabled': 'false',
    }),
  );
  check('local generation settings saved by the application', settings.success);
  const nav = (name) =>
    page
      .locator('.nav-item')
      .filter({ has: page.locator('.nav-function', { hasText: new RegExp(`^${name}$`) }) });
  await nav('Generator').click();
  const screen = page.locator('.generate-asset-screen');
  await screen.getByRole('heading', { name: 'Asset workshop', exact: true }).waitFor();
  await screen.locator('.project-select select').selectOption(project);
  const hide = page.getByRole('button', { name: 'Hide forge activity', exact: true });
  if (await hide.count()) await hide.click();
  check(
    'background detail is hidden for actor and item roles',
    (await screen.getByLabel('Background detail', { exact: true }).count()) === 0,
  );
  await screen.getByLabel('Asset type', { exact: true }).selectOption('background');
  const detail = screen.getByLabel('Background detail', { exact: true });
  check('existing standard canvas remains the default', (await detail.inputValue()) === 'standard');
  await detail.focus();
  await detail.press('ArrowDown');
  await detail.press('Enter');
  check(
    'detail selector supports native keyboard selection',
    (await detail.inputValue()) === 'detailed',
  );
  await screen.getByLabel('Provider mode', { exact: true }).selectOption('LOCAL_ONLY');
  await screen.getByLabel('Seed', { exact: true }).fill('20261005');
  await screen
    .getByLabel('Prompt', { exact: true })
    .fill(
      'Flat dark gothic masonry wall, side elevation, small weathered stone blocks, recessed arches, no floor, no stairs, no perspective, no objects',
    );
  const registryBefore = sha(join(project, 'generation_manifest.json'));
  const invalid = await page.evaluate(
    (projectPath) =>
      window.metroforge.generateAsset({
        projectPath,
        description: 'Castle',
        assetType: 'background',
        operation: 'create',
        generationMode: 'LOCAL_ONLY',
        backgroundDetail: 'ultra',
      }),
    project,
  );
  check(
    'real IPC refuses invalid detail before changing the registry',
    !invalid.success &&
      invalid.errors.join().includes('Choose standard or detailed') &&
      sha(join(project, 'generation_manifest.json')) === registryBefore,
  );
  await screen.getByRole('button', { name: 'Generate alternative', exact: true }).click();
  check('detail selector locks while generation is busy', await detail.isDisabled());
  await capture('01-cuda-generation.png');
  console.log(JSON.stringify({ phase: 'live-cuda-generation', output }));
  await page.waitForFunction(
    () => !document.querySelector('.generate-asset-screen button[aria-busy="true"]'),
    null,
    { timeout: 810000 },
  );
  proof.uiText = await screen.innerText();
  const manifest = JSON.parse(readFileSync(join(project, 'generation_manifest.json'), 'utf8'));
  const added = manifest.artifacts.filter((row) => !originalIds.has(row.id));
  check(
    'one new image is saved alongside the existing castle artwork',
    added.length === 1 && manifest.artifacts.length === original.artifacts.length + 1,
  );
  const asset = added[0];
  proof.asset = asset;
  check(
    'local SDXL reports actual CUDA execution without fallback',
    asset.provider === 'diffusers' &&
      !asset.fallbackGenerated &&
      asset.executionMetadata?.actualDevice === 'cuda' &&
      asset.executionMetadata?.computeBackend === 'cuda',
  );
  check(
    'native source request uses 1024 by 576 at twenty steps',
    asset.executionMetadata?.effectiveWidth === 1024 &&
      asset.executionMetadata?.effectiveHeight === 576 &&
      asset.executionMetadata?.effectiveSteps === 20,
  );
  const { decodePngRgba } = await import(
    pathToFileURL(join(repo, 'packages/assets/dist/png.js')).href
  );
  const compiled = decodePngRgba(readFileSync(join(project, asset.path))),
    raw = decodePngRgba(readFileSync(join(project, asset.sourcePath)));
  check(
    'the game retains full background detail',
    compiled.width === 1024 &&
      compiled.height === 576 &&
      raw.width === 1024 &&
      raw.height === 576 &&
      Buffer.from(compiled.rgba).equals(Buffer.from(raw.rgba)),
  );
  check(
    'interior plate is fully opaque',
    compiled.rgba.every((v, i) => i % 4 !== 3 || v === 255),
  );
  check(
    'all prior assets, room records and native scripts are preserved',
    Object.entries(before).every(([path, hash]) => sha(join(project, path)) === hash),
  );
  check(
    'actual top-down registry remains separate and unchanged',
    sha(join(topdown, 'generation_manifest.json')) === topdownManifest,
  );
  await screen.getByRole('button', { name: 'Inspect alternative 1', exact: true }).click();
  await screen.getByRole('img', { name: `Selected artwork: ${asset.id}`, exact: true }).waitFor();
  check(
    'the workshop shows saved dimensions and actual generation device',
    (await screen.getByText('Generated on cuda', { exact: true }).isVisible()) &&
      proof.uiText.includes('1024 × 576'),
  );
  await capture('02-detailed-background.png');
  await nav('Rooms').click();
  await page.locator('.room-editor-screen .project-select select').selectOption(project);
  const region = page.getByRole('region', { name: 'Castle biome background', exact: true });
  const originalSelection = await region
    .getByLabel('Castle background', { exact: true })
    .inputValue();
  await region.getByLabel('Castle background', { exact: true }).selectOption(asset.id);
  await region.getByRole('button', { name: 'Apply background', exact: true }).click();
  await region
    .getByRole('status')
    .filter({ hasText: 'Background applied across 40 castle rooms' })
    .waitFor();
  const config = () =>
    JSON.parse(readFileSync(join(project, 'data/visual/biome-backgrounds.json'), 'utf8'));
  check(
    'real Apply persists the detailed image across the castle biome',
    config().biomes.biome_0.path === asset.path,
  );
  await region.getByRole('button', { name: 'Undo background', exact: true }).click();
  await region.getByRole('status').filter({ hasText: 'Previous background restored' }).waitFor();
  check(
    'real Undo restores the previous background selection',
    (await region.getByLabel('Castle background', { exact: true }).inputValue()) ===
      originalSelection,
  );
  await region.getByLabel('Castle background', { exact: true }).selectOption(asset.id);
  await region.getByRole('button', { name: 'Apply background', exact: true }).click();
  await region
    .getByRole('status')
    .filter({ hasText: 'Background applied across 40 castle rooms' })
    .waitFor();
  const list = page.getByRole('listbox', { name: 'Rooms', exact: true });
  await list.focus();
  await list.press('ArrowDown');
  await page.waitForFunction(() =>
    document.querySelector('.room-canvas-status')?.textContent?.includes('room_001'),
  );
  await page.locator('.room-editor-canvas [data-castle-profile]').waitFor();
  await page.waitForFunction(() => !document.querySelector('.room-tile-workspace')?.textContent?.includes('Loading tileset artwork'));
  check('the editor explains continuous room composition', (await region.innerText()).includes('1 room uses one continuous composition aligned to the floor'));
  check(
    'gallery shows one continuous image without repeated bands',
    (await page.locator('.room-editor-canvas [data-castle-band]').count()) === 0 &&
      (await page.locator('.room-editor-canvas [data-continuous-panorama]').count()) === 1,
  );
  await capture('03-detailed-gallery-editor.png');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1000, height: 900 }),
  );
  await page.waitForFunction(() => window.innerWidth <= 1000 && window.innerWidth >= 960);
  check(
    'narrow desktop retains document bounds',
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  );
  await capture('04-detailed-gallery-narrow.png');
  check('renderer has no exceptions', proof.pageErrors.length === 0);
  proof.packaged = { executable, sha256: sha(executable) };
  for (const file of ['dist/assets/main.js', 'dist-electron/handlers.js'])
    check(
      'packaged app matches the tested build: ' + file,
      sha(join(repo, 'apps/desktop', file)) ===
        sha(join(dirname(executable), 'resources/app', file)),
    );
  for (const file of ['asset-pipeline.js', 'manual-image-plan.js', 'providers/diffusers.js'])
    check(
      'packaged image module matches the tested build: ' + file,
      sha(join(repo, 'packages/assets/dist', file)) ===
        sha(join(dirname(executable), 'resources/app/node_modules/@metroforge/assets/dist', file)),
    );
  proof.files = [asset.path, asset.sourcePath].map((path) => ({
    path,
    sha256: sha(join(project, path)),
  }));
  proof.beforeHashes = before;
  proof.passed = true;
  proof.productionReady = false;
} catch (error) {
  proof.passed = false;
  proof.error = String(error.stack ?? error);
  if (page) {
    try {
      proof.uiAtFailure = await page
        .locator('.generate-asset-screen, .room-editor-screen')
        .innerText();
      await capture('failure.png');
    } catch {}
  }
  process.exitCode = 1;
} finally {
  if (app) await app.close();
  writeFileSync(join(output, 'proof.json'), JSON.stringify(proof, null, 2));
  writeFileSync(
    join(repo, 'reports/game-tests/20261004-castle-continuity-ui/latest.json'),
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
