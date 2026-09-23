import { execFile } from 'node:child_process';

/** Import resources and register script classes before running a generated project. */
export async function prepareGodotGame(executable: string, projectPath: string, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(executable, ['--headless', '--editor', '--path', projectPath, '--import'], {
      windowsHide: true, signal,
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const output = `${stdout}\n${stderr}`;
      if (error || /(?:SCRIPT ERROR:|^ERROR:)/m.test(output)) {
        reject(new Error(`Game preparation failed. ${error?.message ?? ''}\n${output.slice(-6000)}`));
        return;
      }
      resolve();
    });
  });
}