import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from './handlers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Monorepo root — Electron's cwd is apps/desktop when launched via vite. */
function resolveRepoRoot(): string {
  return join(__dirname, '..', '..', '..');
}

function resolvePreloadPath(): string {
  const mjs = join(__dirname, 'preload.mjs');
  const js = join(__dirname, 'preload.js');
  if (existsSync(mjs)) return mjs;
  if (existsSync(js)) return js;
  return mjs;
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers(resolveRepoRoot());
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
