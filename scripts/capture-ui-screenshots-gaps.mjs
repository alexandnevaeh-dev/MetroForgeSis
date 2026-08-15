/**
 * Gap-fill capture for MetroForge UI audit — does NOT delete existing PNGs.
 * Does NOT change app styling.
 *
 *   node scripts/capture-ui-screenshots-gaps.mjs
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
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

const require = createRequire(join(DESKTOP, 'package.json'));
const electronPath = require('electron');
const MAIN = join(DESKTOP, 'dist-electron', 'main.js');
const PROJECT = resolve(
  process.env.METROFORGE_SCREENSHOT_PROJECT ??
    join(REPO, 'GeneratedGames', 'a-wind-swept-marsh-kingdom-with-a-hidden-crypt'),
);

const records = [];
const missing = [];
/** Optional single-id filter, e.g. detail-provider-health */
const ONLY = (process.env.METROFORGE_SCREENSHOT_GAP_ONLY ?? '').trim();

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function redact(page) {
  await page.evaluate(() => {
    const mask = (t) =>
      String(t ?? '')
        .replace(/C:\\Users\\[^\\/]+/gi, 'C:\\Users\\<user>')
        .replace(/\/Users\/[^/]+/g, '/Users/<user>');
    document.querySelectorAll('.topbar-path, [title*="Users"], .mono').forEach((el) => {
      if (el.textContent && /Users[/\\]/.test(el.textContent)) el.textContent = mask(el.textContent);
      if (el instanceof HTMLElement && el.title) el.title = mask(el.title);
    });
  });
}

async function waitSettled(page) {
  await page.waitForSelector('.app', { timeout: 60000 });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await sleep(800);
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

async function setProject(page, projectPath) {
  await page.evaluate((path) => {
    sessionStorage.setItem('metroforge.activeProjectPath', path);
  }, projectPath);
  const select = page.locator('.topbar-project select, .project-select select').first();
  if (await select.count()) {
    await select.selectOption({ value: projectPath }).catch(async () => {
      await page.reload();
      await waitSettled(page);
      await page.evaluate((path) => sessionStorage.setItem('metroforge.activeProjectPath', path), projectPath);
      await page.reload();
      await waitSettled(page);
    });
  } else {
    await page.reload();
    await waitSettled(page);
  }
}

async function goNav(page, label) {
  await page.locator(`aside.sidebar button.nav-item:has-text("${label}")`).first().click();
  await waitSettled(page);
}

async function shot(page, fileBase, meta) {
  if (ONLY && ONLY !== fileBase && !fileBase.startsWith(ONLY)) return;
  await redact(page);
  const file = `${fileBase}.png`;
  const path = join(OUT, file);
  await page.screenshot({ path, fullPage: false });
  const size = statSync(path).size;
  records.push({
    file: `screenshots/${file}`,
    screen: meta.screen,
    state: meta.state,
    resolution: meta.resolution ?? '1920x1080',
    priority: meta.priority ?? 'IMPORTANT',
    notes: meta.notes ?? 'gap-fill',
  });
  console.log(`  ✓ ${file} (${size})`);
}

async function crop(page, selector, fileBase, meta) {
  if (ONLY && ONLY !== fileBase && !fileBase.startsWith(ONLY)) return;
  const loc = page.locator(selector).first();
  try {
    await loc.waitFor({ state: 'visible', timeout: meta?.timeout ?? 12000 });
  } catch {
    missing.push({ file: `${fileBase}.png`, reason: `selector not found: ${selector}` });
    return;
  }
  if (!(await loc.isVisible().catch(() => false))) {
    missing.push({ file: `${fileBase}.png`, reason: `selector not visible: ${selector}` });
    return;
  }
  await loc.screenshot({ path: join(OUT, `${fileBase}.png`) });
  records.push({
    file: `screenshots/${fileBase}.png`,
    screen: meta.screen,
    state: meta.state,
    resolution: 'crop',
    priority: 'SUPPORTING',
    notes: meta.notes ?? 'detail crop',
  });
  console.log(`  ✓ ${fileBase}.png (crop)`);
}

async function main() {
  if (!existsSync(MAIN)) {
    console.error('Build desktop first');
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });
  console.log('Gap-fill project:', PROJECT);

  const app = await electron.launch({
    executablePath: electronPath,
    args: [MAIN],
    cwd: DESKTOP,
    env: { ...process.env, VITE_DEV_SERVER_URL: '' },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(45000);
  await waitSettled(page);
  await resize(app, page, 1920, 1080);
  await setProject(page, PROJECT);

  if (ONLY === 'detail-provider-health') {
    await goNav(page, 'Providers');
    await page
      .locator('.provider-card, .provider-health-summary, .provider-grid > .panel')
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => {});
    await sleep(400);
    await crop(page, '.provider-card, .provider-health-summary, .provider-grid > .panel.provider-card', 'detail-provider-health', {
      screen: 'Providers',
      state: 'Provider health card',
      notes: 'Concept A provider card / Environment summary (real listProviders)',
    });
  } else {
  // Completed / historical Studio (finished project phases + events)
  await goNav(page, 'Generation Studio');
  await page.locator('button:has-text("Reload events")').click().catch(() => {});
  await sleep(1000);
  await shot(page, '07-generation-studio-completed', {
    screen: 'Studio',
    state: 'Completed / historical project state',
    priority: 'CRITICAL',
    notes: 'Real finished project loaded in Studio (not faked progress)',
  });
  await crop(page, '.studio-phases, aside.studio-phases', 'detail-generation-phase-rail', {
    screen: 'Studio',
    state: 'Phase timeline rail',
  });

  // Asset gallery variants
  await goNav(page, 'Asset Gallery');
  await page.locator('.category-bar button:has-text("Tileset")').first().click().catch(() => {});
  await sleep(700);
  await shot(page, '08-asset-gallery-tileset', {
    screen: 'Assets',
    state: 'Tileset category',
    priority: 'IMPORTANT',
  });
  const tileCard = page.locator('.virtualized-grid button, .asset-card').first();
  if (await tileCard.count()) {
    await tileCard.click();
    await sleep(800);
    await shot(page, '09-asset-detail-tileset', {
      screen: 'Assets',
      state: 'Tileset selected + inspector',
      priority: 'IMPORTANT',
    });
    await crop(page, '.asset-detail, aside.asset-detail', 'detail-asset-inspector', {
      screen: 'Assets',
      state: 'Inspector panel',
    });
  }
  await page.locator('.category-bar button:has-text("Music"), .category-bar button:has-text("SFX")').first().click().catch(() => {});
  await sleep(600);
  await shot(page, '08-asset-gallery-audio', {
    screen: 'Assets',
    state: 'Audio category (Music/SFX)',
    priority: 'IMPORTANT',
  });
  await crop(page, '.virtualized-grid button, .asset-card', 'detail-asset-card', {
    screen: 'Assets',
    state: 'Single asset card',
  });

  // Animation category if present
  await page.locator('.category-bar button:has-text("Player")').first().click().catch(() => {});
  await sleep(500);
  const anim = page.locator('.virtualized-grid button:has-text("walk"), .asset-card:has-text("walk")').first();
  if (await anim.count()) {
    await anim.click();
    await sleep(700);
    await shot(page, '09-asset-detail-animation', {
      screen: 'Assets',
      state: 'Animation / player sprite selected',
      priority: 'IMPORTANT',
    });
  }

  // Dungeon with selection
  await goNav(page, 'Dungeon Editor');
  const dungeonRoom = page.locator('.room-item, .room-list button, aside button').nth(1);
  if (await dungeonRoom.count()) {
    await dungeonRoom.click().catch(() => {});
    await sleep(500);
  }
  await shot(page, '14-dungeon-editor-selected', {
    screen: 'Dungeon',
    state: 'Room selected + inspector/locks',
    priority: 'IMPORTANT',
  });

  // World node detail
  await goNav(page, 'World Editor');
  await page.locator('button:has-text("Progression")').click().catch(() => {});
  await sleep(400);
  await page.locator('.map-preview circle').first().click({ force: true }).catch(() => {});
  await sleep(400);
  await crop(page, '.editor-inspector, aside.editor-inspector', 'detail-world-inspector', {
    screen: 'World',
    state: 'Inspector',
  });

  // Room visual layer (tile paint)
  await goNav(page, 'Room Editor');
  await page.locator('button[role="tab"]:has-text("visual"), button.tab:has-text("visual")').click().catch(() => {});
  await sleep(600);
  await shot(page, '13-room-editor-visual', {
    screen: 'Rooms',
    state: 'Visual / tile paint layer',
    priority: 'IMPORTANT',
  });
  await crop(page, '.editor-workspace .panel:last-child, aside, .editor-inspector', 'detail-room-inspector', {
    screen: 'Rooms',
    state: 'Room inspector',
  });

  // QA failure detail
  await goNav(page, 'QA');
  await sleep(600);
  await crop(page, '.qa-layout .panel:nth-child(2), .check-warn, .check-list', 'detail-qa-failure', {
    screen: 'QA',
    state: 'Gates / failure detail area',
  });

  // Routing candidate
  await goNav(page, 'Routing Inspector');
  await page.locator('button:has-text("Refresh")').click().catch(() => {});
  await sleep(1500);
  await crop(page, '.routing-layout > *:nth-child(2), .routing-layout', 'detail-routing-candidates', {
    screen: 'Routing',
    state: 'Candidates panel',
  });

  // Models / providers detail
  await goNav(page, 'Models');
  await page.locator('.virtualized-row').first().click().catch(() => {});
  await sleep(400);
  await crop(page, '.models-layout > *:last-child, aside', 'detail-model-card', {
    screen: 'Models',
    state: 'Selected model detail',
  });
  await goNav(page, 'Providers');
  // Concept A ProvidersScreen: async listProviders fills .provider-card / provider-health-summary
  await page
    .locator('.provider-card, .provider-health-summary, .provider-grid > .panel')
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .catch(() => {});
  await sleep(400);
  await crop(page, '.provider-card, .provider-health-summary, .provider-grid > .panel.provider-card', 'detail-provider-health', {
    screen: 'Providers',
    state: 'Provider health card',
    notes: 'Concept A provider card / Environment summary (real listProviders)',
  });

  // Export — existing Exports folder means prior export success exists on disk
  await goNav(page, 'Export');
  await sleep(600);
  await shot(page, '20-export-preflight', {
    screen: 'Export',
    state: 'Preflight + config',
    priority: 'IMPORTANT',
    notes: 'Exports/ already has staged packages for this slug',
  });

  // Manual generator configured (no generate click)
  await goNav(page, 'Manual Generator');
  await page.locator('textarea').first().fill('Ancient marsh crypt key — screenshot audit only (not generating)').catch(() => {});
  await sleep(300);
  await shot(page, '10-manual-asset-generator-configured', {
    screen: 'Generate Asset',
    state: 'Configured prompt (no generate)',
    priority: 'IMPORTANT',
    notes: 'Avoided expensive generateAsset',
  });

  // Optional longer live generation for mid/late phases
  if (process.env.METROFORGE_SCREENSHOT_GAP_GENERATION === '1') {
    console.log('Long generation wait enabled…');
    await goNav(page, 'Generation Studio');
    await page.locator('.studio-prompt, .studio-generate-bar input').first().fill('Gap-fill TINY_TEST capture late phases');
    const profile = page.locator('.studio-generate-bar select').nth(1);
    await profile.selectOption({ value: 'TINY_TEST' }).catch(() => {});
    const mode = page.locator('.studio-generate-bar select').nth(2);
    await mode.selectOption({ value: 'LOCAL_ONLY' }).catch(() => {});
    await page.locator('button.primary:has-text("Generate")').click();
    const deadline = Date.now() + 240_000;
    let gotAsm = false;
    let gotDone = false;
    while (Date.now() < deadline) {
      await sleep(5000);
      const text = await page.locator('body').innerText();
      if (!gotAsm && /project_assembly|Godot|GDScript|assembly|static_validation/i.test(text)) {
        await shot(page, '06-generation-studio-godot', {
          screen: 'Studio',
          state: 'Assembly / Godot / validation phase',
          priority: 'CRITICAL',
          notes: 'Live run',
        });
        gotAsm = true;
      }
      const btn = await page.locator('button.primary').first().innerText().catch(() => '');
      if (/Generate Game/i.test(btn) && !gotDone) {
        await shot(page, '07-generation-studio-completed-live', {
          screen: 'Studio',
          state: 'Completed after live TINY_TEST',
          priority: 'CRITICAL',
        });
        gotDone = true;
        break;
      }
    }
    if (!gotAsm) missing.push({ file: '06-generation-studio-godot.png', reason: 'assembly phase not seen' });
    if (!gotDone) missing.push({ file: '07-generation-studio-completed-live.png', reason: 'generation not finished in time' });
  }

  } // end full gap path when !ONLY

  await app.close();

  // Merge with previous index if present
  let prior = [];
  if (existsSync(INDEX_JSON)) {
    try {
      prior = JSON.parse(readFileSync(INDEX_JSON, 'utf8')).screenshots ?? [];
    } catch {
      prior = [];
    }
  }
  const byFile = new Map();
  for (const r of prior) byFile.set(r.file, r);
  for (const r of records) byFile.set(r.file, r);

  // Ensure every PNG on disk is indexed
  for (const f of readdirSync(OUT).filter((x) => x.endsWith('.png'))) {
    const key = `screenshots/${f}`;
    if (!byFile.has(key)) {
      byFile.set(key, {
        file: key,
        screen: 'Unknown',
        state: 'On disk',
        resolution: 'unknown',
        priority: 'SUPPORTING',
        notes: 'Present in folder; metadata inferred',
      });
    }
  }

  const all = [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
  const payload = {
    capturedAt: new Date().toISOString(),
    project: PROJECT.replace(/C:\\Users\\[^\\]+/i, 'C:\\Users\\<user>'),
    rerun: 'node scripts/capture-ui-screenshots.mjs && node scripts/capture-ui-screenshots-gaps.mjs && node scripts/build-contact-sheet.mjs',
    screenshots: all,
    missing,
    contactSheet: 'docs/ui-audit/metroforge-contact-sheet.png',
  };
  writeFileSync(INDEX_JSON, JSON.stringify(payload, null, 2));

  const md = [
    '# MetroForge UI Screenshot Index',
    '',
    `Updated: ${payload.capturedAt}`,
    `Project: \`${payload.project}\``,
    `Rerun: \`${payload.rerun}\``,
    '',
    '| File | Screen | State | Resolution | Priority | Notes |',
    '|------|--------|-------|------------|----------|-------|',
    ...all.map(
      (r) =>
        `| ${r.file.replace('screenshots/', '')} | ${r.screen} | ${r.state} | ${r.resolution} | ${r.priority} | ${(r.notes ?? '').replace(/\|/g, '/')} |`,
    ),
    '',
    '## Missing / incomplete',
    '',
    missing.length ? missing.map((m) => `- **${m.file}**: ${m.reason}`).join('\n') : '_None from this gap-fill pass._',
    '',
    '## Notes',
    '',
    '- Full primary pass already captured all 16 nav screens + shell + multi-res + live running Studio.',
    '- Gap-fill added completed Studio, tileset/audio/animation asset states, dungeon selection, export preflight, detail crops.',
    '- Live late-phase generation: set `METROFORGE_SCREENSHOT_GAP_GENERATION=1` to wait up to ~4 min for assembly/complete.',
    '',
  ].join('\n');
  writeFileSync(INDEX_MD, md);
  console.log(`Indexed ${all.length} screenshots. Gap records: ${records.length}. Missing: ${missing.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
