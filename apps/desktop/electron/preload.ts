import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('metroforge', {
  getVersion: () => ipcRenderer.invoke('get-version') as Promise<string>,
  getConfig: () => ipcRenderer.invoke('get-config'),
  runDoctor: () => ipcRenderer.invoke('run-doctor'),
  listProviders: () => ipcRenderer.invoke('list-providers'),
  listModels: (filter?: { capability?: string; installed?: boolean }) =>
    ipcRenderer.invoke('list-models', filter),
  getHardwareProfile: () => ipcRenderer.invoke('get-hardware-profile'),
  scoutModels: (opts?: { benchmark?: boolean }) => ipcRenderer.invoke('scout-models', opts),
  rankModels: (capability: string) => ipcRenderer.invoke('rank-models', capability),
  listProjects: () => ipcRenderer.invoke('list-projects'),
  generateGame: (opts: {
    prompt: string;
    profile: string;
    mode: string;
    seed: number;
  }) => ipcRenderer.invoke('generate-game', opts),
  onGenerationProgress: (
    callback: (data: { phase: string; status: string; message?: string }) => void,
  ) => {
    const handler = (_: unknown, data: { phase: string; status: string; message?: string }) =>
      callback(data);
    ipcRenderer.on('generation-progress', handler);
    return () => ipcRenderer.removeListener('generation-progress', handler);
  },
});
