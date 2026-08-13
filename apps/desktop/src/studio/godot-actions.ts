export async function openProjectInGodot(projectPath: string): Promise<string | null> {
  if (!window.metroforge?.openInGodot) return 'Desktop bridge unavailable';
  const result = await window.metroforge.openInGodot(projectPath);
  return result.success ? null : result.message;
}

export async function playProjectInGodot(projectPath: string): Promise<string | null> {
  if (!window.metroforge?.playInGodot) return 'Desktop bridge unavailable';
  const result = await window.metroforge.playInGodot(projectPath);
  return result.success ? null : result.message;
}
