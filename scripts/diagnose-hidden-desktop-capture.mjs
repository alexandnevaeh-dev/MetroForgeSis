import { _electron } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const repo = resolve(process.argv[2] ?? '.');
const desktop = join(repo, 'apps/desktop');
const require = createRequire(join(desktop, 'package.json'));
const output = join(repo, 'reports/hidden-capture-' + Date.now());
for (const name of ['temp', 'data', 'appdata', 'localappdata', 'GeneratedGames']) mkdirSync(join(output, name), { recursive: true });
const env = { ...process.env, TEMP: join(output, 'temp'), TMP: join(output, 'temp'),
  METROFORGE_DATA_DIR: join(output, 'data'), METROFORGE_GENERATED_GAMES_DIR: join(output, 'GeneratedGames'),
  APPDATA: join(output, 'appdata'), LOCALAPPDATA: join(output, 'localappdata'), METROFORGE_RESOURCE_ROOT: repo, METROFORGE_DESKTOP_HIDDEN: '1' };
for (const key of ['ELECTRON_RUN_AS_NODE', 'VITE_DEV_SERVER_URL', 'METROFORGE_DESKTOP_SMOKE', 'METROFORGE_OPEN_DEVTOOLS']) delete env[key];
let app;
try {
  app = await _electron.launch({ executablePath: require('electron'), args: [desktop], cwd: repo, env, timeout: 60000 });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  await page.locator('aside.sidebar button.nav-item').filter({ hasText: 'New Game' }).first().click();
  await page.getByRole('radio').nth(2).click();
  await page.getByLabel('Project title', { exact: true }).fill('Capture diagnostic');
  for (const [width, height] of [[1600, 1100], [1000, 720], [1600, 1100]]) {
    await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), { width, height });
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running' || animation.effect?.getComputedTiming().iterations === Infinity));
    if (width === 1000) await page.getByLabel('Seed', { exact: true }).scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const captured = await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const image = await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
      return { bytes: image.toPNG().toString('base64'), size: image.getSize(), visible: window.isVisible() };
    });
    if (captured.visible || !captured.size.width || !captured.size.height) throw new Error('Hidden capture contract failed');
    const path = join(output, width + 'x' + height + '-' + Date.now() + '.png');
    writeFileSync(path, Buffer.from(captured.bytes, 'base64'));
    console.log(JSON.stringify({ path, size: captured.size, visible: captured.visible, viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })) }));
  }
} finally {
  if (app) await app.close();
}
