/**
 * P4 AI ops screenshots → redesign-audit/screenshots/p4/
 *
 *   node tools/redesign-audit/capture-p4.mjs
 */
import { mkdirSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const DESKTOP = join(REPO, 'apps', 'desktop');
const OUT = join(REPO, 'redesign-audit', 'screenshots', 'p4');
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

async function waitForAiOps(page) {
  await page.waitForSelector('.ai-ops-workbench, .models-screen, .providers-screen, .routing-inspector, .qa-screen', {
    timeout: 30000,
  });
  await sleep(600);
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
  const smoke = { models: 0, providers: 0, routing: 0, qa: 0 };

  // 01 Models
  await goNav(page, 'Models');
  await waitForAiOps(page);
  await page.waitForSelector('.ai-ops-models, .models-catalog-table, .virtualized-table', { timeout: 30000 }).catch(() => {});
  await sleep(800);
  shots.push(await shot(page, '01-models'));
  smoke.models += (await maybeClick(page, '.virtualized-row')) ? 1 : 0;

  // 02 model selected
  await maybeClick(page, '.virtualized-row');
  await sleep(400);
  shots.push(await shot(page, '02-model-selected'));
  smoke.models += 1;

  // 03 Providers
  await goNav(page, 'Providers');
  await waitForAiOps(page);
  await page.waitForSelector('.provider-card, .provider-health-summary, .ai-ops-providers', { timeout: 45000 }).catch(() => {});
  await sleep(1000);
  shots.push(await shot(page, '03-providers'));
  smoke.providers += (await page.locator('.provider-card').count()) > 0 ? 1 : 0;
  smoke.providers += (await maybeClick(page, 'button:has-text("Refresh Health")')) ? 1 : 0;
  await sleep(1200);

  // Routing — prefer honest IMAGE_GENERATION state (may be zero candidates)
  await goNav(page, 'Routing');
  await waitForAiOps(page);
  const capSelect = page.locator('.routing-cap-label select, select').filter({ hasText: /IMAGE|REASONING|JSON/ }).first();
  // set capability via first labeled select in header
  const selects = page.locator('.routing-header-actions select, .screen-header select, .routing-inspector select');
  if ((await selects.count()) > 0) {
    try {
      await selects.first().selectOption('IMAGE_GENERATION');
    } catch {
      /* keep default */
    }
  }
  await maybeClick(page, 'button:has-text("Refresh Routing")');
  await sleep(1200);
  shots.push(await shot(page, '04-routing-no-route'));
  smoke.routing += 1;

  // Candidates view (whatever real data returns — may still be empty)
  await maybeClick(page, 'button:has-text("Refresh Routing")');
  await sleep(800);
  // try a text capability that often has candidates
  if ((await selects.count()) > 0) {
    try {
      await selects.first().selectOption('JSON_GENERATION');
      await sleep(1000);
    } catch {
      /* ignore */
    }
  }
  shots.push(await shot(page, '05-routing-candidates'));
  smoke.routing += 1;

  // Rejected pane focus — scroll reject list into view
  await page.locator('.routing-reject-list, .routing-side-stack').first().scrollIntoViewIfNeeded().catch(() => {});
  await maybeClick(page, 'button:has-text("View details")');
  await sleep(400);
  shots.push(await shot(page, '06-routing-rejected'));
  smoke.routing += 1;

  // QA
  await goNav(page, 'QA');
  await waitForAiOps(page);
  await page.waitForSelector('.qa-layout-3, .qa-screen', { timeout: 30000 }).catch(() => {});
  await sleep(900);
  shots.push(await shot(page, '07-qa-full'));
  smoke.qa += 1;

  await page.locator('.qa-env-col').first().scrollIntoViewIfNeeded().catch(() => {});
  shots.push(await shot(page, '08-qa-environment'));
  smoke.qa += (await maybeClick(page, '.qa-doctor-row-btn')) ? 1 : 0;

  await page.locator('.qa-gates-col').first().scrollIntoViewIfNeeded().catch(() => {});
  await maybeClick(page, '.mf-tabs button:has-text("failed"), button:has-text("failed")');
  await sleep(300);
  shots.push(await shot(page, '09-qa-project-gates'));
  smoke.qa += 1;

  await page.locator('.qa-checkpoints-col').first().scrollIntoViewIfNeeded().catch(() => {});
  shots.push(await shot(page, '10-qa-checkpoints'));
  smoke.qa += 1;

  // Multi-res Models
  await goNav(page, 'Models');
  await waitForAiOps(page);
  await resize(app, page, 1920, 1080);
  shots.push(await shot(page, '01-models-1920'));
  await resize(app, page, 1366, 768);
  shots.push(await shot(page, '01-models-1366'));

  const statusVisible = (await page.locator('.status-bar, footer.status-bar, .app-statusbar').count()) > 0;

  const manifest = {
    capturedAt: new Date().toISOString(),
    project,
    viewportPrimary: '1600x900',
    shots: shots.map((s) => s.file),
    smoke,
    statusBarVisible: statusVisible,
  };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Smoke:', smoke);
  console.log('Done:', shots.length, 'screenshots');

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
