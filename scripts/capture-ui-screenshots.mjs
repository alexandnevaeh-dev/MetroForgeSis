/**
 * MetroForge desktop UI screenshot audit capture.
 * Launches the built Electron app via Playwright — no styling changes.
 *
 * Usage (from repo root):
 *   node scripts/capture-ui-screenshots.mjs
 *
 * Optional:
 *   METROFORGE_SCREENSHOT_PROJECT=<absolute-or-relative-project-path>
 *   METROFORGE_SCREENSHOT_SKIP_GENERATION=1
 *   METROFORGE_SCREENSHOT_RESOLUTIONS=1920x1080,1366x768
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const DESKTOP = join(REPO, 'apps', 'desktop');
const OUT = join(REPO, 'docs', 'ui-audit', 'screenshots');
const INDEX_MD = join(REPO, 'docs', 'ui-audit', 'SCREENSHOT_INDEX.md');
const INDEX_JSON = join(REPO, 'docs', 'ui-audit', 'SCREENSHOT_INDEX.json');
const CONTACT = join(REPO, 'docs', 'ui-audit', 'metroforge-contact-sheet.png');

const require = createRequire(join(DESKTOP, 'package.json'));
const electronPath = require('electron');

const MAIN = join(DESKTOP, 'dist-electron', 'main.js');
const DEFAULT_PROJECT = join(
  REPO,
  'GeneratedGames',
  'a-wind-swept-marsh-kingdom-with-a-hidden-crypt',
);

const NAV = [
  { id: 'Dashboard', label: 'Dashboard', file: '03-dashboard' },
  { id: 'Create', label: 'New Game', file: '01-create' },
  { id: 'Studio', label: 'Generation Studio', file: '04-generation-studio' },
  { id: 'Projects', label: 'Projects', file: '02-projects' },
  { id: 'Assets', label: 'Asset Gallery', file: '08-asset-gallery' },
  { id: 'Generate Asset', label: 'Manual Generator', file: '10-manual-asset-generator' },
  { id: 'World', label: 'World Editor', file: '11-world-editor' },
  { id: 'Rooms', label: 'Room Editor', file: '13-room-editor' },
  { id: 'Dungeon', label: 'Dungeon Editor', file: '14-dungeon-editor' },
  { id: 'Preview', label: 'Game Preview', file: '15-game-preview' },
  { id: 'Models', label: 'Models', file: '16-models' },
  { id: 'Providers', label: 'Providers', file: '17-providers' },
  { id: 'Routing', label: 'Routing Inspector', file: '18-routing-inspector' },
  { id: 'QA', label: 'QA', file: '19-qa' },
  { id: 'Export', label: 'Export', file: '20-export' },
  { id: 'Settings', label: 'Settings', file: '21-settings' },
];

const CRITICAL = new Set([
  '01-create',
  '03-dashboard',
  '04-generation-studio',
  '08-asset-gallery',
  '11-world-editor',
  '13-room-editor',
  '18-routing-inspector',
  '19-qa',
  '21-settings',
]);

const EXTRA_RESOLUTIONS = (process.env.METROFORGE_SCREENSHOT_RESOLUTIONS ?? '1920x1080,1600x900,1440x900,1366x768')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [w, h] = s.split('x').map(Number);
    return { w, h, label: `${w}x${h}` };
  });

const records = [];
const missing = [];

function parseSize(label) {
  const [w, h] = label.split('x').map(Number);
  return { w, h };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function redactPaths(page) {
  await page.evaluate(() => {
    const mask = (text) =>
      String(text ?? '')
        .replace(/C:\\Users\\[^\\/]+/gi, 'C:\\Users\\<user>')
        .replace(/\/Users\/[^/]+/g, '/Users/<user>');
    document.querySelectorAll('.topbar-path, .mono, code, .project-select select option').forEach((el) => {
      if (el instanceof HTMLOptionElement) {
        // keep option labels (titles), only mask path attributes if any
        return;
      }
      if (el.textContent && /Users[/\\]/.test(el.textContent)) {
        el.textContent = mask(el.textContent);
      }
      if (el instanceof HTMLElement && el.title && /Users[/\\]/.test(el.title)) {
        el.title = mask(el.title);
      }
    });
    // Hide any input that looks like an API key field
    document.querySelectorAll('input[type="password"], input[name*="key" i], input[id*="key" i]').forEach((el) => {
      if (el instanceof HTMLInputElement) el.value = el.value ? '••••••••' : '';
    });
  });
}

async function waitSettled(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('.app', { timeout: 60000 });
  // Let React paint + IPC settle
  await sleep(700);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await sleep(400);
}

async function setProject(page, projectPath) {
  await page.evaluate((path) => {
    try {
      sessionStorage.setItem('metroforge.activeProjectPath', path);
    } catch {
      /* ignore */
    }
  }, projectPath);
  // Prefer UI select if present
  const select = page.locator('.topbar-project select, .project-select select').first();
  if (await select.count()) {
    try {
      await select.selectOption({ value: projectPath });
    } catch {
      // Fallback: reload so StudioContext reads sessionStorage
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
  await sleep(350);
}

async function shot(page, fileBase, meta) {
  await redactPaths(page);
  const file = `${fileBase}.png`;
  const path = join(OUT, file);
  await page.screenshot({ path, fullPage: false });
  const st = statSync(path);
  if (st.size < 8_000) {
    missing.push({ file, reason: 'file too small — likely blank' });
  }
  records.push({
    file: `screenshots/${file}`,
    screen: meta.screen,
    state: meta.state,
    resolution: meta.resolution,
    priority: meta.priority,
    notes: meta.notes ?? '',
  });
  console.log(`  ✓ ${file} (${st.size} bytes)`);
  return path;
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

async function main() {
  if (!existsSync(MAIN)) {
    console.error('Missing apps/desktop/dist-electron/main.js — run: pnpm --filter @metroforge/desktop build');
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  // Clear previous PNGs only (keep .gitkeep)
  for (const f of readdirSync(OUT)) {
    if (f.endsWith('.png')) {
      try {
        const { unlinkSync } = await import('node:fs');
        unlinkSync(join(OUT, f));
      } catch {
        /* ignore */
      }
    }
  }

  const projectPath = resolve(process.env.METROFORGE_SCREENSHOT_PROJECT ?? DEFAULT_PROJECT);
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
      // Ensure production renderer (no vite URL)
      VITE_DEV_SERVER_URL: '',
    },
  });

  const page = await app.firstWindow();
  page.setDefaultTimeout(45000);
  await waitSettled(page);

  // Close any unexpected dialogs
  page.on('dialog', async (d) => {
    await d.dismiss().catch(() => {});
  });

  const primary = EXTRA_RESOLUTIONS[0] ?? { w: 1920, h: 1080, label: '1920x1080' };
  await resize(app, page, primary.w, primary.h);
  await setProject(page, projectPath);

  // —— Shell ——
  await goNav(page, 'Dashboard');
  await shot(page, '00-app-shell', {
    screen: 'App Shell',
    state: 'Expanded sidebar + dashboard',
    resolution: primary.label,
    priority: 'CRITICAL',
    notes: 'Full window: topbar, nav, workspace, status',
  });

  // Collapsed sidebar
  await page.keyboard.press('Control+b');
  await sleep(400);
  await shot(page, '00-app-shell-collapsed', {
    screen: 'App Shell',
    state: 'Collapsed sidebar',
    resolution: primary.label,
    priority: 'IMPORTANT',
    notes: 'Ctrl+B icon rail',
  });
  await page.keyboard.press('Control+b');
  await sleep(300);

  // —— Every major screen ——
  for (const item of NAV) {
    console.log(`Screen: ${item.label}`);
    await goNav(page, item.label);
    const base = `${item.file}-${primary.label}`;
    // Also write canonical short name for primary resolution
    await shot(page, item.file, {
      screen: item.id,
      state: 'Default with active project',
      resolution: primary.label,
      priority: CRITICAL.has(item.file) ? 'CRITICAL' : 'IMPORTANT',
      notes: 'Full application window',
    });
    // Duplicate naming with resolution for critical only
    if (CRITICAL.has(item.file) && primary.label !== '1920x1080') {
      // already captured under short name
    }
  }

  // Extra resolutions for critical screens
  for (const res of EXTRA_RESOLUTIONS.slice(1)) {
    console.log(`Resolution pass: ${res.label}`);
    await resize(app, page, res.w, res.h);
    await setProject(page, projectPath);
    for (const item of NAV.filter((n) => CRITICAL.has(n.file))) {
      await goNav(page, item.label);
      await shot(page, `${item.file}-${res.label}`, {
        screen: item.id,
        state: 'Default with active project',
        resolution: res.label,
        priority: 'SUPPORTING',
        notes: 'Responsive check',
      });
    }
  }

  await resize(app, page, primary.w, primary.h);
  await setProject(page, projectPath);

  // —— GoTo palette ——
  await goNav(page, 'Dashboard');
  await page.keyboard.press('Control+k');
  await page.waitForSelector('.goto-palette, [aria-label="Go to"]', { timeout: 5000 }).catch(() => {});
  await sleep(300);
  await shot(page, '22-goto-palette', {
    screen: 'GoTo Palette',
    state: 'Open (Ctrl+K)',
    resolution: primary.label,
    priority: 'CRITICAL',
    notes: 'Command palette overlay',
  });
  await page.keyboard.press('Escape');
  await sleep(200);

  // —— World editor views ——
  await goNav(page, 'World Editor');
  await maybeClick(page, 'button.tab:has-text("Progression"), button:has-text("Progression")');
  await shot(page, '12-world-progression', {
    screen: 'World',
    state: 'Progression view',
    resolution: primary.label,
    priority: 'CRITICAL',
    notes: 'World graph progression layout',
  });
  await maybeClick(page, 'button.tab:has-text("Graph"), button:has-text("Graph")');
  await shot(page, '11-world-editor-graph', {
    screen: 'World',
    state: 'Graph view',
    resolution: primary.label,
    priority: 'IMPORTANT',
    notes: '',
  });
  await maybeClick(page, 'button.tab:has-text("Spatial"), button:has-text("overworld")');
  await shot(page, '11-world-editor-spatial', {
    screen: 'World',
    state: 'Spatial / overworld',
    resolution: primary.label,
    priority: 'IMPORTANT',
    notes: 'Uses getOverworldMap when available',
  });
  // Select a node if present
  const node = page.locator('.map-preview circle, .map-preview .map-node').first();
  if (await node.count()) {
    await node.click({ force: true }).catch(() => {});
    await sleep(400);
    await shot(page, '11-world-editor-selected', {
      screen: 'World',
      state: 'Room selected + inspector',
      resolution: primary.label,
      priority: 'IMPORTANT',
      notes: '',
    });
  }

  // —— Room editor layers ——
  await goNav(page, 'Room Editor');
  await maybeClick(page, 'button.tab:has-text("collision"), button[role="tab"]:has-text("collision")');
  await shot(page, '13-room-editor-collision', {
    screen: 'Rooms',
    state: 'Collision layer',
    resolution: primary.label,
    priority: 'IMPORTANT',
    notes: 'Occupancy / getRoomCollision',
  });
  await maybeClick(page, 'button.tab:has-text("entities"), button[role="tab"]:has-text("entities")');
  await shot(page, '13-room-editor-entities', {
    screen: 'Rooms',
    state: 'Entities layer',
    resolution: primary.label,
    priority: 'SUPPORTING',
    notes: '',
  });
  await maybeClick(page, 'button.tab:has-text("debug"), button[role="tab"]:has-text("debug")');
  await shot(page, '13-room-editor-debug', {
    screen: 'Rooms',
    state: 'Debug JSON',
    resolution: primary.label,
    priority: 'SUPPORTING',
    notes: '',
  });

  // —— Asset gallery: select first asset ——
  await goNav(page, 'Asset Gallery');
  const assetCard = page.locator('.asset-card, .virtualized-grid button').first();
  if (await assetCard.count()) {
    await assetCard.click();
    await sleep(600);
    await shot(page, '09-asset-detail', {
      screen: 'Assets',
      state: 'Asset selected + inspector',
      resolution: primary.label,
      priority: 'CRITICAL',
      notes: 'Real manifest asset',
    });
  } else {
    missing.push({ file: '09-asset-detail.png', reason: 'No asset cards found' });
  }
  // category tab if any
  await maybeClick(page, '.category-bar button.tab:has-text("Enemy"), .category-bar button:has-text("Tileset")');
  await shot(page, '08-asset-gallery-filtered', {
    screen: 'Assets',
    state: 'Category filter',
    resolution: primary.label,
    priority: 'IMPORTANT',
    notes: '',
  });

  // —— Models: select row ——
  await goNav(page, 'Models');
  const modelRow = page.locator('.virtualized-row, .models-table-panel button').first();
  if (await modelRow.count()) {
    await modelRow.click();
    await sleep(400);
    await shot(page, '16-models-selected', {
      screen: 'Models',
      state: 'Model selected',
      resolution: primary.label,
      priority: 'IMPORTANT',
      notes: 'No secrets',
    });
  }

  // —— Routing refresh ——
  await goNav(page, 'Routing Inspector');
  await maybeClick(page, 'button:has-text("Refresh routing"), button.primary');
  await sleep(1200);
  await shot(page, '18-routing-inspector-refreshed', {
    screen: 'Routing',
    state: 'After refresh',
    resolution: primary.label,
    priority: 'CRITICAL',
    notes: 'Real rankModels / explainModelRouting',
  });

  // —— Generation Studio idle + historical ——
  await goNav(page, 'Generation Studio');
  await shot(page, '04-generation-studio-idle', {
    screen: 'Studio',
    state: 'Idle / ready',
    resolution: primary.label,
    priority: 'CRITICAL',
    notes: 'Project selected; may show prior events',
  });

  // Detail crops (clip) — limited set
  const status = page.locator('.status-bar');
  if (await status.count()) {
    await status.screenshot({ path: join(OUT, 'detail-status-bar.png') });
    records.push({
      file: 'screenshots/detail-status-bar.png',
      screen: 'Status Bar',
      state: 'Detail crop',
      resolution: 'crop',
      priority: 'SUPPORTING',
      notes: '',
    });
  }
  const forgeBtn = page.locator('button.primary:has-text("Generate Game")').first();
  if (await forgeBtn.count()) {
    await forgeBtn.screenshot({ path: join(OUT, 'detail-forge-button.png') });
    records.push({
      file: 'screenshots/detail-forge-button.png',
      screen: 'Studio',
      state: 'Primary Generate button',
      resolution: 'crop',
      priority: 'SUPPORTING',
      notes: '',
    });
  }

  // —— Optional live generation (TINY_TEST) ——
  const skipGen = process.env.METROFORGE_SCREENSHOT_SKIP_GENERATION === '1';
  if (!skipGen) {
    console.log('Starting TINY_TEST generation for live Studio states…');
    await goNav(page, 'Generation Studio');
    const prompt = page.locator('.studio-prompt, input.studio-prompt, .studio-generate-bar input').first();
    if (await prompt.count()) {
      await prompt.fill('Screenshot audit TINY_TEST wind crypt — capture pass only');
      // profile / mode selects
      const profile = page.locator('.studio-generate-bar select').nth(1);
      if (await profile.count()) {
        await profile.selectOption({ label: 'TINY_TEST' }).catch(async () => {
          await profile.selectOption({ value: 'TINY_TEST' }).catch(() => {});
        });
      }
      const mode = page.locator('.studio-generate-bar select').nth(2);
      if (await mode.count()) {
        await mode.selectOption({ label: 'LOCAL_ONLY' }).catch(async () => {
          await mode.selectOption({ value: 'LOCAL_ONLY' }).catch(() => {});
        });
      }
      await page.locator('button.primary:has-text("Generate")').click();
      await sleep(1500);
      await shot(page, '05-generation-studio-running', {
        screen: 'Studio',
        state: 'Generation started / running',
        resolution: primary.label,
        priority: 'CRITICAL',
        notes: 'Real generateGame TINY_TEST LOCAL_ONLY',
      });

      // Poll for phase / artifact / QA for up to ~3 minutes
      const deadline = Date.now() + 180_000;
      let gotWorld = false;
      let gotAsset = false;
      let gotQa = false;
      while (Date.now() < deadline) {
        await sleep(4000);
        const body = await page.locator('body').innerText();
        if (!gotWorld && /world|World graph|RoomGenerated|WORLD/i.test(body)) {
          await shot(page, '06-generation-studio-world', {
            screen: 'Studio',
            state: 'World / graph activity',
            resolution: primary.label,
            priority: 'CRITICAL',
            notes: 'Captured during live run',
          });
          gotWorld = true;
        }
        if (!gotAsset && /Artifact|ASSET|sprite|tileset|provider/i.test(body)) {
          await maybeClick(page, 'button.tab:has-text("Artifact")');
          await shot(page, '06-generation-studio-assets', {
            screen: 'Studio',
            state: 'Asset / artifact activity',
            resolution: primary.label,
            priority: 'CRITICAL',
            notes: 'Captured during live run',
          });
          gotAsset = true;
        }
        if (!gotQa && /QA|Validation|final_qa|PASS|FAIL/i.test(body)) {
          await shot(page, '07-generation-studio-qa', {
            screen: 'Studio',
            state: 'QA / validation activity',
            resolution: primary.label,
            priority: 'CRITICAL',
            notes: 'Captured during live run',
          });
          gotQa = true;
        }
        if (/Generating…|Generate Game/.test(body) === false || /Generation complete|Idle|100%/.test(body)) {
          // button text restored => likely done
          const btnText = await page.locator('button.primary').first().innerText().catch(() => '');
          if (/Generate Game/i.test(btnText)) {
            await shot(page, '07-generation-studio-completed', {
              screen: 'Studio',
              state: 'Completed',
              resolution: primary.label,
              priority: 'CRITICAL',
              notes: 'Post-generation',
            });
            break;
          }
        }
      }
      if (!gotWorld) missing.push({ file: '06-generation-studio-world.png', reason: 'World phase not observed in time' });
      if (!gotAsset) missing.push({ file: '06-generation-studio-assets.png', reason: 'Asset phase not observed in time' });
      if (!gotQa) missing.push({ file: '07-generation-studio-qa.png', reason: 'QA phase not observed in time' });
    } else {
      missing.push({ file: '05-generation-studio-running.png', reason: 'Studio prompt input not found' });
    }
  } else {
    missing.push({ file: '05-generation-studio-running.png', reason: 'Skipped (METROFORGE_SCREENSHOT_SKIP_GENERATION=1)' });
  }

  // Contact sheet via Playwright page of thumbnails
  const criticalFiles = records
    .filter((r) => r.priority === 'CRITICAL' && r.file.endsWith('.png') && !r.file.includes('detail-'))
    .map((r) => r.file.replace(/^screenshots\//, ''));
  const uniqueCritical = [...new Set(criticalFiles)].slice(0, 24);
  const contactHtml = `<!DOCTYPE html><html><body style="margin:0;background:#07090c;color:#e8eef6;font-family:Segoe UI,sans-serif">
  <h1 style="padding:16px;font-size:18px">MetroForge UI Audit — Critical contact sheet</h1>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px">
  ${uniqueCritical
    .map(
      (f) => `<figure style="margin:0;border:1px solid #2a3544;border-radius:8px;overflow:hidden;background:#0e1218">
      <img src="file://${join(OUT, f).replace(/\\/g, '/')}" style="width:100%;display:block;aspect-ratio:16/9;object-fit:cover"/>
      <figcaption style="padding:8px;font-size:11px;color:#38bdf8">${f}</figcaption>
    </figure>`,
    )
    .join('')}
  </div></body></html>`;
  const contactPagePath = join(OUT, '_contact.html');
  writeFileSync(contactPagePath, contactHtml, 'utf8');

  // Use a separate chromium for contact sheet if available; else skip
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const cpage = await browser.newPage({ viewport: { width: 1600, height: 2200 } });
    await cpage.goto(`file://${contactPagePath.replace(/\\/g, '/')}`);
    await sleep(800);
    await cpage.screenshot({ path: CONTACT, fullPage: true });
    await browser.close();
    console.log(`Contact sheet: ${CONTACT}`);
  } catch (err) {
    console.warn('Contact sheet skipped:', err instanceof Error ? err.message : err);
    missing.push({ file: 'metroforge-contact-sheet.png', reason: String(err) });
  }

  await app.close();

  // Indexes
  const md = [
    '# MetroForge UI Screenshot Index',
    '',
    `Captured: ${new Date().toISOString()}`,
    `Project: \`${projectPath.replace(/C:\\Users\\[^\\]+/i, 'C:\\\\Users\\\\<user>')}\``,
    `Rerun: \`node scripts/capture-ui-screenshots.mjs\``,
    '',
    '| File | Screen | State | Resolution | Priority | Notes |',
    '|------|--------|-------|------------|----------|-------|',
    ...records.map(
      (r) =>
        `| ${r.file.replace('screenshots/', '')} | ${r.screen} | ${r.state} | ${r.resolution} | ${r.priority} | ${r.notes.replace(/\|/g, '/')} |`,
    ),
    '',
    '## Missing / incomplete',
    '',
    missing.length === 0
      ? '_None recorded._'
      : missing.map((m) => `- **${m.file}**: ${m.reason}`).join('\n'),
    '',
  ].join('\n');

  writeFileSync(INDEX_MD, md, 'utf8');
  writeFileSync(
    INDEX_JSON,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        project: projectPath.replace(/C:\\Users\\[^\\]+/i, 'C:\\Users\\<user>'),
        rerun: 'node scripts/capture-ui-screenshots.mjs',
        screenshots: records,
        missing,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`\nDone. ${records.length} screenshots indexed.`);
  console.log(`Index: ${INDEX_MD}`);
  if (missing.length) {
    console.log(`Missing notes: ${missing.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
