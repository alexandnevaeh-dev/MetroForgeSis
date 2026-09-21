import { createRequire } from 'node:module';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const desktop = join(root, 'apps', 'desktop');
const require = createRequire(join(desktop, 'package.json'));
const electron = process.env.METROFORGE_ELECTRON_EXECUTABLE || require('electron');
const reportDir = join(root, '.metroforge', 'desktop-smoke', String(Date.now()));
for (const directory of ['', 'temp', 'appdata', 'localappdata', 'data']) {
  mkdirSync(join(reportDir, directory), { recursive: true });
}
const logPath = join(reportDir, 'startup.log');
const fd = openSync(logPath, 'w');
let result;
try {
  result = spawnSync(electron, [desktop], {
    cwd: root,
    windowsHide: true,
    timeout: 30000,
    stdio: ['ignore', fd, fd],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined,
      VITE_DEV_SERVER_URL: undefined,
      METROFORGE_OPEN_DEVTOOLS: undefined,
      METROFORGE_DESKTOP_SMOKE: '1',
      TEMP: join(reportDir, 'temp'),
      TMP: join(reportDir, 'temp'),
      APPDATA: join(reportDir, 'appdata'),
      LOCALAPPDATA: join(reportDir, 'localappdata'),
      METROFORGE_DATA_DIR: join(reportDir, 'data'),
    },
  });
} finally {
  closeSync(fd);
}
const log = readFileSync(logPath, 'utf8');
const passed = result.status === 0 && log.includes('DESKTOP_SMOKE_PASS:');
writeFileSync(
  join(reportDir, 'result.json'),
  JSON.stringify(
    {
      passed,
      executable: electron,
      exitCode: result.status,
      signal: result.signal,
      error: result.error?.message,
      scope: 'Native production renderer load and normal version IPC reaching main',
      logPath,
    },
    null,
    2,
  ),
);
console.log(`${passed ? 'PASS' : 'FAIL'}: native desktop startup. Evidence: ${reportDir}`);
process.exitCode = passed ? 0 : 1;
