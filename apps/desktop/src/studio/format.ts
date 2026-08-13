/** Browser-safe helpers duplicated from @metroforge/generation for the Electron renderer. */

export const GENERATION_PHASES = [
  'intake',
  'game_dna',
  'design_bible',
  'world_topology',
  'progression_graph',
  'enemy_families',
  'bosses',
  'quests',
  'npcs',
  'audio',
  'environment_assets',
  'project_assembly',
  'static_validation',
  'automated_repair',
  'final_qa',
  'export',
] as const;

export function phaseLabel(phase: string): string {
  return phase
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatActivityMessage(event: {
  type: string;
  timestamp: string;
  message?: string;
  [key: string]: unknown;
}): string {
  const time = new Date(event.timestamp).toLocaleTimeString();
  switch (event.type) {
    case 'GenerationStarted':
      return `${time} — Generation started (${event.profile}, seed ${event.seed})`;
    case 'PhaseStarted':
    case 'PhaseCompleted':
      return `${time} — Phase ${event.phase}: ${event.status}${event.message ? ` — ${event.message}` : ''}`;
    case 'TaskStarted':
      return `${time} — ${event.message ?? event.task}`;
    case 'TaskProgress':
      return `${time} — ${event.message ?? `${event.task} (${event.current}/${event.total})`}`;
    case 'ArtifactGenerated':
      return `${time} — Artifact generated: ${event.artifactId} (${event.provider})`;
    case 'WorldGraphUpdated':
      return `${time} — World graph: ${event.roomCount} rooms`;
    case 'RoomGenerated':
      return `${time} — Room assembled: ${event.roomId}`;
    case 'GenerationCompleted':
      return `${time} — Generation complete (validation: ${event.validationPassed ? 'PASS' : 'FAIL'})`;
    case 'GenerationFailed':
      return `${time} — Generation failed: ${event.reason}`;
    case 'ReviewPauseStarted':
      return `${time} — Paused for review: ${event.milestone}`;
    case 'ReviewApproved':
      return `${time} — Review approved: ${event.milestone}`;
    default:
      return `${time} — ${event.type}`;
  }
}
