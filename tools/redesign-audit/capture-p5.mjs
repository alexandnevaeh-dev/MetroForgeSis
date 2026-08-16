/**
 * P5 Ship / Export / Settings screenshots → redesign-audit/screenshots/p5/
 *
 *   node tools/redesign-audit/capture-p5.mjs
 */
import { mkdirSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const DESKTOP = join(REPO, 'apps', 'desktop');
const OUT = join(REPO, 'redesign-audit', 'screenshots', 'p5');
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
    await sleep(350);
    return true;
  }
  return false;
}

async function main() {
  if (!existsSync(MAIN)) {
    console.error('Missing dist-electron/main.js — build desktop first');
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  const project = pickProject();
  console.log(`Project: ${project}`);
  console.log(`Out: ${OUT}`);

  const app = await electron.launch({
    executablePath: electronPath,
    args: [MAIN],
    env: {
      ...process.env,
      METROFORGE_SCREENSHOT: '1',
      METROFORGE_SCREENSHOT_SKIP_GENERATION: '1',
    },
  });
  const page = await app.firstWindow();
  await waitSettled(page);
  await ensureSidebarExpanded(page);
  await setProject(page, project);
  await resize(app, page, 1600, 900);

  const shots = [];
  const smoke = {
    export: 0,
    settings: 0,
    dashboard: 0,
    health: 0,
    jump: 0,
    models1366: 0,
    statusBar: 0,
  };

  await goNav(page, 'Dashboard');
  await sleep(800);
  shots.push(await shot(page, '01-dashboard-readiness'));
  smoke.dashboard += (await page.locator('.readiness-summary').count()) > 0 ? 1 : 0;
  smoke.statusBar += (await page.locator('.status-bar').count()) > 0 ? 1 : 0;

  await goNav(page, 'Export');
  await sleep(1000);
  shots.push(await shot(page, '02-export-preflight'));
  smoke.export += (await page.locator('.export-screen, .readiness-summary').count()) > 0 ? 1 : 0;
  // Force warning visible
  await maybeClick(page, 'label:has-text("Force export") input, input[type="checkbox"]');
  // Prefer the force checkbox specifically
  const force = page.locator('label.check-inline:has-text("Force") input');
  if ((await force.count()) > 0) {
    await force.check().catch(() => {});
    await sleep(300);
  }
  shots.push(await shot(page, '03-export-force-warning'));
  smoke.export += 1;

  await goNav(page, 'Settings');
  await sleep(800);
  shots.push(await shot(page, '04-settings-general'));
  smoke.settings += (await page.locator('.settings-layout').count()) > 0 ? 1 : 0;
  await maybeClick(page, 'button.settings-nav-item:has-text("Paths")');
  await sleep(400);
  shots.push(await shot(page, '05-settings-paths-godot'));
  smoke.settings += 1;
  await maybeClick(page, 'button.settings-nav-item:has-text("Diagnostics")');
  await sleep(400);
  shots.push(await shot(page, '06-settings-diagnostics'));

  await maybeClick(page, '.topbar-health');
  await sleep(500);
  shots.push(await shot(page, '07-health-popover'));
  smoke.health += (await page.locator('.health-popover').count()) > 0 ? 1 : 0;

  await page.keyboard.press('Control+k');
  await sleep(500);
  shots.push(await shot(page, '08-jump-palette'));
  smoke.jump += (await page.locator('.goto-palette').count()) > 0 ? 1 : 0;
  await page.keyboard.press('Escape');

  await goNav(page, 'QA');
  await sleep(1000);
  shots.push(await shot(page, '09-qa-readiness'));

  await goNav(page, 'Models');
  await sleep(800);
  await resize(app, page, 1366, 768);
  await ensureSidebarExpanded(page);
  await sleep(600);
  shots.push(await shot(page, '10-models-1366'));
  smoke.models1366 += 1;

  await resize(app, page, 1920, 1080);
  await ensureSidebarExpanded(page);
  await goNav(page, 'Export');
  await sleep(600);
  shots.push(await shot(page, '11-export-1920'));

  const manifest = {
    phase: 'P5',
    capturedAt: new Date().toISOString(),
    viewportPrimary: '1600x900',
    project,
    shots,
    smoke,
    notes: 'Real IPC states only — no mocked READY/export artifacts',
  };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Wrote manifest.json');
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
