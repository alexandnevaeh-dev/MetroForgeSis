import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('metroforge', {
  getVersion: () => ipcRenderer.invoke('get-version') as Promise<string>,
  getConfig: () => ipcRenderer.invoke('get-config'),
  getAppSettings: () => ipcRenderer.invoke('get-app-settings') as Promise<Record<string, string>>,
  setAppSettings: (settings: Record<string, string>) =>
    ipcRenderer.invoke('set-app-settings', settings) as Promise<{ success: boolean; saved: Record<string, string> }>,
  runDoctor: () => ipcRenderer.invoke('run-doctor'),
  listProviders: () => ipcRenderer.invoke('list-providers'),
  listModels: (filter?: { capability?: string; installed?: boolean }) =>
    ipcRenderer.invoke('list-models', filter) as Promise<
      Array<
        import('@metroforge/schemas').ModelEntry & {
          routable?: boolean;
          providerEnabled?: boolean;
          liveListed?: boolean | null;
          downloadable?: boolean;
        }
      >
    >,
  downloadModel: (modelId: string) =>
    ipcRenderer.invoke('download-model', modelId) as Promise<{
      success: boolean;
      targetPath?: string;
      adapter?: string;
      message?: string;
      error?: string;
    }>,
  getHardwareProfile: () => ipcRenderer.invoke('get-hardware-profile'),
  scoutModels: (opts?: { benchmark?: boolean }) => ipcRenderer.invoke('scout-models', opts),
  rankModels: (capability: string) => ipcRenderer.invoke('rank-models', capability),
  listProjects: () => ipcRenderer.invoke('list-projects'),
  getProjectPreview: (projectPath: string) => ipcRenderer.invoke('get-project-preview', projectPath),
  getProjectDashboard: (projectPath: string) => ipcRenderer.invoke('get-project-dashboard', projectPath),
  getGenerationState: (projectPath: string) => ipcRenderer.invoke('get-generation-state', projectPath),
  getGenerationEvents: (projectPath: string, category?: string) =>
    ipcRenderer.invoke('get-generation-events', projectPath, category),
  listAssets: (projectPath: string) => ipcRenderer.invoke('list-assets', projectPath),
  getAssetPreview: (projectPath: string, relPath: string) =>
    ipcRenderer.invoke('get-asset-preview', projectPath, relPath),
  getAssetUsages: (projectPath: string, assetId: string) =>
    ipcRenderer.invoke('get-asset-usages', projectPath, assetId),
  getTilesetPreview: (projectPath: string, biomeId: string) =>
    ipcRenderer.invoke('get-tileset-preview', projectPath, biomeId),
  getAudioPreview: (projectPath: string, relPath: string) =>
    ipcRenderer.invoke('get-audio-preview', projectPath, relPath),
  generateAsset: (request: Record<string, unknown>) => ipcRenderer.invoke('generate-asset', request),
  listRooms: (projectPath: string) => ipcRenderer.invoke('list-rooms', projectPath),
  getRoom: (projectPath: string, roomId: string) => ipcRenderer.invoke('get-room', projectPath, roomId),
  updateRoom: (projectPath: string, patch: Record<string, unknown>) =>
    ipcRenderer.invoke('update-room', projectPath, patch),
  regenerateRoom: (projectPath: string, roomId: string, scope?: string) =>
    ipcRenderer.invoke('regenerate-room', projectPath, roomId, scope),
  getWorldGraph: (projectPath: string) => ipcRenderer.invoke('get-world-graph', projectPath),
  updateWorldGraph: (projectPath: string, command: unknown) =>
    ipcRenderer.invoke('update-world-graph', projectPath, command),
  undoWorldEdit: (projectPath: string) => ipcRenderer.invoke('undo-world-edit', projectPath),
  getEditHistory: (projectPath: string) => ipcRenderer.invoke('get-edit-history', projectPath),
  listGenerationQueue: () => ipcRenderer.invoke('list-generation-queue'),
  enqueueGeneration: (job: Record<string, unknown>) => ipcRenderer.invoke('enqueue-generation', job),
  cancelGenerationJob: (jobId: string) => ipcRenderer.invoke('cancel-generation-job', jobId),
  revealProjectFolder: (projectPath: string) =>
    ipcRenderer.invoke('reveal-project-folder', projectPath),
  openInGodot: (projectPath: string) =>
    ipcRenderer.invoke('open-in-godot', projectPath) as Promise<{ success: boolean; message: string }>,
  playInGodot: (projectPath: string) =>
    ipcRenderer.invoke('play-in-godot', projectPath) as Promise<{ success: boolean; message: string }>,
  generateGame: (opts: {
    prompt: string;
    profile: string;
    mode: string;
    seed: number;
    generationControl?: string;
  }) => ipcRenderer.invoke('generate-game', opts),
  onGenerationProgress: (
    callback: (data: { phase: string; status: string; message?: string }) => void,
  ) => {
    const handler = (_: unknown, data: { phase: string; status: string; message?: string }) =>
      callback(data);
    ipcRenderer.on('generation-progress', handler);
    return () => ipcRenderer.removeListener('generation-progress', handler);
  },
  onGenerationEvent: (callback: (event: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on('generation-event', handler);
    return () => ipcRenderer.removeListener('generation-event', handler);
  },
  onGenerationReviewPaused: (callback: (ctx: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on('generation-review-paused', handler);
    return () => ipcRenderer.removeListener('generation-review-paused', handler);
  },
  approveGenerationReview: (projectPath: string, approved: boolean) =>
    ipcRenderer.invoke('approve-generation-review', projectPath, approved),
  getGenerationReviewState: (projectPath: string) =>
    ipcRenderer.invoke('get-generation-review-state', projectPath),
  getPreviewReadiness: (projectPath: string) =>
    ipcRenderer.invoke('get-preview-readiness', projectPath),
  getConcurrencyStatus: () => ipcRenderer.invoke('get-concurrency-status'),
  getAssetHistory: (projectPath: string, assetId: string) =>
    ipcRenderer.invoke('get-asset-history', projectPath, assetId),
  restoreAssetVersion: (projectPath: string, assetId: string, version: number) =>
    ipcRenderer.invoke('restore-asset-version', projectPath, assetId, version),
  executeAiCommand: (projectPath: string, input: string, selectedRoomId?: string) =>
    ipcRenderer.invoke('execute-ai-command', projectPath, input, selectedRoomId),
  transcribeSpeech: (wavBase64: string) =>
    ipcRenderer.invoke('transcribe-speech', wavBase64) as Promise<{
      success: boolean;
      text?: string;
      error?: string;
    }>,
  getEditStatus: (projectPath: string) => ipcRenderer.invoke('get-edit-status', projectPath),
  getValidationResults: (projectPath: string) =>
    ipcRenderer.invoke('get-validation-results', projectPath),
  createProjectCheckpoint: (projectPath: string, label: string) =>
    ipcRenderer.invoke('create-project-checkpoint', projectPath, label),
  listProjectCheckpoints: (projectPath: string) =>
    ipcRenderer.invoke('list-project-checkpoints', projectPath),
  restoreProjectCheckpoint: (projectPath: string, checkpointId: string) =>
    ipcRenderer.invoke('restore-project-checkpoint', projectPath, checkpointId),
  getAssetVersionPreview: (projectPath: string, backupRelPath: string) =>
    ipcRenderer.invoke('get-asset-version-preview', projectPath, backupRelPath),
  exportProject: (projectPath: string, opts?: { force?: boolean; zip?: boolean; commercialSafe?: boolean }) =>
    ipcRenderer.invoke('export-project', projectPath, opts),
  refreshProjectTemplate: (projectPath: string) =>
    ipcRenderer.invoke('refresh-project-template', projectPath) as Promise<{
      success: boolean;
      copied: string[];
      removed: string[];
      errors: string[];
    }>,
  runProjectAcceptance: (projectPath: string, opts?: { skipRuntime?: boolean }) =>
    ipcRenderer.invoke('run-project-acceptance', projectPath, opts) as Promise<{
      report: { accepted: boolean; blockers: string[] };
      formatted: string;
    }>,
});
