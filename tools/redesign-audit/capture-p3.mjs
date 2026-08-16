/**
 * P3 world-building screenshots → redesign-audit/screenshots/p3/
 *
 *   node tools/redesign-audit/capture-p3.mjs
 */
import { mkdirSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const DESKTOP = join(REPO, 'apps', 'desktop');
const OUT = join(REPO, 'redesign-audit', 'screenshots', 'p3');
const require = createRequire(join(DESKTOP, 'package.json'));
const electronPath = require('electron');
const MAIN = join(DESKTOP, 'dist-electron', 'main.js');

const CANDIDATES = [
  join(REPO, 'GeneratedGames', 'a-wind-swept-marsh-kingdom-with-a-hidden-crypt'),
  join(REPO, 'GeneratedGames', 'nvidia-image-activation-smoke'),
];

function pickProject() {
  if (process.env.METROFORGE_SCREENSHOT_PROJECT) {
    return resolve(process.env.METROFORGE_SCREENSHOT_PROJECT);
  }
  for (const p of CANDIDATES) {
    if (existsSync(p)) return p;
  }
  const root = join(REPO, 'GeneratedGames');
  if (existsSync(root)) {
    const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
    if (dirs.length) return join(root, dirs[0].name);
  }
  return CANDIDATES[CANDIDATES.length - 1];
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitSettled(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('.app', { timeout: 90000 });
  await sleep(700);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await sleep(400);
}

async function ensureSidebarExpanded(page) {
  if ((await page.locator('.app.sidebar-collapsed').count()) > 0) {
    await page.keyboard.press('Control+b');
    await sleep(400);
  }
}

async function setProject(page, projectPath) {
  await page.evaluate((path) => {
    try {
      sessionStorage.setItem('metroforge.activeProjectPath', path);
    } catch {
      /* ignore */
    }
  }, projectPath);
  const select = page.locator('.topbar-project select, .project-select select').first();
  if (await select.count()) {
    try {
      await select.selectOption({ value: projectPath });
    } catch {
      await page.reload();
      await waitSettled(page);
      await page.evaluate((path) => sessionStorage.setItem('metroforge.activeProjectPath', path), projectPath);
      await page.reload();
    }
  } else {
    await page.reload();
  }
  await waitSettled(page);
}

async function goNav(page, label) {
  await page.locator(`aside.sidebar button.nav-item:has-text("${label}")`).first().click();
  await waitSettled(page);
}

async function resize(app, page, w, h) {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      win.setSize(size.w, size.h, false);
      win.center();
    },
    { w, h },
  );
  await page.setViewportSize({ width: w, height: h });
  await sleep(400);
}

async function shot(page, name) {
  const file = `${name}.png`;
  const path = join(OUT, file);
  await page.screenshot({ path, fullPage: false });
  const st = statSync(path);
  console.log(`  ✓ ${file} (${st.size} bytes)`);
  return { file, bytes: st.size };
}

async function maybeClick(page, selector) {
  const loc = page.locator(selector).first();
  if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
    await loc.click({ timeout: 3000 }).catch(() => {});
    await sleep(400);
    return true;
  }
  return false;
}

async function smokeWorldDock(page) {
  const checks = [];
  checks.push(await maybeClick(page, '.editor-dock button:has-text("Structure"), .mf-segment:has-text("Structure")'));
  checks.push(await maybeClick(page, '.editor-dock button:has-text("Connections"), .mf-segment:has-text("Connections")'));
  checks.push(await maybeClick(page, '.editor-dock button:has-text("Checkpoints"), .mf-segment:has-text("Checkpoints")'));
  checks.push(await maybeClick(page, '.editor-dock button:has-text("Structure"), .mf-segment:has-text("Structure")'));
  return checks.filter(Boolean).length;
}

async function smokeRoomTools(page) {
  const roomItem = page.locator('.virtualized-room-list button, .room-item').first();
  if (await roomItem.count()) {
    await roomItem.click().catch(() => {});
    await sleep(400);
  }
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Visual"), button.tab:has-text("Visual")');
  await maybeClick(page, '.editor-tool-btn:has-text("Paint")');
  await maybeClick(page, '.editor-tool-btn:has-text("Erase")');
  await maybeClick(page, '.editor-tool-btn:has-text("Select")');
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Collision")');
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Debug")');
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Visual")');
}

async function main() {
  if (!existsSync(MAIN)) {
    console.error('Missing dist-electron/main.js — build desktop first');
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const projectPath = pickProject();
  if (!existsSync(projectPath)) {
    console.error(`Project not found: ${projectPath}`);
    process.exit(1);
  }
  console.log(`Project: ${projectPath}`);

  const app = await electron.launch({
    executablePath: electronPath,
    args: [MAIN],
    cwd: DESKTOP,
    env: { ...process.env, VITE_DEV_SERVER_URL: '' },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(45000);
  page.on('dialog', async (d) => {
    await d.dismiss().catch(() => {});
  });
  await waitSettled(page);
  await resize(app, page, 1920, 1080);
  await setProject(page, projectPath);
  await ensureSidebarExpanded(page);

  const results = [];
  const smoke = { worldDock: 0, roomTools: false, preview: false, dungeon: false };

  // 01–03 World views
  await goNav(page, 'World Editor');
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Progression"), button.tab:has-text("Progression")');
  results.push(await shot(page, '01-world-progression'));
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Graph"), button.tab:has-text("Graph")');
  results.push(await shot(page, '02-world-graph'));
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Spatial"), button.tab:has-text("Spatial")');
  results.push(await shot(page, '03-world-spatial'));
  smoke.worldDock = await smokeWorldDock(page);
  results.push(await shot(page, '04-world-dock'));

  // 05–09 Room modes
  await goNav(page, 'Room Editor');
  await smokeRoomTools(page);
  smoke.roomTools = true;
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Visual"), button.tab:has-text("Visual")');
  results.push(await shot(page, '05-room-visual'));
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Collision"), button.tab:has-text("Collision")');
  results.push(await shot(page, '06-room-collision'));
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Entities"), button.tab:has-text("Entities")');
  results.push(await shot(page, '07-room-entities'));
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Navigation"), button.tab:has-text("Navigation")');
  results.push(await shot(page, '08-room-navigation'));
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Debug"), button.tab:has-text("Debug")');
  results.push(await shot(page, '09-room-debug'));

  // 10 Dungeon
  await goNav(page, 'Dungeon Editor');
  smoke.dungeon = true;
  results.push(await shot(page, '10-dungeon'));

  // 11 Game Preview
  await goNav(page, 'Game Preview');
  smoke.preview = true;
  results.push(await shot(page, '11-game-preview'));

  // Multi-res: room visual @ 1600 / 1366 (+ 1920 already)
  await goNav(page, 'Room Editor');
  await maybeClick(page, '.mf-view-mode-tabs button:has-text("Visual")');
  for (const [w, h, tag] of [
    [1600, 900, '1600'],
    [1366, 768, '1366'],
  ]) {
    await resize(app, page, w, h);
    await ensureSidebarExpanded(page);
    await goNav(page, 'Room Editor');
    results.push(await shot(page, `05-room-visual-${tag}`));
  }

  await app.close();
  const manifest = {
    capturedAt: new Date().toISOString(),
    projectPath,
    note: 'P3 world-building screenshots; wind-swept preferred when present; no fake data',
    smoke,
    files: results,
  };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${results.length} p3 screenshots`);
  console.log('Smoke:', JSON.stringify(smoke));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
