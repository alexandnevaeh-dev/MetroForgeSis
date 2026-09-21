import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { readFileSync, statSync } from 'node:fs';

export function nativeBuildPlan(platform, editorPath, projectPath) {
  const targets = {
    win32: { target: 'Win64', folders: [], script: 'Build.bat', unityMethod: 'BuildWindows' },
    darwin: { target: 'Mac', folders: ['Mac'], script: 'Build.sh', unityMethod: 'BuildMacOS' },
    linux: { target: 'Linux', folders: ['Linux'], script: 'Build.sh', unityMethod: 'BuildLinux' },
  };
  const selected = targets[platform];
  if (!selected) throw new Error(`Unsupported native build platform: ${platform}`);
  // Resolve from the actual editor binary, including the macOS app bundle.
  let engineRoot = editorPath;
  for (let i = 0; i < (platform === 'darwin' ? 7 : 4); i++) engineRoot = dirname(engineRoot);
  return {
    ...selected,
    command: join(engineRoot, 'Engine', 'Build', 'BatchFiles', ...selected.folders, selected.script),
    args: ['MetroForgeGameEditor', selected.target, 'Development', `-project=${join(projectPath, 'MetroForgeGame.uproject')}`],
  };
}

export function playtestPassed(exitCode, report, startedAt) {
  return exitCode === 0 && report !== null && report.modifiedAt >= startedAt && report.data?.status === 'PASS';
}

// Evidence availability only; a human still has to assess visual quality.
export function freshCaptureEvidence(report, startedAt, captureRoot) {
  if (!report || report.modifiedAt < startedAt || !Array.isArray(report.data?.captures) || report.data.captures.length === 0) return false;
  const root = resolve(captureRoot);
  return report.data.captures.every((file) => {
    if (typeof file !== 'string') return false;
    const path = resolve(file);
    const child = relative(root, path);
    if (!child || child === '..' || child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(child)) return false;
    try {
      const stat = statSync(path);
      if (!stat.isFile() || stat.mtimeMs < startedAt || stat.size < 24) return false;
      const bytes = readFileSync(path);
      return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) >= 8 && bytes.readUInt32BE(20) >= 8;
    } catch { return false; }
  });
}

export function gameplayComplete(report) {
  const required = ['traversal', 'containment', 'combat', 'abilities', 'gates',
    'npc_interaction', 'save_continue', 'respawn', 'boss_phases', 'victory'];
  return required.every((feature) => report?.features?.[feature] === 'passed') &&
    Object.values(report?.features ?? {}).every((result) => result === 'passed') &&
    Array.isArray(report?.notImplemented) && report.notImplemented.length === 0;
}
