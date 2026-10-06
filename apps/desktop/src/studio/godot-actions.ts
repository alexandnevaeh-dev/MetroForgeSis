export async function openProjectInGodot(projectPath: string): Promise<string | null> {
  if (!window.metroforge?.openInGodot) return 'Desktop bridge unavailable';
  const result = await window.metroforge.openInGodot(projectPath);
  return result.success ? null : result.message;
}

export async function playGeneratedProject(projectPath: string): Promise<string | null> {
  if (!window.metroforge?.playProject) return 'Desktop bridge unavailable';
  try {
    const result = await window.metroforge.playProject(projectPath);
    return result.success ? null : result.message;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
