export type EditDirtyState = 'CLEAN' | 'DIRTY' | 'COMPILING';

export interface ProjectEditStatus {
  state: EditDirtyState;
  label?: string;
  updatedAt: string;
}

const statusByProject = new Map<string, ProjectEditStatus>();

export function markProjectDirty(projectPath: string, label?: string): void {
  statusByProject.set(projectPath, {
    state: 'DIRTY',
    label,
    updatedAt: new Date().toISOString(),
  });
}

export function markProjectCompiling(projectPath: string, label?: string): void {
  statusByProject.set(projectPath, {
    state: 'COMPILING',
    label,
    updatedAt: new Date().toISOString(),
  });
}

export function markProjectClean(projectPath: string): void {
  statusByProject.set(projectPath, {
    state: 'CLEAN',
    updatedAt: new Date().toISOString(),
  });
}

export function getProjectEditStatus(projectPath: string): ProjectEditStatus {
  return (
    statusByProject.get(projectPath) ?? {
      state: 'CLEAN',
      updatedAt: new Date().toISOString(),
    }
  );
}
