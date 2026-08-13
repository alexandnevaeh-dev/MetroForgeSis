import type { LoadedProject } from './project-loader.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface PreviewReadiness {
  ready: boolean;
  reasons: string[];
  missing: string[];
}

export function assessPreviewReadiness(project: LoadedProject): PreviewReadiness {
  const missing: string[] = [];
  const reasons: string[] = [];

  if (!existsSync(join(project.projectPath, 'project.godot'))) {
    missing.push('project.godot');
  }
  if (project.roomIds.length === 0) {
    missing.push('rooms');
  } else {
    reasons.push(`${project.roomIds.length} rooms`);
  }
  if (!existsSync(join(project.projectPath, 'assets', 'characters', 'player.png'))) {
    missing.push('player sprite');
  } else {
    reasons.push('player sprite');
  }
  if (!existsSync(join(project.projectPath, 'scenes', 'rooms', `${project.roomIds[0]}.tscn`))) {
    missing.push('room scenes');
  } else {
    reasons.push('room scenes');
  }

  const ready = missing.length === 0;
  return { ready, reasons, missing };
}
