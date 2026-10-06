/** Opt-in native startup check. Observes the real renderer and its normal version IPC. */
const observed = new Set<string>();
let finish: ((success: boolean) => void) | undefined;
let deadline: ReturnType<typeof setTimeout> | undefined;

export function startDesktopSmoke(done: (success: boolean) => void): void {
  if (process.env.METROFORGE_DESKTOP_SMOKE !== '1') return;
  finish = done;
  deadline = setTimeout(
    () => failDesktopSmoke('Timed out waiting for renderer load and version IPC'),
    20000,
  );
}

export function observeDesktopSmoke(event: 'renderer-loaded' | 'version-ipc' | 'project-preview'): void {
  if (!finish) return;
  observed.add(event);
  if (observed.has('renderer-loaded') && observed.has('version-ipc') &&
      (!process.env.METROFORGE_DESKTOP_SMOKE_PROJECT || observed.has('project-preview'))) {
    if (deadline) clearTimeout(deadline);
    const done = finish;
    finish = undefined;
    console.log(
      'DESKTOP_SMOKE_PASS: production renderer loaded and normal version IPC reached main' +
      (observed.has('project-preview') ? '; project listing and preview IPC verified' : ''),
    );
    setTimeout(() => done(true), 100);
  }
}

export function failDesktopSmoke(message: string): void {
  if (!finish) return;
  if (deadline) clearTimeout(deadline);
  const done = finish;
  finish = undefined;
  console.error(`DESKTOP_SMOKE_FAIL: ${message}`);
  done(false);
}
