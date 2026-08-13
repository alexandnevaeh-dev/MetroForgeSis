import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { StudioProject } from './metroforge-api.js';
import type { NavId } from './nav.js';

const STORAGE_KEY = 'metroforge.activeProjectPath';

export type GeneratorPrefill = {
  description?: string;
  assetType?: string;
  assetId?: string;
};

type StudioContextValue = {
  projects: StudioProject[];
  selectedPath: string;
  selectedProject?: StudioProject;
  hasActiveProject: boolean;
  setSelectedPath: (path: string) => void;
  refreshProjects: () => Promise<void>;
  navigate: (id: NavId) => void;
  focusRoomId: string;
  setFocusRoomId: (id: string) => void;
  openRoom: (roomId: string) => void;
  focusAssetId: string;
  openAsset: (assetId: string) => void;
  generatorPrefill: GeneratorPrefill | null;
  openGenerator: (prefill?: GeneratorPrefill) => void;
};

const StudioContext = createContext<StudioContextValue | null>(null);

function readStoredPath(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function StudioProvider({
  children,
  onNavigate,
}: {
  children: ReactNode;
  onNavigate: (id: NavId) => void;
}) {
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selectedPath, setSelectedPathState] = useState(readStoredPath);
  const [focusRoomId, setFocusRoomId] = useState('');
  const [focusAssetId, setFocusAssetId] = useState('');
  const [generatorPrefill, setGeneratorPrefill] = useState<GeneratorPrefill | null>(null);

  const setSelectedPath = useCallback((path: string) => {
    setSelectedPathState(path);
    try {
      if (path) sessionStorage.setItem(STORAGE_KEY, path);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage optional */
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    const list = (await window.metroforge?.listProjects()) ?? [];
    setProjects(list);
    setSelectedPathState((prev) => {
      if (prev && list.some((project) => project.path === prev)) return prev;
      const next = list[0]?.path ?? '';
      try {
        if (next) sessionStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage optional */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const openRoom = useCallback(
    (roomId: string) => {
      setFocusRoomId(roomId);
      onNavigate('Rooms');
    },
    [onNavigate],
  );

  const openAsset = useCallback(
    (assetId: string) => {
      setFocusAssetId(assetId);
      onNavigate('Assets');
    },
    [onNavigate],
  );

  const openGenerator = useCallback(
    (prefill?: GeneratorPrefill) => {
      setGeneratorPrefill(prefill ?? null);
      onNavigate('Generate Asset');
    },
    [onNavigate],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.path === selectedPath),
    [projects, selectedPath],
  );

  const hasActiveProject = Boolean(selectedProject);

  const value = useMemo(
    () => ({
      projects,
      selectedPath,
      selectedProject,
      hasActiveProject,
      setSelectedPath,
      refreshProjects,
      navigate: onNavigate,
      focusRoomId,
      setFocusRoomId,
      openRoom,
      focusAssetId,
      openAsset,
      generatorPrefill,
      openGenerator,
    }),
    [
      projects,
      selectedPath,
      selectedProject,
      hasActiveProject,
      setSelectedPath,
      refreshProjects,
      onNavigate,
      focusRoomId,
      openRoom,
      focusAssetId,
      openAsset,
      generatorPrefill,
      openGenerator,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error('useStudio must be used within StudioProvider');
  }
  return ctx;
}
