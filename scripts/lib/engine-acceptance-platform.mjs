import { dirname, join } from 'node:path';

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
