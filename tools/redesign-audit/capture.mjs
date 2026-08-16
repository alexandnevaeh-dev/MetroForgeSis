/**
 * Visual UI audit capture → redesign-audit/screenshots/
 * Read-only: launches built Electron app; does not mutate GeneratedGames.
 *
 *   node tools/redesign-audit/capture.mjs
 *
 * Env:
 *   METROFORGE_SCREENSHOT_PROJECT=<path>
 *   METROFORGE_SCREENSHOT_SKIP_GENERATION=1  (default: skip live generation)
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');
const DESKTOP = join(REPO, 'apps', 'desktop');
const OUT = join(REPO, 'redesign-audit', 'screenshots');
const RESP = join(OUT, 'responsive');
const OVERVIEW = join(REPO, 'redesign-audit', 'metroforge-current-ui-overview.png');

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
  return CANDIDATES[0];
}

const records = [];
const missing = [];

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function redactPaths(page) {
  await page.evaluate(() => {
    const mask = (text) =>
      String(text ?? '')
        .replace(/C:\\Users\\[^\\/]+/gi, 'C:\\Users\\<user>')
        .replace(/\/Users\/[^/]+/g, '/Users/<user>');
    const walk = (root) => {
      const all = root.querySelectorAll('*');
      all.forEach((el) => {
        if (el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE) {
          const t = el.textContent ?? '';
          if (/Users[/\\]/.test(t)) el.textContent = mask(t);
        }
        if (el instanceof HTMLElement && el.title && /Users[/\\]/.test(el.title)) {
          el.title = mask(el.title);
        }
      });
    };
    walk(document.body);
    document
      .querySelectorAll('input[type="password"], input[name*="key" i], input[id*="key" i]')
      .forEach((el) => {
        if (el instanceof HTMLInputElement) el.value = el.value ? '••••••••' : '';
      });
  });
}

async function ensureSidebarExpanded(page) {
  const collapsed = await page.locator('.app.sidebar-collapsed').count();
  if (collapsed > 0) {
    await page.keyboard.press('Control+b');
    await sleep(400);
  }
}

async function waitSettled(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('.app', { timeout: 90000 });
  await sleep(800);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await sleep(500);
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
      await page.evaluate((path) => {
        sessionStorage.setItem('metroforge.activeProjectPath', path);
      }, projectPath);
      await page.reload();
    }
  } else {
    await page.reload();
  }
  await waitSettled(page);
  // Reloads re-apply initial collapse if window briefly matched narrow MQ during launch.
}

async function goNav(page, label) {
  const btn = page.locator(`aside.sidebar button.nav-item:has-text("${label}")`).first();
  await btn.click();
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

async function shot(page, dir, fileBase, meta) {
  await redactPaths(page);
  const file = `${fileBase}.png`;
  const path = join(dir, file);
  await page.screenshot({ path, fullPage: false });
  const st = statSync(path);
  if (st.size < 8_000) missing.push({ file, reason: 'file too small — likely blank' });
  records.push({
    file: dir === RESP ? `screenshots/responsive/${file}` : `screenshots/${file}`,
    screen: meta.screen,
    state: meta.state,
    resolution: meta.resolution,
    notes: meta.notes ?? '',
  });
  console.log(`  ✓ ${file} (${st.size} bytes)`);
  return path;
}

async function maybeClick(page, selector) {
  const loc = page.locator(selector).first();
  if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
    await loc.click({ timeout: 3000 }).catch(() => {});
    await sleep(450);
    return true;
  }
  return false;
}

async function clickLayer(page, label) {
  const layerBtn = page.locator(`.layer-list-item:has-text("${label}"), button.editor-tool-btn:has-text("${label}")`).first();
  if (await layerBtn.count()) {
    await layerBtn.click().catch(() => {});
    await sleep(500);
    return true;
  }
  return maybeClick(page, `button.tab:has-text("${label}"), button[role="tab"]:has-text("${label}")`);
}

async function main() {
  if (!existsSync(MAIN)) {
    console.error('Missing dist-electron/main.js — build desktop first');
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  mkdirSync(RESP, { recursive: true });
  for (const dir of [OUT, RESP]) {
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.png')) {
        try {
          unlinkSync(join(dir, f));
        } catch {
          /* ignore */
        }
      }
    }
  }

  const projectPath = pickProject();
  if (!existsSync(projectPath)) {
    console.error(`Project not found: ${projectPath}`);
    process.exit(1);
  }
  console.log(`Project: ${projectPath}`);
  console.log(`Electron: ${electronPath}`);

  const app = await electron.launch({
    executablePath: electronPath,
    args: [MAIN],
    cwd: DESKTOP,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: '',
    },
  });

  const page = await app.firstWindow();
  page.setDefaultTimeout(45000);
  page.on('dialog', async (d) => {
    await d.dismiss().catch(() => {});
  });
  await waitSettled(page);

  const primary = { w: 1920, h: 1080, label: '1920x1080' };
  await resize(app, page, primary.w, primary.h);
  await setProject(page, projectPath);
  await ensureSidebarExpanded(page);

  // —— Principal 01–06 ——
  const navPrincipal = [
    { label: 'Dashboard', file: '01-dashboard', screen: 'Dashboard' },
    { label: 'New Game', file: '02-new-game', screen: 'Create' },
    { label: 'Generation Studio', file: '03-generation-studio', screen: 'Studio' },
    { label: 'Projects', file: '04-projects', screen: 'Projects' },
    { label: 'Asset Gallery', file: '05-asset-gallery', screen: 'Assets' },
    { label: 'Manual Generator', file: '06-manual-generator', screen: 'Generate Asset' },
  ];
  for (const item of navPrincipal) {
    console.log(`Principal: ${item.file}`);
    await goNav(page, item.label);
    await shot(page, OUT, item.file, {
      screen: item.screen,
      state: 'Default with active project',
      resolution: primary.label,
    });
  }

  // —— World editor views 07–09 ——
  console.log('Principal: world editor views');
  await goNav(page, 'World Editor');
  await maybeClick(page, 'button.tab:has-text("Progression")');
  await shot(page, OUT, '07-world-editor-progression', {
    screen: 'World',
    state: 'Progression view',
    resolution: primary.label,
  });
  await maybeClick(page, 'button.tab:has-text("Graph")');
  await shot(page, OUT, '08-world-editor-graph', {
    screen: 'World',
    state: 'Graph view',
    resolution: primary.label,
  });
  await maybeClick(page, 'button.tab:has-text("Spatial"), button.tab:has-text("overworld")');
  await shot(page, OUT, '09-world-editor-spatial', {
    screen: 'World',
    state: 'Spatial / overworld',
    resolution: primary.label,
  });

  // —— Room editor layers 10–15 ——
  console.log('Principal: room editor layers');
  await goNav(page, 'Room Editor');
  // Ensure a room is selected if list exists
  const roomItem = page.locator('.room-list button, .virtualized-row, .editor-room-list button').first();
  if (await roomItem.count()) {
    await roomItem.click().catch(() => {});
    await sleep(600);
  }
  const roomLayers = [
    ['Visual', '10-room-editor-visual'],
    ['Collision', '11-room-editor-collision'],
    ['Entities', '12-room-editor-entities'],
    ['Navigation', '13-room-editor-navigation'],
    ['Progression', '14-room-editor-progression'],
    ['Debug', '15-room-editor-debug'],
  ];
  for (const [label, file] of roomLayers) {
    const ok = await clickLayer(page, label);
    if (!ok) missing.push({ file: `${file}.png`, reason: `Layer control "${label}" not found` });
    await shot(page, OUT, file, {
      screen: 'Rooms',
      state: `${label} layer`,
      resolution: primary.label,
    });
  }

  // —— Remaining nav 16–23 ——
  const rest = [
    { label: 'Dungeon Editor', file: '16-dungeon-editor', screen: 'Dungeon' },
    { label: 'Game Preview', file: '17-game-preview', screen: 'Preview' },
    { label: 'Models', file: '18-models', screen: 'Models' },
    { label: 'Providers', file: '19-providers', screen: 'Providers' },
    { label: 'Routing Inspector', file: '20-routing-inspector', screen: 'Routing' },
    { label: 'QA', file: '21-qa', screen: 'QA' },
    { label: 'Export', file: '22-export', screen: 'Export' },
    { label: 'Settings', file: '23-settings', screen: 'Settings' },
  ];
  for (const item of rest) {
    console.log(`Principal: ${item.file}`);
    await goNav(page, item.label);
    await shot(page, OUT, item.file, {
      screen: item.screen,
      state: 'Default with active project',
      resolution: primary.label,
    });
  }

  // —— Alternates (no long generation) ——
  console.log('Alternates…');
  await goNav(page, 'Generation Studio');
  await shot(page, OUT, 'generation-idle', {
    screen: 'Studio',
    state: 'Idle / ready',
    resolution: primary.label,
  });
  // skip generation-running by default
  if (process.env.METROFORGE_SCREENSHOT_SKIP_GENERATION !== '0') {
    missing.push({
      file: 'generation-running.png',
      reason: 'Skipped (hang risk; set METROFORGE_SCREENSHOT_SKIP_GENERATION=0 to attempt)',
    });
  }

  await goNav(page, 'Asset Gallery');
  for (const [cat, file] of [
    ['Player', 'asset-gallery-player'],
    ['Tileset', 'asset-gallery-tileset'],
    ['Music', 'asset-gallery-music'],
  ]) {
    const clicked = await maybeClick(
      page,
      `.category-bar button:has-text("${cat}"), .tabs button:has-text("${cat}"), button.tab:has-text("${cat}")`,
    );
    if (!clicked) missing.push({ file: `${file}.png`, reason: `Category "${cat}" not found` });
    await shot(page, OUT, file, {
      screen: 'Assets',
      state: `${cat} category`,
      resolution: primary.label,
    });
  }

  await goNav(page, 'Routing Inspector');
  await shot(page, OUT, 'routing-provider-selected', {
    screen: 'Routing',
    state: 'Default / selected capability',
    resolution: primary.label,
  });
  await maybeClick(page, 'button:has-text("Refresh routing"), button.primary:has-text("Refresh")');
  await sleep(1200);
  await shot(page, OUT, 'routing-refreshed', {
    screen: 'Routing',
    state: 'After refresh',
    resolution: primary.label,
  });
  // Capture current empty-ish state if "No routable" visible — still useful as alt
  const bodyText = await page.locator('body').innerText();
  if (/No routable|unavailable|not configured|no provider/i.test(bodyText)) {
    await shot(page, OUT, 'routing-no-provider', {
      screen: 'Routing',
      state: 'No provider / no routable model indication',
      resolution: primary.label,
    });
  } else {
    missing.push({
      file: 'routing-no-provider.png',
      reason: 'No unavailable/no-provider empty state visible with current config',
    });
  }

  await goNav(page, 'QA');
  await shot(page, OUT, 'qa-default', {
    screen: 'QA',
    state: 'Default project QA view',
    resolution: primary.label,
  });
  const qaBody = await page.locator('body').innerText();
  if (/\bFAIL\b|\bFAILED\b|failure/i.test(qaBody)) {
    await shot(page, OUT, 'qa-failed', {
      screen: 'QA',
      state: 'Failure indicators visible',
      resolution: primary.label,
    });
  } else {
    missing.push({ file: 'qa-failed.png', reason: 'No FAIL indicators visible in current project' });
  }
  if (/\bPASS\b|\bPASSED\b|healthy/i.test(qaBody)) {
    await shot(page, OUT, 'qa-passed', {
      screen: 'QA',
      state: 'Pass/healthy indicators visible',
      resolution: primary.label,
    });
  } else {
    missing.push({ file: 'qa-passed.png', reason: 'No PASS indicators visible in current project' });
  }

  // —— Responsive ——
  const responsiveTargets = [
    { label: 'Dashboard', file: 'dashboard' },
    { label: 'Generation Studio', file: 'generation-studio' },
    { label: 'Asset Gallery', file: 'asset-gallery' },
    { label: 'World Editor', file: 'world-editor' },
    { label: 'Room Editor', file: 'room-editor' },
    { label: 'Routing Inspector', file: 'routing-inspector' },
  ];
  for (const res of [
    { w: 1600, h: 900, label: '1600x900' },
    { w: 1366, h: 768, label: '1366x768' },
  ]) {
    console.log(`Responsive: ${res.label}`);
    await resize(app, page, res.w, res.h);
    await setProject(page, projectPath);
    // 1366 naturally collapses; keep that. Expand at 1600 for readable labels.
    if (res.w >= 1600) await ensureSidebarExpanded(page);
    for (const t of responsiveTargets) {
      await goNav(page, t.label);
      await shot(page, RESP, `${t.file}-${res.label}`, {
        screen: t.label,
        state: 'Responsive check',
        resolution: res.label,
      });
    }
  }

  await resize(app, page, primary.w, primary.h);
  await ensureSidebarExpanded(page);

  // —— Contact sheet ——
  const principalFiles = [
    '01-dashboard.png',
    '02-new-game.png',
    '03-generation-studio.png',
    '04-projects.png',
    '05-asset-gallery.png',
    '06-manual-generator.png',
    '07-world-editor-progression.png',
    '08-world-editor-graph.png',
    '09-world-editor-spatial.png',
    '10-room-editor-visual.png',
    '11-room-editor-collision.png',
    '12-room-editor-entities.png',
    '13-room-editor-navigation.png',
    '14-room-editor-progression.png',
    '15-room-editor-debug.png',
    '16-dungeon-editor.png',
    '17-game-preview.png',
    '18-models.png',
    '19-providers.png',
    '20-routing-inspector.png',
    '21-qa.png',
    '22-export.png',
    '23-settings.png',
  ].filter((f) => existsSync(join(OUT, f)));

  const contactHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
  body{margin:0;background:#07090c;color:#e8eef6;font-family:Segoe UI,sans-serif}
  h1{padding:16px 20px;font-size:20px;font-weight:600;margin:0}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:16px 20px 24px}
  figure{margin:0;border:1px solid #2a3544;border-radius:6px;overflow:hidden;background:#0e1218}
  img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover;object-position:top}
  figcaption{padding:6px 8px;font-size:11px;color:#38bdf8}
  </style></head><body>
  <h1>MetroForge — Current UI Overview (principal screens)</h1>
  <div class="grid">
  ${principalFiles
    .map(
      (f) => `<figure><img src="file://${join(OUT, f).replace(/\\/g, '/')}"/><figcaption>${f}</figcaption></figure>`,
    )
    .join('\n')}
  </div></body></html>`;
  const contactPagePath = join(OUT, '_overview.html');
  writeFileSync(contactPagePath, contactHtml, 'utf8');

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const cpage = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    await cpage.goto(`file://${contactPagePath.replace(/\\/g, '/')}`);
    await sleep(1000);
    await cpage.screenshot({ path: OVERVIEW, fullPage: true });
    await browser.close();
    console.log(`Overview: ${OVERVIEW}`);
  } catch (err) {
    console.warn('Overview contact sheet skipped:', err instanceof Error ? err.message : err);
    missing.push({ file: 'metroforge-current-ui-overview.png', reason: String(err) });
  }

  await app.close();

  const manifest = {
    capturedAt: new Date().toISOString(),
    project: projectPath.replace(/C:\\Users\\[^\\]+/i, 'C:\\Users\\<user>'),
    resolution: primary.label,
    screenshots: records,
    missing,
  };
  writeFileSync(join(REPO, 'redesign-audit', 'capture-manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\nDone. ${records.length} screenshots. Missing notes: ${missing.length}`);
  if (missing.length) {
    for (const m of missing) console.log(`  - ${m.file}: ${m.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
