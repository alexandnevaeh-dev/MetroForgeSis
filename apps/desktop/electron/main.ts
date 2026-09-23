import { app, BrowserWindow, dialog } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDesktopSmoke, observeDesktopSmoke, failDesktopSmoke } from './desktop-smoke.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Set Electron's own Chromium storage before ready; APPDATA alone does not
// relocate Windows known-folder paths used by every Electron subsystem.
const desktopData = process.env.METROFORGE_DATA_DIR;
if (desktopData) {
  for (const name of ['userData', 'sessionData', 'crashDumps'] as const) {
    const directory = join(desktopData, 'electron', name);
    mkdirSync(directory, { recursive: true });
    app.setPath(name, directory);
  }
  app.setAppLogsPath(join(desktopData, 'electron', 'logs'));
}


/** Monorepo root — Electron's cwd is apps/desktop when launched via vite. */
function resolveRepoRoot(): string {
  return join(__dirname, '..', '..', '..');
}

function resolvePreloadPath(): string {
  const cjs = join(__dirname, 'preload.cjs');
  const mjs = join(__dirname, 'preload.mjs');
  const js = join(__dirname, 'preload.js');
  if (existsSync(cjs)) return cjs;
  if (existsSync(mjs)) return mjs;
  if (existsSync(js)) return js;
  return mjs;
}

function createWindow(): void {
  const win = new BrowserWindow({
    show: process.env.METROFORGE_DESKTOP_SMOKE !== '1',
    width: 1280,
    height: 800,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.webContents.once('did-finish-load', () => observeDesktopSmoke('renderer-loaded'));
  win.webContents.on('preload-error', (_event, _path, error) => failDesktopSmoke(error.message));
  win.webContents.on('render-process-gone', (_event, details) => failDesktopSmoke(details.reason));

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'));
  }

  if (process.env.METROFORGE_OPEN_DEVTOOLS) win.webContents.openDevTools({ mode: 'detach' });
  win.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    console.error('did-fail-load', { code, description, validatedURL });
    failDesktopSmoke(description);
  });
  win.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
    console.log('renderer-console', { message, line, sourceId });
  });
}

startDesktopSmoke((success) => app.exit(success ? 0 : 1));
app
  .whenReady()
  .then(async () => {
    const { registerIpcHandlers } = await import('./handlers.js');
    registerIpcHandlers(resolveRepoRoot());
    createWindow();
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error('Desktop startup failed', message);
    if (process.env.METROFORGE_DESKTOP_SMOKE === '1') failDesktopSmoke(message);
    else dialog.showErrorBox('MetroForge could not start', message);
    app.exit(1);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
