/** Typed generation events consumed by desktop IPC, activity feeds, and live studio UI. */

export type GenerationEventCategory =
  | 'ALL'
  | 'AI'
  | 'ASSETS'
  | 'WORLD'
  | 'CODE'
  | 'GODOT'
  | 'QA'
  | 'ERROR';

export type GenerationEventType =
  | 'GenerationStarted'
  | 'PhaseStarted'
  | 'PhaseProgress'
  | 'PhaseCompleted'
  | 'TaskStarted'
  | 'TaskProgress'
  | 'ArtifactGenerated'
  | 'ArtifactValidated'
  | 'ArtifactRejected'
  | 'WorldGraphUpdated'
  | 'RoomGenerated'
  | 'QAStarted'
  | 'QAFailed'
  | 'RepairStarted'
  | 'RepairCompleted'
  | 'RuntimeValidationStarted'
  | 'RuntimeValidationCompleted'
  | 'GenerationCompleted'
  | 'GenerationFailed'
  | 'ReviewPauseStarted'
  | 'ReviewApproved'
  | 'Log';

export interface GenerationEventBase {
  type: GenerationEventType;
  timestamp: string;
  jobId?: string;
  projectSlug?: string;
  projectPath?: string;
  category?: GenerationEventCategory;
}

export interface GenerationStartedEvent extends GenerationEventBase {
  type: 'GenerationStarted';
  profile: string;
  mode: string;
  seed: number;
  prompt: string;
}

export interface PhaseStartedEvent extends GenerationEventBase {
  type: 'PhaseStarted';
  phase: string;
  status: string;
  message?: string;
}

export interface PhaseProgressEvent extends GenerationEventBase {
  type: 'PhaseProgress';
  phase: string;
  status: string;
  message?: string;
}

export interface PhaseCompletedEvent extends GenerationEventBase {
  type: 'PhaseCompleted';
  phase: string;
  status: string;
  message?: string;
}

export interface TaskStartedEvent extends GenerationEventBase {
  type: 'TaskStarted';
  phase: string;
  task: string;
  message?: string;
}

export interface TaskProgressEvent extends GenerationEventBase {
  type: 'TaskProgress';
  phase: string;
  task: string;
  current: number;
  total: number;
  message?: string;
}

export interface ArtifactGeneratedEvent extends GenerationEventBase {
  type: 'ArtifactGenerated';
  artifactId: string;
  path: string;
  assetType: string;
  provider: string;
  fallbackGenerated: boolean;
  critiquePassed?: boolean;
  critiqueScore?: number;
}

export interface ArtifactValidatedEvent extends GenerationEventBase {
  type: 'ArtifactValidated';
  artifactId: string;
  path: string;
  passed: boolean;
  score?: number;
}

export interface ArtifactRejectedEvent extends GenerationEventBase {
  type: 'ArtifactRejected';
  artifactId: string;
  path: string;
  reason: string;
}

export interface WorldGraphUpdatedEvent extends GenerationEventBase {
  type: 'WorldGraphUpdated';
  roomCount: number;
  edgeCount: number;
  biomeCount: number;
}

export interface RoomGeneratedEvent extends GenerationEventBase {
  type: 'RoomGenerated';
  roomId: string;
  archetype?: string;
}

export interface QAStartedEvent extends GenerationEventBase {
  type: 'QAStarted';
  gate: string;
}

export interface QAFailedEvent extends GenerationEventBase {
  type: 'QAFailed';
  gate: string;
  message: string;
}

export interface RepairStartedEvent extends GenerationEventBase {
  type: 'RepairStarted';
  attempt: number;
  failedGates: string[];
}

export interface RepairCompletedEvent extends GenerationEventBase {
  type: 'RepairCompleted';
  attempt: number;
  passed: boolean;
  actions: string[];
}

export interface RuntimeValidationStartedEvent extends GenerationEventBase {
  type: 'RuntimeValidationStarted';
}

export interface RuntimeValidationCompletedEvent extends GenerationEventBase {
  type: 'RuntimeValidationCompleted';
  passed: boolean;
  message: string;
}

export interface GenerationCompletedEvent extends GenerationEventBase {
  type: 'GenerationCompleted';
  success: boolean;
  validationPassed: boolean;
  validationLevel?: string;
}

export interface GenerationFailedEvent extends GenerationEventBase {
  type: 'GenerationFailed';
  reason: string;
  phase?: string;
}

export interface ReviewPauseStartedEvent extends GenerationEventBase {
  type: 'ReviewPauseStarted';
  milestone: string;
  phase: string;
  message?: string;
}

export interface ReviewApprovedEvent extends GenerationEventBase {
  type: 'ReviewApproved';
  milestone: string;
  phase: string;
}

export interface LogEvent extends GenerationEventBase {
  type: 'Log';
  level: 'info' | 'warn' | 'error';
  message: string;
}

export type GenerationEvent =
  | GenerationStartedEvent
  | PhaseStartedEvent
  | PhaseProgressEvent
  | PhaseCompletedEvent
  | TaskStartedEvent
  | TaskProgressEvent
  | ArtifactGeneratedEvent
  | ArtifactValidatedEvent
  | ArtifactRejectedEvent
  | WorldGraphUpdatedEvent
  | RoomGeneratedEvent
  | QAStartedEvent
  | QAFailedEvent
  | RepairStartedEvent
  | RepairCompletedEvent
  | RuntimeValidationStartedEvent
  | RuntimeValidationCompletedEvent
  | GenerationCompletedEvent
  | GenerationFailedEvent
  | ReviewPauseStartedEvent
  | ReviewApprovedEvent
  | LogEvent;

export function categorizeEvent(event: GenerationEvent): GenerationEventCategory {
  if (event.type === 'GenerationFailed' || event.type === 'QAFailed' || event.type === 'ArtifactRejected') {
    return 'ERROR';
  }
  if (event.type === 'Log' && event.level === 'error') return 'ERROR';

  switch (event.type) {
    case 'ArtifactGenerated':
    case 'ArtifactValidated':
      return 'ASSETS';
    case 'WorldGraphUpdated':
    case 'RoomGenerated':
      return 'WORLD';
    case 'QAStarted':
    case 'RuntimeValidationStarted':
    case 'RuntimeValidationCompleted':
    case 'RepairStarted':
    case 'RepairCompleted':
      return 'QA';
    case 'PhaseStarted':
    case 'PhaseProgress':
    case 'PhaseCompleted': {
      const phase = 'phase' in event ? event.phase : '';
      if (phase === 'game_dna' || phase === 'design_bible') return 'AI';
      if (phase === 'environment_assets' || phase === 'audio') return 'ASSETS';
      if (phase.startsWith('world') || phase === 'progression_graph') return 'WORLD';
      if (phase === 'project_assembly') return 'GODOT';
      if (phase.includes('validation') || phase.includes('repair') || phase === 'final_qa') return 'QA';
      if (phase === 'export') return 'ALL';
      return 'ALL';
    }
    case 'TaskStarted':
    case 'TaskProgress':
      return event.phase === 'environment_assets' ? 'ASSETS' : 'ALL';
    case 'GenerationStarted':
      return 'AI';
    case 'ReviewPauseStarted':
    case 'ReviewApproved':
      return 'ALL';
    case 'GenerationCompleted':
      return 'ALL';
    default:
      return 'ALL';
  }
}

export function withCategory(event: GenerationEvent): GenerationEvent {
  return { ...event, category: categorizeEvent(event) };
}

export function formatActivityMessage(event: GenerationEvent): string {
  const time = new Date(event.timestamp).toLocaleTimeString();
  switch (event.type) {
    case 'GenerationStarted':
      return `${time} — Generation started (${event.profile}, seed ${event.seed})`;
    case 'PhaseStarted':
      return `${time} — Phase ${event.phase}: ${event.status}${event.message ? ` — ${event.message}` : ''}`;
    case 'PhaseCompleted':
      return `${time} — Phase ${event.phase} ${event.status}${event.message ? ` — ${event.message}` : ''}`;
    case 'TaskStarted':
      return `${time} — ${event.message ?? event.task}`;
    case 'TaskProgress':
      return `${time} — ${event.message ?? `${event.task} (${event.current}/${event.total})`}`;
    case 'ArtifactGenerated':
      return `${time} — Artifact generated: ${event.artifactId} (${event.provider})`;
    case 'ArtifactValidated':
      return `${time} — ${event.artifactId} QA ${event.passed ? 'passed' : 'failed'}`;
    case 'ArtifactRejected':
      return `${time} — ${event.artifactId} rejected: ${event.reason}`;
    case 'WorldGraphUpdated':
      return `${time} — World graph: ${event.roomCount} rooms, ${event.edgeCount} edges`;
    case 'RoomGenerated':
      return `${time} — Room assembled: ${event.roomId}`;
    case 'QAStarted':
      return `${time} — QA started: ${event.gate}`;
    case 'QAFailed':
      return `${time} — QA failed: ${event.gate} — ${event.message}`;
    case 'RepairStarted':
      return `${time} — Repair attempt ${event.attempt} (${event.failedGates.join(', ')})`;
    case 'RepairCompleted':
      return `${time} — Repair ${event.passed ? 'succeeded' : 'failed'}`;
    case 'RuntimeValidationStarted':
      return `${time} — Godot runtime validation started`;
    case 'RuntimeValidationCompleted':
      return `${time} — Runtime validation: ${event.passed ? 'PASS' : 'FAIL'} — ${event.message}`;
    case 'GenerationCompleted':
      return `${time} — Generation ${event.success ? 'complete' : 'finished with errors'} (validation: ${event.validationPassed ? 'PASS' : 'FAIL'})`;
    case 'GenerationFailed':
      return `${time} — Generation failed: ${event.reason}`;
    case 'ReviewPauseStarted':
      return `${time} — Paused for review: ${event.milestone} (${event.phase})`;
    case 'ReviewApproved':
      return `${time} — Review approved: ${event.milestone}`;
    case 'Log':
      return `${time} — ${event.message}`;
    default:
      return `${time} — ${event.type}`;
  }
}
