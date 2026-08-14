/**
 * Build metroforge-contact-sheet.png from existing CRITICAL screenshots.
 * Usage: node scripts/build-contact-sheet.mjs
 */
import { chromium } from 'playwright';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = process.cwd();
const OUT = join(REPO, 'docs', 'ui-audit', 'screenshots');
const CONTACT = join(REPO, 'docs', 'ui-audit', 'metroforge-contact-sheet.png');

const critical = [
  '00-app-shell.png',
  '01-create.png',
  '03-dashboard.png',
  '04-generation-studio-idle.png',
  '05-generation-studio-running.png',
  '08-asset-gallery.png',
  '09-asset-detail.png',
  '11-world-editor.png',
  '12-world-progression.png',
  '13-room-editor.png',
  '18-routing-inspector.png',
  '19-qa.png',
  '21-settings.png',
  '22-goto-palette.png',
].filter((f) => existsSync(join(OUT, f)));

const html = `<!DOCTYPE html><html><body style="margin:0;background:#07090c;color:#e8eef6;font-family:Segoe UI,sans-serif">
<h1 style="padding:16px;font-size:18px">MetroForge UI Audit — Critical contact sheet</h1>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px">
${critical
  .map((f) => {
    const src = join(OUT, f).replace(/\\/g, '/');
    return `<figure style="margin:0;border:1px solid #2a3544;border-radius:8px;overflow:hidden;background:#0e1218">
<img src="file:///${src}" style="width:100%;display:block;aspect-ratio:16/9;object-fit:cover;background:#000"/>
<figcaption style="padding:8px;font-size:11px;color:#38bdf8">${f}</figcaption>
</figure>`;
  })
  .join('')}
</div></body></html>`;

const htmlPath = join(OUT, '_contact.html');
writeFileSync(htmlPath, html, 'utf8');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 2600 } });
await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`);
await page.waitForTimeout(1200);
await page.screenshot({ path: CONTACT, fullPage: true });
await browser.close();
console.log(`Wrote ${CONTACT} (${critical.length} thumbnails)`);
